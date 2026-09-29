import type { ReactNode, Ref } from "react";
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
  symbol: string;
  marketState: MarketState;
  steps: LoadingSteps;
  news: NewsItem[];
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

// Tile mosaic on the right, echoing the photo grid of the game's pre-race loading screen
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
export function LoadingPage({ screenRef, active, symbol, marketState, steps, news }: LoadingPageProps) {
  const newsCount = news.length;
  const reading = news.map((item) => ({ name: item.publisher.toUpperCase(), domain: item.domain }));
  const searching = steps.news === "active";
  const letters = symbol.slice(0, 2).split("");

  return (
    <section className="screen screen--loading" ref={screenRef} hidden={!active} aria-label="Loading">
      <div className="screen__bg screen__bg--loading" data-a9-bg aria-hidden />

      <div className="loading">
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

        <div className="loading__mosaic" aria-hidden>
          {MOSAIC.map((tile, i) => (
            <Reveal
              key={i}
              kind="slide"
              className={`mosaic__tile mosaic__tile--${tile.tone}`}
              style={{ gridColumn: tile.col, gridRow: tile.row, backgroundPosition: `${(tile.col - 1) * 33.3}% ${(tile.row - 1) * 50}%` }}
              delay={200 + i * 45}
            >
              {tile.tone === "letter" && <span>{letters[tile.row === 2 ? 0 : 1] ?? ""}</span>}
            </Reveal>
          ))}
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
