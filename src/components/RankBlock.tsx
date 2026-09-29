import { useEffect, useRef, useState } from "react";
import { sfx } from "../audio/sfx";
import { useCountUp } from "../lib/useCountUp";
import { scoreToClass } from "../lib/numbers";
import type { LegendState } from "./LegendPanel";
import { Reveal } from "../ui/Reveal";

const COUNT_MS = 1100;
// Starts once the summary's panels have built in
const COUNT_DELAY_MS = 650;

interface RankBlockProps {
  legend: LegendState;
  /** Opens the score breakdown */
  onInfo?: () => void;
  /** Changes each time the summary screen is shown; restarts the reveal */
  revealKey: number;
}

/** RANK 1,540/2000 with the class letter box, like a car's rank in the garage. */
export function RankBlock({ legend, revealKey, onInfo }: RankBlockProps) {
  const done = legend.status === "done";
  const score = done ? Number(legend.response.score) : 0;
  const shown = useCountUp(score, { duration: COUNT_MS, delay: COUNT_DELAY_MS, token: done ? revealKey : -1 });
  const [landed, setLanded] = useState(false);
  const classRank = done && landed ? scoreToClass(legend.response.score) : "?";
  const letterRef = useRef<HTMLSpanElement>(null);

  // When the score finishes counting, slam the class letter in with a pink burst
  useEffect(() => {
    setLanded(false);
    if (!done || !revealKey) return;
    const timer = setTimeout(() => {
      setLanded(true);
      sfx.play("tap");
      letterRef.current?.animate(
        [
          { transform: "scale(1.9)", opacity: 0, boxShadow: "0 0 0 0 rgba(255,0,84,0.9)" },
          { transform: "scale(0.92)", opacity: 1, offset: 0.55 },
          { transform: "scale(1)", boxShadow: "0 0 0 18px rgba(255,0,84,0)" },
        ],
        { duration: 480, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
      );
    }, COUNT_DELAY_MS + COUNT_MS);
    return () => clearTimeout(timer);
  }, [done, legend, revealKey]);


  return (
    <Reveal kind="panel" className="rank">
      <div className="rank__numbers">
        <span className="rank__label">RANK</span>
        <span className="rank__score">
          {Number.isFinite(shown) ? Math.round(shown).toLocaleString("en-US") : legend.status === "done" ? String(legend.response.score) : "0"}
          <small>/2000</small>
        </span>
      </div>
      <span className={`rank__class rank__class--${done && landed ? classRank.toLowerCase() : "pending"}`} ref={letterRef}>
        {classRank}
      </span>
      {/* Small white box after the class letter, like the icon box on the game's rank block */}
      <button
        type="button"
        className="rank__info"
        aria-label="Show score breakdown"
        disabled={!done || !onInfo}
        onClick={() => {
          sfx.play("tap");
          onInfo?.();
        }}
      >
        i
      </button>
    </Reveal>
  );
}
