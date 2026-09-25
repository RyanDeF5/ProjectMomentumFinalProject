import { useEffect, useState, type ReactNode } from "react";
import type { GeminiResponse } from "../lib/types";

export type GeminiState =
  | { status: "idle" }
  | { status: "working" }
  | { status: "done"; response: GeminiResponse }
  | { status: "error" };

const LOADING_BARS = [false, false, false, true]; // last bar is the short one

function formatInsight(insight: string): string {
  return insight.replace(/[#]/g, "\n").replace(/[:]/g, ":\n").replace(/[&]/g, "\n");
}

export function GeminiSummary({ gemini }: { gemini: GeminiState }) {
  const working = gemini.status === "working";
  const [visibleBars, setVisibleBars] = useState(0);

  // Loading bars appear one after another, 100ms apart
  useEffect(() => {
    if (!working) {
      setVisibleBars(0);
      return;
    }
    const timers = LOADING_BARS.map((_, index) => setTimeout(() => setVisibleBars(index + 1), index * 100));
    return () => timers.forEach(clearTimeout);
  }, [working]);

  let title: ReactNode = "Google Gemini Summary";
  if (working) title = " Gemini Is Working... ";
  else if (gemini.status === "error") title = "Gemini Is Unavailable";
  else if (gemini.status === "done")
    title = (
      <>
        Gemini Says: <span className="bold">{gemini.response.rating.toUpperCase()}</span>
      </>
    );

  return (
    <div className="animatedCloak topdown aiResBox">
      <img id="geminiStar" className={working ? "spinning" : undefined} src="/images/geminiStar.png" alt="" />
      <div id="titleBoxAI">{title}</div>
      <div id="textBoxAIContainer">
        <div id="textBoxAI">{gemini.status === "done" ? formatInsight(gemini.response.insight) : ""}</div>
        {LOADING_BARS.map((short, index) => (
          <div
            key={index}
            className={`geminiProgressContainer${short ? " short" : ""}`}
            style={{ display: index < visibleBars ? "block" : "none" }}
          >
            <div className="geminiProgressBar"></div>
          </div>
        ))}
      </div>
    </div>
  );
}
