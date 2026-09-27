import type { GeminiResponse } from "../lib/types";
import { Chip } from "../ui/Chip";
import { Diamond } from "../ui/Diamond";
import { Notice } from "../ui/Notice";
import { Reveal } from "../ui/Reveal";

export type GeminiState =
  | { status: "idle" }
  | { status: "working" }
  | { status: "done"; response: GeminiResponse }
  | { status: "error" };

const RATING_TONE: Record<string, "lime" | "pink" | "white" | "slate"> = {
  STRONG: "lime",
  OVERHEATING: "pink",
  CRASHING: "pink",
  WEAK: "slate",
  STABLE: "white",
};

function formatInsight(insight: string): string {
  return insight.replace(/[#]/g, "\n").replace(/[:]/g, ":\n").replace(/[&]/g, "\n");
}

/** Gemini's rating and market insight, styled as an in-game info panel. */
export function GeminiPanel({ gemini }: { gemini: GeminiState }) {
  const rating = gemini.status === "done" ? gemini.response.rating.toUpperCase() : "";

  return (
    <Reveal kind="panel" className="gemini">
      <div className="gemini__head">
        <img className={`gemini__star${gemini.status === "working" ? " is-spinning" : ""}`} src="/images/icons/gemini-star.png" alt="" />
        <span className="gemini__title">
          {gemini.status === "working" && "GEMINI IS WORKING..."}
          {gemini.status === "idle" && "GOOGLE GEMINI SUMMARY"}
          {gemini.status === "error" && "GEMINI IS UNAVAILABLE"}
          {gemini.status === "done" && "GEMINI SAYS:"}
        </span>
        {gemini.status === "done" && (
          <span className="gemini__rating" key={rating}>
            <Chip tone={RATING_TONE[rating] ?? "white"}>
              {rating}
            </Chip>
          </span>
        )}
      </div>

      <div className="gemini__body" aria-live="polite">
        {gemini.status === "working" && (
          <div className="gemini__loading">
            <Diamond size={26} label="Gemini is analyzing" />
            <div className="gemini__lines">
              <div className="a9-shimmer" />
              <div className="a9-shimmer" />
              <div className="a9-shimmer" />
              <div className="a9-shimmer a9-shimmer--short" />
            </div>
          </div>
        )}
        {gemini.status === "error" && <Notice>GEMINI ANALYSIS IS NOT AVAILABLE AT THIS MOMENT</Notice>}
        {gemini.status === "done" && (
          <p className="gemini__text" key={gemini.response.insight}>
            {formatInsight(gemini.response.insight)}
          </p>
        )}
      </div>
    </Reveal>
  );
}
