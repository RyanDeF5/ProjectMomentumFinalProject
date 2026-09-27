import type { Ref } from "react";
import type { MarketState } from "../lib/types";
import { Chip } from "../ui/Chip";
import { Diamond } from "../ui/Diamond";
import { Reveal } from "../ui/Reveal";
import { RevealText } from "../ui/RevealText";

interface LoadingPageProps {
  screenRef: Ref<HTMLElement>;
  active: boolean;
  symbol: string;
  marketState: MarketState;
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

/** Shown while quote data loads, like the loading screen before a race. */
export function LoadingPage({ screenRef, active, symbol, marketState }: LoadingPageProps) {
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
            <p>FETCHING LIVE QUOTE</p>
            <p className="lime">THEN GEMINI RANKS THE SETUP</p>
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
          <Diamond size={16} label="Loading" />
        </Reveal>

        <Reveal kind="fade" className="loading__corner" aria-hidden>
          <Diamond size={46} />
        </Reveal>
      </div>
    </section>
  );
}
