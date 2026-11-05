import { memo, useEffect, useLayoutEffect, useRef, useState, type Ref } from "react";
import { sfx } from "../audio/sfx";
import { JobStatusChip } from "../components/JobStatusChip";
import { Favicon, ImpactCard, StoryReader } from "../components/StoryReader";
import { isKept, MOOD_LABELS, NEWS_CATEGORY_LABELS, type MarketNews } from "../lib/marketNews";
import type { MarketStory, NewsTicker, PulseQuote } from "../lib/types";
import { agoLabel, useNow } from "../lib/watchlist";
import { Button } from "../ui/Button";
import { Diamond } from "../ui/Diamond";
import { Glint } from "../ui/Glint";
import { LegendEmblem, LegendMark } from "../ui/LegendEmblem";
import { Reveal } from "../ui/Reveal";
import { RevealText } from "../ui/RevealText";

interface NewsPageProps {
  screenRef: Ref<HTMLElement>;
  active: boolean;
  news: MarketNews;
  /** Run a full scan of a stock named in the news */
  onScan: (symbol: string) => void;
  /** Scans are blocked while one is running */
  scanBusy: boolean;
  /** Open the news job's settings in the Update Schedule */
  onOpenSchedule: () => void;
}

type Tab = "top" | "movers" | "latest";

const TABS: [Tab, string][] = [
  ["top", "TOP STORIES"],
  ["movers", "STOCK MOVERS"],
  ["latest", "LATEST"],
];

const SOURCE_COUNT = 6; // CNBC, MarketWatch, Seeking Alpha, Nasdaq, Google News, Yahoo Finance

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const move = (s: MarketStory) => Math.max(0, ...s.tickers.map((t) => Math.abs(t.change ?? 0)));

/** A stock in a story: its move now. Tapping it runs a full scan. */
function TickerChip({ ticker, onScan, disabled }: { ticker: NewsTicker; onScan: (s: string) => void; disabled: boolean }) {
  const c = ticker.change;
  const tone = c === null ? "" : c >= 0 ? " is-up" : " is-down";
  return (
    <button
      type="button"
      className={`nticker${tone}`}
      disabled={disabled}
      title={`${ticker.name}: scan ${ticker.symbol} with Legend`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onScan(ticker.symbol);
      }}
    >
      <span className="nticker__symbol">{ticker.symbol}</span>
      <span className="nticker__change">
        {c === null ? "--" : `${c >= 0 ? "▲" : "▼"} ${Math.abs(c).toFixed(1)}%`}
        {ticker.session === "PRE" && <em>PRE</em>}
      </span>
      {ticker.after !== null && (
        <span className="nticker__after">
          AH {ticker.after >= 0 ? "+" : ""}
          {ticker.after.toFixed(1)}%
        </span>
      )}
    </button>
  );
}

/** The shine on the hottest story plays when a new story takes the top, at most this often */
const GLINT_GAP_MS = 5 * 60_000;

/**
 * One story, like a row of the game's event list: Legend's impact card, the story, its stocks.
 * The whole row opens the story in the reader; the stock chips sit above it and scan instead.
 */
const StoryRow = memo(function StoryRow({
  story,
  now,
  first,
  glint,
  onOpen,
  onScan,
  scanBusy,
}: {
  story: MarketStory;
  /** Server time, rounded to the minute so the rows don't re-render every few seconds */
  now: number;
  first: boolean;
  glint: number;
  onOpen: (story: MarketStory) => void;
  onScan: (s: string) => void;
  scanBusy: boolean;
}) {
  const ai = story.ai!;
  const at = Date.parse(story.publishedAt);
  const fresh = now - at < 3600_000;
  return (
    <li className={`nrow is-${ai.impact}${first ? " is-first" : ""}`}>
      <button type="button" className="nrow__open" aria-label={`Read: ${story.title}`} onClick={() => onOpen(story)} />
      <ImpactCard ai={ai} />

      <span className="nrow__body">
        <span className="nrow__meta">
          <Favicon domain={story.domain} />
          <span className="nrow__publisher">{story.publisher.toUpperCase()}</span>
          <span className={`nrow__age${fresh ? " is-fresh" : ""}`}>{fresh ? "NEW · " : ""}{agoLabel(at, now)}</span>
          <span className="nrow__tag">{NEWS_CATEGORY_LABELS[ai.category] ?? "NEWS"}</span>
          {story.coverage > 1 && (
            <span className="nrow__tag is-coverage" title={story.outlets.join(", ")}>
              {story.coverage} OUTLETS
            </span>
          )}
          {ai.quality === "speculative" && <span className="nrow__tag is-spec">UNCONFIRMED</span>}
        </span>
        <span className="nrow__title">{story.title}</span>
        {ai.why && (
          <span className="nrow__why">
            <LegendMark size={15} />
            {ai.why}
          </span>
        )}
      </span>

      <span className="nrow__tickers">
        {story.tickers.length ? (
          story.tickers.map((t) => <TickerChip key={t.symbol} ticker={t} onScan={onScan} disabled={scanBusy} />)
        ) : (
          <span className="nrow__market">MARKET-WIDE</span>
        )}
      </span>
      {first && <Glint token={glint} />}
    </li>
  );
});

function PulseTile({ quote }: { quote: PulseQuote }) {
  const up = quote.change >= 0;
  const price = quote.yield
    ? `${quote.price.toFixed(2)}%`
    : quote.price >= 10_000
      ? quote.price.toLocaleString("en-US", { maximumFractionDigits: 0 })
      : quote.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <li className={`npulse__tile${up ? " is-up" : " is-down"}`}>
      <span className="npulse__label">{quote.label}</span>
      <span className="npulse__price">{price}</span>
      <span className="npulse__change">
        {up ? "▲" : "▼"} {pct(quote.change).replace(/^[+-]/, "")}
      </span>
    </li>
  );
}

/** Legend's briefing: the market's mood, the story of the day, the themes and what to watch. */
function Briefing({ news, now }: { news: MarketNews; now: number }) {
  const b = news.briefing;
  if (!b) {
    return (
      <aside className="nbrief is-empty">
        <div className="nbrief__head">
          <LegendEmblem size={30} working={news.engine.state === "reading"} />
          <span>LEGEND'S BRIEFING</span>
        </div>
        <p className="nbrief__summary">LEGEND WRITES A SHORT BRIEFING ON THE MARKET ONCE IT HAS READ THE NEWS.</p>
      </aside>
    );
  }
  return (
    <aside className={`nbrief is-${b.mood}`}>
      <div className="nbrief__head">
        <LegendEmblem size={30} working={news.engine.state === "reading" && news.engine.step === "LEGEND IS WRITING THE BRIEFING"} />
        <span>LEGEND'S BRIEFING</span>
        <span className="nbrief__ago">{agoLabel(b.at, now)}</span>
      </div>
      <div className="nbrief__mood">
        <span className="nbrief__mood-tag">MARKET MOOD</span>
        <span className="nbrief__mood-value">{MOOD_LABELS[b.mood]}</span>
      </div>
      <h2 className="nbrief__headline">{b.headline}</h2>
      <p className="nbrief__summary">{b.summary}</p>
      {b.themes.length > 0 && (
        <div className="nbrief__block">
          <span className="nbrief__label">THEMES</span>
          <ul className="nbrief__themes">
            {b.themes.map((t) => (
              <li key={t.title} className={`ntheme is-${t.sentiment}`}>
                <span className="ntheme__title">{t.title}</span>
                {t.tickers.length > 0 && <span className="ntheme__tickers">{t.tickers.join(" · ")}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {b.watch && (
        <div className="nbrief__block">
          <span className="nbrief__label">WATCH NEXT</span>
          <p className="nbrief__watch">{b.watch}</p>
        </div>
      )}
      <span className="nbrief__foot">WRITTEN DURING {b.session} · NOT FINANCIAL ADVICE</span>
    </aside>
  );
}

/** Market news: the day's headlines read by Legend, laid out like the game's event screens. */
export function NewsPage({ screenRef, active, news, onScan, scanBusy, onOpenSchedule }: NewsPageProps) {
  const now = useNow(5000, active);
  const [tab, setTab] = useState<Tab>("top");
  const [open, setOpen] = useState<MarketStory | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const feedScroll = useRef(0);
  const { engine, settings, stats, connected, clockOffset } = news;
  const busy = engine.state === "gathering" || engine.state === "reading" || engine.state === "waiting";
  const serverNow = now - clockOffset;

  const kept = news.stories.filter(isKept);
  let shown = kept;
  if (tab === "movers") shown = kept.filter((s) => s.tickers.some((t) => t.change !== null)).sort((a, b) => move(b) - move(a));
  else if (tab === "latest") shown = [...kept].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const high = kept.filter((s) => s.ai?.impact === "high").length;
  const minute = Math.floor(serverNow / 60_000) * 60_000;

  // The shine plays on the hottest story when a new one takes the top, not on a loop
  const topId = kept[0]?.id ?? null;
  const [glint, setGlint] = useState(0);
  const lastGlint = useRef({ id: null as string | null, at: 0 });
  useEffect(() => {
    if (!active || !topId || topId === lastGlint.current.id) return;
    const first = lastGlint.current.id === null;
    lastGlint.current.id = topId;
    if (first || Date.now() - lastGlint.current.at < GLINT_GAP_MS) return;
    lastGlint.current.at = Date.now();
    setGlint((n) => n + 1);
  }, [active, topId]);

  // The reader shows the latest version of the open story while it's still on the feed
  const reading = open ? (news.stories.find((s) => s.id === open.id && s.ai) ?? open) : null;
  const openStory = (story: MarketStory) => {
    sfx.play("tap");
    feedScroll.current = panelRef.current?.scrollTop ?? 0;
    setOpen(story);
  };
  const closeStory = () => {
    sfx.play("tap");
    setOpen(null);
  };
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (panel) panel.scrollTop = open ? 0 : feedScroll.current;
  }, [open]);
  useEffect(() => {
    if (!active || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeStory();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const unread = news.stories.length - (stats?.read ?? 0);
  const sources = stats ? Object.values(stats.sources).filter((v) => typeof v === "number" && v > 0).length : 0;

  let meta = "";
  if (stats) {
    const h = stats.hidden;
    const left = [h.promo && `${h.promo} PROMOS / CLICKBAIT`, h.stale && `${h.stale} OLD NEWS`, h.offtopic + h.minor && `${h.offtopic + h.minor} NOT WORTH IT`].filter(Boolean);
    meta =
      (stats.finishedAt ? `UPDATED ${agoLabel(stats.finishedAt, serverNow)} · ` : "") +
      `${stats.gathered} HEADLINES FROM ${sources || SOURCE_COUNT} SOURCES · ${stats.clustered} STORIES · LEGEND READ THE ${stats.read} HOTTEST AND KEPT ${stats.kept}` +
      (left.length ? `, LEFT OFF ${left.join(", ")}` : "") +
      (busy && unread > 0 ? ` · READING ${unread} MORE` : "") +
      " · TAP A STORY TO READ IT, A STOCK TO SCAN IT";
  }

  return (
    <section className="screen screen--screener screen--news" ref={screenRef} hidden={!active} aria-label="Market news">
      <div className="screen__bg screen__bg--screener screen__bg--news" data-a9-bg aria-hidden />

      <div className="mp">
        <header className="mp__head">
          <div className="mp__title">
            <Reveal kind="fade" className="mp__rule" />
            <h1 className="mp__heading">
              <RevealText>MARKET NEWS</RevealText>
            </h1>
            <div className="mp__chips">
              <JobStatusChip
                connected={connected}
                state={engine.state}
                busy={busy}
                interval={settings.interval}
                nextAt={engine.nextAt}
                reason={engine.reason}
                clockOffset={clockOffset}
                active={active}
                onOpen={onOpenSchedule}
              />
              <Reveal kind="panel" className="mp__legend">
                <LegendEmblem size={22} />
                <span>{stats ? `${kept.length} STORIES · ${stats.read} READ` : "LEGEND"}</span>
              </Reveal>
              <Reveal kind="fade" className="mp__aplus">
                <span className="mp__aplus-tag">HIGH IMPACT</span>
                <span className="mp__aplus-value">{high}</span>
              </Reveal>
            </div>
          </div>

          <div className="mp__side">
            <div className="mp__tabs" role="tablist">
              {TABS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  className={`mp__tab${tab === id ? " is-on" : ""}`}
                  onClick={() => {
                    if (tab === id && !open) return;
                    sfx.play("tap");
                    setTab(id);
                    setOpen(null);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </header>

        <Reveal kind="slide" wash="none" className={`mp__panel npanel${reading ? " is-reading" : ""}`} ref={panelRef}>
          {reading ? (
            <StoryReader key={reading.id} story={reading} now={minute} onBack={closeStory} onScan={onScan} scanBusy={scanBusy} />
          ) : (
            <>
              {news.pulse.length > 0 && (
                <ul className="npulse" aria-label="Market pulse">
                  {news.pulse.map((q) => (
                    <PulseTile key={q.symbol} quote={q} />
                  ))}
                </ul>
              )}
              <div className="nlayout">
                <div className="nfeed-wrap">
                  {meta && (
                    <p className="sboard__meta nmeta" title={meta}>
                      {meta}
                    </p>
                  )}
                  {shown.length ? (
                    <ul className="nfeed">
                      {shown.map((story, i) => (
                        <StoryRow
                          key={story.id}
                          story={story}
                          now={minute}
                          first={tab === "top" && i === 0}
                          glint={glint}
                          onOpen={openStory}
                          onScan={onScan}
                          scanBusy={scanBusy}
                        />
                      ))}
                    </ul>
                  ) : (
                    <div className="sboard__empty">
                      {busy ? (
                        <>
                          <Diamond size={46} />
                          <span>{engine.step ?? "UPDATING"}; STORIES APPEAR HERE AS LEGEND READS THEM</span>
                        </>
                      ) : kept.length ? (
                        <span>NO STORIES IN THE NEWS ARE MOVING STOCKS RIGHT NOW.</span>
                      ) : (
                        <>
                          <span>
                            {stats
                              ? `NOTHING WORTH READING RIGHT NOW: LEGEND LEFT OFF ALL ${stats.read} STORIES IT READ.`
                              : "NO NEWS YET. SET HOW OFTEN LEGEND READS THE HEADLINES, OR RUN AN UPDATE NOW, IN THE UPDATE SCHEDULE."}
                          </span>
                          <Button variant="normal" onClick={onOpenSchedule}>
                            OPEN UPDATE SCHEDULE
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <Briefing news={news} now={minute} />
              </div>
            </>
          )}
        </Reveal>

      </div>
    </section>
  );
}
