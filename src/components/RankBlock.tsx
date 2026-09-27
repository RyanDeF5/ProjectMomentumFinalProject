import { useEffect, useRef } from "react";
import { sfx } from "../audio/sfx";
import { useCountUp } from "../lib/useCountUp";
import { scoreToClass } from "../lib/numbers";
import type { GeminiState } from "./GeminiPanel";
import { Reveal } from "../ui/Reveal";

const COUNT_MS = 1100;

/** RANK 1,540/2000 with the class letter box, like a car's rank in the garage. */
export function RankBlock({ gemini }: { gemini: GeminiState }) {
  const done = gemini.status === "done";
  const score = done ? Number(gemini.response.score) : 0;
  const shown = useCountUp(score, { duration: COUNT_MS, token: done ? 1 : 0 });
  const classRank = done ? scoreToClass(gemini.response.score) : "?";
  const letterRef = useRef<HTMLSpanElement>(null);

  // When the score finishes counting, slam the class letter in with a pink burst
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => {
      sfx.play("tap");
      letterRef.current?.animate(
        [
          { transform: "scale(1.9)", opacity: 0, boxShadow: "0 0 0 0 rgba(255,0,84,0.9)" },
          { transform: "scale(0.92)", opacity: 1, offset: 0.55 },
          { transform: "scale(1)", boxShadow: "0 0 0 18px rgba(255,0,84,0)" },
        ],
        { duration: 480, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
      );
    }, COUNT_MS);
    return () => clearTimeout(timer);
  }, [done, gemini]);


  return (
    <Reveal kind="panel" className="rank">
      <div className="rank__numbers">
        <span className="rank__label">RANK</span>
        <span className="rank__score">
          {Number.isFinite(shown) ? Math.round(shown).toLocaleString("en-US") : gemini.status === "done" ? String(gemini.response.score) : "0"}
          <small>/2000</small>
        </span>
      </div>
      <span className={`rank__class rank__class--${done ? classRank.toLowerCase() : "pending"}`} ref={letterRef}>
        {classRank}
      </span>
    </Reveal>
  );
}
