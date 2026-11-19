import { useEffect, useRef, useState, type Ref } from "react";
import { shake } from "../animation/a9";
import { sfx } from "../audio/sfx";
import { Field } from "../components/Field";
import type { LegendState } from "../components/LegendPanel";
import { LastScanCard } from "../components/LastScanCard";
import { WatchRail } from "../components/WatchRail";
import { NumberField } from "../components/NumberField";
import { searchSymbols, type SymbolMatch } from "../lib/api";
import { useClock, useMarketState } from "../lib/clock";
import { freshness, stampLabel } from "../lib/freshness";
import { getRandomInt, parseNumber, scoreToClass } from "../lib/numbers";
import type { RecentScan } from "../lib/recentScans";
import { useSettings } from "../lib/settings";
import type { StockData, WatchItem } from "../lib/types";
import { agoLabel, useNow, type Watchlist } from "../lib/watchlist";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { Glint } from "../ui/Glint";
import { SearchIcon, TimerIcon } from "../ui/Icons";
import { Reveal } from "../ui/Reveal";
import { RevealText } from "../ui/RevealText";
import { Segmented } from "../ui/Segmented";
import { SectionTitle } from "../ui/SectionTitle";

interface StartPageProps {
  screenRef: Ref<HTMLElement>;
  active: boolean;
  buyButtonsEnabled: boolean;
  dryRun: boolean;
  onSuperSubmit: (symbol: string, volumeFromField: number) => void;
  onManualSubmit: (stock: StockData) => void;
  onSwitchPage: () => void;
  onDryRunChange: (dryRun: boolean) => void;
  /** The last few scans kept on this device, newest first */
  recentScans: RecentScan[];
  onOpenRecentScan: (scan: RecentScan) => void;
  /** Update the watchlist, the screener and the news now; absent while the server is unreachable */
  onUpdateEverything?: () => void;
  /** How many of those updates are running */
  updatesRunning: number;
  /** The most recent scan, shown as a card in the top-left corner */
  lastScan: { stock: StockData; legend: LegendState } | null;
  onOpenLastScan: () => void;
  watchlist: Watchlist;
  onOpenWatchItem: (item: WatchItem) => void;
  onOpenWatchlist: () => void;
}

const emptyManualFields = {
  symbol: "",
  volume: "",
  currentPrice: "",
  averageVolume: "",
  lastPrice: "",
  floatShare: "",
};

const DEV_OPEN_KEY = "pm.devOptions.open";

function readDevOpen(): boolean {
  try {
    return localStorage.getItem(DEV_OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Greeting, date and the big HUD clock: the only part of the home screen that ticks every second. */
function HeroClock() {
  const clock = useClock();
  return (
    <div className="home__center">
      <p className="hero__welcome">
        <RevealText dir="rtl">
          WELCOME TO ALPHA 9: <span className="pink">LEGENDS</span>
        </RevealText>
      </p>
      <h1 className="hero__title">
        <RevealText>{clock.timeOfDay.trim().toUpperCase()}</RevealText>
      </h1>
      <p className="hero__date">
        <RevealText dir="rtl">{clock.date.toUpperCase()}</RevealText>
      </p>

      <div className="hud">
        <Reveal kind="slide" className="hud__readout" wash="none">
          <span className="hud__unit">{clock.anteMeridiem}</span>
          <span className="hud__big" aria-label={`${clock.hours}:${clock.minutes}:${clock.seconds} ${clock.anteMeridiem}`}>
            {clock.hours}:{clock.minutes}
            <span className="hud__seconds">:{clock.seconds}</span>
          </span>
        </Reveal>
        {clock.nextSession.label && (
          <Reveal kind="panel" wash="pink" className="hud__timer">
            <TimerIcon />
            <span className="hud__timer-label">{clock.nextSession.label}</span>
            <span className="hud__timer-value">{clock.nextSession.remaining}</span>
          </Reveal>
        )}
        {/* A market holiday, or a day the market closes early */}
        {clock.closedFor && clock.closedFor !== "THE WEEKEND" && <span className="hud__holiday">MARKET CLOSED TODAY FOR {clock.closedFor}</span>}
        {clock.earlyClose && <span className="hud__holiday">EARLY CLOSE TODAY · 1:00 PM ET</span>}
      </div>
    </div>
  );
}

export function StartPage({
  screenRef,
  active,
  buyButtonsEnabled,
  dryRun,
  onSuperSubmit,
  onManualSubmit,
  onSwitchPage,
  onDryRunChange,
  lastScan,
  onOpenLastScan,
  recentScans,
  onOpenRecentScan,
  onUpdateEverything,
  updatesRunning,
  watchlist,
  onOpenWatchItem,
  onOpenWatchlist,
}: StartPageProps) {
  const settings = useSettings();
  const [superSymbol, setSuperSymbol] = useState("");
  const [superVolume, setSuperVolume] = useState("");
  const [fields, setFields] = useState(emptyManualFields);
  const [symbolError, setSymbolError] = useState("");
  const [devOpen, setDevOpen] = useState(readDevOpen);
  const superSymbolRef = useRef<HTMLInputElement>(null);
  const now = useNow(30_000, active);
  // Company-name search under the ticker box: matches for what's typed, picked with the mouse or the arrow keys
  const [matches, setMatches] = useState<SymbolMatch[]>([]);
  const [matchesOpen, setMatchesOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  useEffect(() => {
    const q = superSymbol.trim();
    if (q.length < 2 || !matchesOpen) {
      setMatches([]);
      return;
    }
    const abort = new AbortController();
    const timer = window.setTimeout(() => {
      searchSymbols(q, abort.signal)
        .then((found) => {
          // The exact ticker alone needs no list
          setMatches(found.length === 1 && found[0].symbol === q.toUpperCase() ? [] : found);
          setHighlight(-1);
        })
        .catch(() => {});
    }, 180);
    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [superSymbol, matchesOpen]);

  function pickMatch(match: SymbolMatch) {
    sfx.play("tap");
    setSuperSymbol(match.symbol);
    setSymbolError("");
    setMatches([]);
    setMatchesOpen(false);
    superSymbolRef.current?.focus();
  }
  const manualSymbolRef = useRef<HTMLInputElement>(null);

  const setField = (key: keyof typeof emptyManualFields) => (value: string) => setFields((prev) => ({ ...prev, [key]: value }));
  const marketState = useMarketState();
  const preMarket = marketState === "PRE-MARKET";

  function rejectEmpty(input: HTMLInputElement | null) {
    sfx.play("tap");
    if (input) {
      shake(input);
      input.focus();
    }
  }

  function superCalculate() {
    const symbol = superSymbol.trim();
    if (symbol === "") {
      setSymbolError("ENTER A STOCK TICKER/SYMBOL");
      rejectEmpty(superSymbolRef.current);
      return;
    }
    sfx.play("launch");
    onSuperSubmit(symbol, parseNumber(superVolume));
  }

  function calculate() {
    if (fields.symbol === "") {
      rejectEmpty(manualSymbolRef.current);
      return;
    }
    sfx.play("launch");
    onManualSubmit({
      symbol: fields.symbol.trim().toUpperCase(),
      fullName: "Not Identified",
      currentPrice: Number(fields.currentPrice),
      lastClose: Number(fields.lastPrice),
      volume: parseNumber(fields.volume),
      averageVolume: parseNumber(fields.averageVolume),
      float: parseNumber(fields.floatShare),
    });
  }

  function fakeFill() {
    setFields({
      symbol: "TEST",
      currentPrice: `${getRandomInt(30, 35)}`,
      lastPrice: `${getRandomInt(25, 30)}`,
      volume: `${getRandomInt(5000000, 20000000)}`,
      averageVolume: `${getRandomInt(1000000, 10000000)}`,
      floatShare: `${getRandomInt(2000000, 20000000)}`,
    });
  }

  function toggleDev() {
    sfx.play("tap");
    setDevOpen((open) => {
      try {
        localStorage.setItem(DEV_OPEN_KEY, open ? "0" : "1");
      } catch {
        // Storage unavailable; the choice lasts for this visit only
      }
      return !open;
    });
  }

  return (
    <section className="screen screen--start" ref={screenRef} hidden={!active} aria-label="Market scanner">
      <div className="screen__bg screen__bg--menu" data-a9-bg aria-hidden />

      <div className="home">
        <div className="home__main">
          <div className="home__side">
            <div className="home__corner">
              <div className="hero__tags">
                <Reveal kind="pop">
                  <Chip tone="pink" size="lg">
                    01
                  </Chip>
                </Reveal>
                <Reveal kind="panel">
                  <Chip tone="white" size="lg">
                    MARKET SCANNER
                  </Chip>
                </Reveal>
              </div>
              {lastScan && (
                <Reveal kind="slide" wash="none">
                  <LastScanCard stock={lastScan.stock} legend={lastScan.legend} onOpen={onOpenLastScan} />
                </Reveal>
              )}
            </div>
            <Reveal kind="slide" wash="none" className="home__rail">
              <WatchRail watchlist={watchlist} onOpenItem={onOpenWatchItem} onOpenWatchlist={onOpenWatchlist} />
            </Reveal>
          </div>

          <HeroClock />
        </div>

        <aside className="home__pane" aria-label="Quick scan">
          <div className="pane__head">
            <h2 className="pane__title">
              <RevealText dir="rtl">QUICK SCAN</RevealText>
            </h2>
            <Reveal kind="fade" className="pane__rule" />
          </div>

          <Reveal kind="panel" className="card scan">
            <form
              className="scan__form"
              onSubmit={(e) => {
                e.preventDefault();
                superCalculate();
              }}
            >
              <Field label="STOCK TICKER/SYMBOL" htmlFor="superSymbol" error={symbolError}>
                <span className="search">
                  <SearchIcon />
                  <input
                    ref={superSymbolRef}
                    className="a9-input a9-input--ticker a9-input--search"
                    id="superSymbol"
                    placeholder="E.G. AAPL, MSFT"
                    autoComplete="off"
                    spellCheck={false}
                    value={superSymbol}
                    role="combobox"
                    aria-expanded={matches.length > 0}
                    aria-controls="symbol-matches"
                    aria-autocomplete="list"
                    onChange={(e) => {
                      setSuperSymbol(e.target.value);
                      setSymbolError("");
                      setMatchesOpen(true);
                    }}
                    onFocus={() => setMatchesOpen(true)}
                    // Late enough for a click on a match to land first
                    onBlur={() => window.setTimeout(() => setMatchesOpen(false), 150)}
                    onKeyDown={(e) => {
                      if (!matches.length) return;
                      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                        e.preventDefault();
                        setHighlight((i) => (e.key === "ArrowDown" ? (i + 1) % matches.length : i <= 0 ? matches.length - 1 : i - 1));
                      } else if (e.key === "Enter" && highlight >= 0) {
                        e.preventDefault();
                        pickMatch(matches[highlight]);
                      } else if (e.key === "Escape") {
                        setMatches([]);
                        setMatchesOpen(false);
                      }
                    }}
                  />
                  {matches.length > 0 && (
                    <ul className="matches" id="symbol-matches" role="listbox" aria-label="Matching stocks">
                      {matches.map((m, i) => (
                        <li key={m.symbol} role="option" aria-selected={i === highlight}>
                          <button type="button" className={`matches__row${i === highlight ? " is-on" : ""}`} tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setHighlight(i)} onClick={() => pickMatch(m)}>
                            <span className="matches__symbol">{m.symbol}</span>
                            <span className="matches__name">{m.name}</span>
                            <span className="matches__exchange">{m.type === "ETF" ? "ETF" : m.exchange.toUpperCase()}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </span>
              </Field>
              <Field
                label="CURRENT VOLUME"
                htmlFor="superAverageVolume"
                hint={<Chip tone={preMarket ? "lime" : "slate"} size="sm">{preMarket ? "PRE-MARKET" : "PRE-MARKET ONLY"}</Chip>}
              >
                <NumberField
                  id="superAverageVolume"
                  placeholder={preMarket ? "ENTER CURRENT VOLUME" : "LIVE VOLUME IS USED"}
                  value={superVolume}
                  onChange={setSuperVolume}
                  disabled={!preMarket}
                />
              </Field>
              <Button type="submit" variant="buy" size="lg" sound={null} disabled={!buyButtonsEnabled} className="scan__submit">
                SUBMIT
                {marketState !== "MARKET CLOSED" && <Glint idle />}
              </Button>
            </form>
          </Reveal>

          {recentScans.length > 0 && (
            <Reveal kind="panel" className="card recent">
              <div className="recent__head">
                <SectionTitle as="h3" size="sm">
                  RECENT SCANS
                </SectionTitle>
                <span className="recent__note">TAP ONE TO REOPEN IT</span>
              </div>
              <ul className="recent__list">
                {recentScans.map((scan) => {
                  const change = ((scan.stock.currentPrice - scan.stock.lastClose) / scan.stock.lastClose) * 100;
                  const age = freshness(scan.at, now, "stock");
                  return (
                    <li key={scan.stock.symbol}>
                      <button
                        type="button"
                        className="recent__row"
                        disabled={!buyButtonsEnabled}
                        title={`Scanned ${stampLabel(scan.at, now)}`}
                        onClick={() => {
                          sfx.play("click");
                          onOpenRecentScan(scan);
                        }}
                      >
                        <span className="recent__class">{scoreToClass(scan.legend.score)}</span>
                        <span className="recent__id">
                          <span className="recent__symbol">{scan.stock.symbol}</span>
                          <span className="recent__name">{scan.stock.fullName}</span>
                        </span>
                        <span className="recent__numbers">
                          <span className="recent__score">{Math.round(Number(scan.legend.score)).toLocaleString("en-US")}</span>
                          {Number.isFinite(change) && <span className={`recent__change${change >= 0 ? " is-up" : " is-down"}`}>{change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%</span>}
                        </span>
                        <span className={`recent__ago is-${age}`}>{agoLabel(scan.at, now)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Reveal>
          )}

          <Reveal kind="panel" className="card refresh">
            <Button variant="normal" className="refresh__btn" sound="launch" disabled={!onUpdateEverything || updatesRunning >= 3} onClick={onUpdateEverything}>
              {updatesRunning >= 3 ? "UPDATING EVERYTHING" : "UPDATE EVERYTHING"}
            </Button>
            <span className="refresh__note">
              {updatesRunning > 0 ? `${updatesRunning} OF 3 UPDATES RUNNING · PROGRESS IS IN THE TOP BAR` : "THE WATCHLIST, THE SCREENER AND THE NEWS, ALL AT ONCE"}
            </span>
          </Reveal>

          {settings.devOptions && (
            <Reveal kind="panel" className="card dev">
              <button type="button" className="dev__toggle" aria-expanded={devOpen} aria-controls="dev-options" onClick={toggleDev}>
                <SectionTitle as="h3" size="sm">
                  DEV OPTIONS
                </SectionTitle>
                <span className={`dev__chevron${devOpen ? " is-open" : ""}`} aria-hidden />
              </button>

              {devOpen && (
                <div id="dev-options" className="dev__body">
                  <div className="dev__setting">
                    <span className="dev__setting-label">LEGEND DRY RUN</span>
                    <Segmented
                      label="Legend dry run"
                      value={dryRun ? "on" : "off"}
                      onChange={(v) => onDryRunChange(v === "on")}
                      options={[
                        { value: "on", label: "ENABLED" },
                        { value: "off", label: "DISABLED" },
                      ]}
                    />
                  </div>

                  <form
                    className="dev__grid"
                    onSubmit={(e) => {
                      e.preventDefault();
                      calculate();
                    }}
                  >
                    <Field label="ENTER STOCK SYMBOL" htmlFor="symbol">
                      <input
                        ref={manualSymbolRef}
                        className="a9-input a9-input--ticker"
                        id="symbol"
                        placeholder="E.G. AAPL, MSFT"
                        autoComplete="off"
                        spellCheck={false}
                        value={fields.symbol}
                        onChange={(e) => setField("symbol")(e.target.value)}
                      />
                    </Field>
                    <Field label="CURRENT TRADING VOLUME" htmlFor="volume">
                      <NumberField id="volume" placeholder="VOLUME" value={fields.volume} onChange={setField("volume")} />
                    </Field>
                    <Field label="ENTER CURRENT PRICE" htmlFor="currentPrice">
                      <NumberField id="currentPrice" placeholder="CURRENT TRADING PRICE" value={fields.currentPrice} onChange={setField("currentPrice")} />
                    </Field>
                    <Field label="3 MONTH AVERAGE VOLUME" htmlFor="averageVolume">
                      <NumberField id="averageVolume" placeholder="AVERAGE VOLUME" value={fields.averageVolume} onChange={setField("averageVolume")} />
                    </Field>
                    <Field label="RECENT CLOSING PRICE" htmlFor="lastPrice">
                      <NumberField id="lastPrice" placeholder="LAST CLOSING PRICE" value={fields.lastPrice} onChange={setField("lastPrice")} />
                    </Field>
                    <Field label="SHARE COUNT/FLOAT" htmlFor="floatShare">
                      <NumberField id="floatShare" placeholder="'No' IF NOT AVAILABLE" value={fields.floatShare} onChange={setField("floatShare")} />
                    </Field>

                    <div className="dev__actions">
                      <Button type="submit" variant="buy" sound={null} disabled={!buyButtonsEnabled}>
                        SUBMIT
                      </Button>
                      <Button variant="normal" sound="tap" onClick={fakeFill}>
                        FILL ALL FIELDS
                      </Button>
                      <Button variant="ghost" onClick={onSwitchPage}>
                        GO TO PAGE 2
                      </Button>
                    </div>
                  </form>
                </div>
              )}
            </Reveal>
          )}
        </aside>
      </div>

    </section>
  );
}
