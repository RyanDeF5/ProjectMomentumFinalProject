import { useEffect, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { exchangePhoto } from "../lib/exchanges";
import { SourceCarousel, type Source } from "../components/SourceCarousel";
import type { MarketState, NewsItem } from "../lib/types";
import { Chip } from "../ui/Chip";
import { Diamond } from "../ui/Diamond";
import { Reveal } from "../ui/Reveal";
import { RevealText } from "../ui/RevealText";

export type StepState = "pending" | "active" | "done" | "failed" | "skipped";
export interface LoadingSteps {
  quote: StepState;
  news: StepState;
  legend: StepState;
}

interface LoadingPageProps {
  screenRef: Ref<HTMLElement>;
  active: boolean;
  departing?: boolean;
  symbol: string;
  marketState: MarketState;
  steps: LoadingSteps;
  news: NewsItem[];
  /** Where the stock trades (Yahoo's code and name), once the quote is in; null for manual entries */
  exchange: { code: string | null; name: string | null } | null;
  /** The scan is done: the words fade and the exchange photo spreads across the whole grid */
  finale: boolean;
}

// Full-screen grid of big squares, like the game's pre-race screen: 8 across (4 on phones)
const GRID_COLS_WIDE = 8;
const GRID_COLS_NARROW = 4;
// Squares in the block that light up with the photo while the scan runs, in order (block coords)
const BLOCK_REVEAL = [
  [1, 0],
  [3, 1],
  [0, 1],
  [2, 0],
  [1, 2],
] as const;
const BLOCK_STAGGER_MS = 120;
// Finale: the words fade first, then the photo spreads out from the block square by square
const FINALE_TEXT_MS = 260;
const FINALE_SPREAD_MS = 680; // bounded, including tall phone screens

function useViewport() {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const onResize = () => setSize(read());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

// Shown while the news search runs, before there are stories to read
const SEARCH_SOURCES: Source[] = [
  { name: "YAHOO FINANCE", domain: "finance.yahoo.com" },
  { name: "GOOGLE NEWS", domain: "news.google.com" },
];

const StepMark = ({ state }: { state: StepState }) => {
  if (state === "active") return <span className="step__pulse" />;
  if (state === "failed")
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="3.2">
        <path d="m6 6 12 12M18 6 6 18" />
      </svg>
    );
  if (state === "done" || state === "skipped")
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="3.2">
        <path d="m4 12.5 5 5L20 6.5" />
      </svg>
    );
  return <span className="step__dot" />;
};

function Step({ state, children }: { state: StepState; children: ReactNode }) {
  return (
    <li className={`step is-${state}`}>
      <span className="step__mark">
        <StepMark state={state} />
      </span>
      <span>{children}</span>
    </li>
  );
}

// The block of squares top right (bottom on phones), in block coordinates (col 1-4, row 1-3)
const MOSAIC = [
  { col: 2, row: 1, tone: "photo" },
  { col: 3, row: 1, tone: "photo" },
  { col: 4, row: 1, tone: "dim" },
  { col: 1, row: 2, tone: "photo" },
  { col: 2, row: 2, tone: "letter" },
  { col: 3, row: 2, tone: "pink" },
  { col: 4, row: 2, tone: "photo" },
  { col: 1, row: 3, tone: "dim" },
  { col: 2, row: 3, tone: "photo" },
  { col: 3, row: 3, tone: "letter" },
] as const;

/** Shown while a scan runs (quote, news, Legend), like the loading screen before a race. */
export function LoadingPage({ screenRef, active, departing = false, symbol, marketState, steps, news, exchange, finale }: LoadingPageProps) {
  // The exchange's building, shown once its photo has loaded so the reveal never stalls
  const photo = exchange ? exchangePhoto(exchange.code, exchange.name) : null;
  const [loaded, setLoaded] = useState<string | null>(null);
  useEffect(() => {
    if (!photo) return;
    const img = new Image();
    img.onload = () => setLoaded(photo.src);
    img.src = photo.src;
    return () => {
      img.onload = null;
    };
  }, [photo?.src]); // eslint-disable-line react-hooks/exhaustive-deps
  const showPhoto = Boolean(active && photo && loaded === photo.src);
  const ending = showPhoto && finale;

  // Grid geometry: square size from the width, enough rows to cover the height
  const { w, h } = useViewport();
  const cols = w >= 900 ? GRID_COLS_WIDE : GRID_COLS_NARROW;
  const sq = w / cols;
  const rows = Math.max(3, Math.ceil(h / sq));
  const bx = cols - 4; // block origin
  const by = cols === GRID_COLS_WIDE ? 0 : rows - 3;
  const blockAt = new Map<string, (typeof MOSAIC)[number]>(MOSAIC.map((t) => [`${bx + t.col - 1},${by + t.row - 1}`, t]));
  const revealOrder = new Map<string, number>(BLOCK_REVEAL.map(([c, r], i) => [`${bx + c},${by + r}`, i]));
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${c},${r}`;
      const tile = blockAt.get(key);
      // Clustered diagonal bands, with repeatable variation rather than a circular ripple.
      const progress = ((cols - 1 - c) / Math.max(1, cols - 1) * 0.6 + r / Math.max(1, rows - 1) * 0.4);
      const dist = Math.min(1, progress * 0.82 + ((c * 7 + r * 11) % 5) * 0.045);
      cells.push({ key, c, r, tile, reveal: revealOrder.get(key), dist });
    }
  }

  const newsCount = news.length;
  const reading = news.map((item) => ({ name: item.publisher.toUpperCase(), domain: item.domain }));
  const searching = steps.news === "active";
  const letters = symbol.slice(0, 2).split("");

  return (
    <section className={`screen screen--loading${ending ? " is-finale" : ""}${departing ? " is-departing" : ""}`} inert={departing} aria-hidden={departing || undefined} ref={screenRef} hidden={!active} aria-label="Loading">
      <div className="screen__bg screen__bg--loading" data-a9-bg aria-hidden />

      {/* Full-screen grid. The exchange photo sits underneath; each square covers it with the
          background until it is revealed: the block's photo squares while the scan runs, then
          every square in a wave for the finale. */}
      <div className={`lgrid${showPhoto ? " has-photo" : ""}`} style={{ "--sq": `${sq}px`, "--grid-w": `${w}px`, "--grid-h": `${h}px` } as CSSProperties} aria-hidden>
        {showPhoto && photo && <div className="lgrid__photo" style={{ backgroundImage: `url("${photo.src}")`, backgroundPosition: photo.focus }} />}
        {cells.map(({ key, c, r, tile, reveal, dist }) => {
          const kind = tile?.tone ?? "plain";
          const revealed = showPhoto && reveal !== undefined;
          // Keep already-open cells on their original timeline when the finale starts.
          const delay = revealed ? reveal * BLOCK_STAGGER_MS : FINALE_TEXT_MS + dist * FINALE_SPREAD_MS;
          const open = revealed || ending;
          return (
            <span
              key={`${symbol}-${key}`}
              className={`lgrid__cell is-${kind}${open ? " is-open" : ""}`}
              style={{ left: Math.floor(c * sq), top: Math.floor(r * sq), width: Math.ceil((c + 1) * sq) - Math.floor(c * sq), height: Math.ceil((r + 1) * sq) - Math.floor(r * sq), "--d": `${Math.round(delay)}ms`, "--cx": `${-Math.floor(c * sq)}px`, "--cy": `${-Math.floor(r * sq)}px`, "--mx": `${-(c - bx) * sq}px`, "--my": `${-(r - by) * sq}px` } as CSSProperties}
            >
              <span className="lgrid__cover">
                {kind === "letter" && tile && <span className="lgrid__letter">{letters[tile.row === 2 ? 0 : 1] ?? ""}</span>}
              </span>
            </span>
          );
        })}
      </div>

      <div className="loading" inert={ending}>
        <div className="loading__info">
          <div className="hero__tags">
            <Reveal kind="pop">
              <Chip tone="pink" size="lg">
                01
              </Chip>
            </Reveal>
            <Reveal kind="panel">
              <Chip tone="white" size="lg">
                {symbol || "STCK"}
              </Chip>
            </Reveal>
            {photo && (
              <span className="loading__exchange">
                <Chip tone="dark" size="lg">
                  {photo.label}
                </Chip>
              </span>
            )}
          </div>

          <h1 className="loading__title">
            <RevealText>SCANNING</RevealText>
            <br />
            <RevealText delay={220}>THE MARKET</RevealText>
          </h1>

          <Reveal kind="panel" wash="white" className="loading__session">
            <Chip tone="lime" size="lg">
              SESSION: {marketState}
            </Chip>
          </Reveal>

          <Reveal kind="fade" className="loading__steps">
            <ul aria-live="polite">
              <Step state={steps.quote}>{steps.quote === "skipped" ? "USING MANUAL ENTRY" : "FETCHING LIVE QUOTE"}</Step>
              <Step state={steps.news}>
                {steps.news === "failed"
                  ? "NEWS SEARCH UNAVAILABLE"
                  : steps.news === "done"
                    ? `${newsCount} RECENT ${newsCount === 1 ? "STORY" : "STORIES"} FOUND`
                    : "SEARCHING RECENT NEWS"}
              </Step>
              <Step state={steps.legend}>
                {steps.legend === "failed" ? (
                  "LEGEND IS OFFLINE"
                ) : (
                  <>
                    <span className="gold">LEGEND</span> {steps.legend === "done" ? "HAS RANKED THE SETUP" : "IS RANKING THE SETUP"}
                  </>
                )}
              </Step>
            </ul>
            {(searching || newsCount > 0) && (
              <SourceCarousel
                sources={searching ? SEARCH_SOURCES : reading}
                spinning={searching || steps.legend === "active"}
                verb={searching ? "SEARCHING" : "LEGEND IS READING"}
                doneLabel={`${new Set(reading.map((r) => r.domain || r.name)).size} SOURCES READ`}
              />
            )}
          </Reveal>
        </div>

        <Reveal kind="fade" className="loading__indicator">
          <span>LOADING</span>
        </Reveal>

        {/* The one loading indicator on this screen */}
        <Reveal kind="fade" className="loading__corner">
          <Diamond size={46} label="Loading" />
        </Reveal>
      </div>
    </section>
  );
}
