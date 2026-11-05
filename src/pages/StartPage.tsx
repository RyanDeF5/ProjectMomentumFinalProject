import { useRef, useState, type Ref } from "react";
import { shake } from "../animation/a9";
import { sfx } from "../audio/sfx";
import { Field } from "../components/Field";
import type { LegendState } from "../components/LegendPanel";
import { LastScanCard } from "../components/LastScanCard";
import { WatchRail } from "../components/WatchRail";
import { NumberField } from "../components/NumberField";
import { useClock, useMarketState } from "../lib/clock";
import { getRandomInt, parseNumber } from "../lib/numbers";
import { useSettings } from "../lib/settings";
import type { StockData, WatchItem } from "../lib/types";
import type { Watchlist } from "../lib/watchlist";
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
                    onChange={(e) => {
                      setSuperSymbol(e.target.value);
                      setSymbolError("");
                    }}
                  />
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
