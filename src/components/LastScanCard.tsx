import { scoreToClass } from "../lib/numbers";
import type { StockData } from "../lib/types";
import { sfx } from "../audio/sfx";
import type { GeminiState } from "./GeminiPanel";

interface LastScanCardProps {
  stock: StockData;
  gemini: GeminiState;
  onOpen: () => void;
}

/** Last scanned stock, shown top-left like the current car's card on the game's home screen. */
export function LastScanCard({ stock, gemini, onOpen }: LastScanCardProps) {
  const done = gemini.status === "done";
  const score = done ? Number(gemini.response.score) : NaN;
  const fill = Number.isFinite(score) ? Math.min(1, Math.max(0, score / 2000)) : 0;

  return (
    <button
      type="button"
      className="lastscan"
      onClick={() => {
        sfx.play("click");
        onOpen();
      }}
      aria-label={`Open last scan: ${stock.symbol}`}
    >
      <span className="lastscan__class">{done ? scoreToClass(gemini.response.score) : "?"}</span>
      <span className="lastscan__info">
        <span className="lastscan__eyebrow">LAST SCAN</span>
        <span className="lastscan__brand">{stock.fullName || "NOT IDENTIFIED"}</span>
        <span className="lastscan__model">{stock.symbol}</span>
        <span className="lastscan__bar">
          <span className="lastscan__fill" style={{ width: `${fill * 100}%` }} />
          <span className="lastscan__score">{done && Number.isFinite(score) ? `${Math.round(score)}/2000` : "--/2000"}</span>
        </span>
      </span>
    </button>
  );
}
