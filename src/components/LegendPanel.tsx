import type { LegendResponse } from "../lib/types";
import { Chip } from "../ui/Chip";
import { LegendEmblem } from "../ui/LegendEmblem";
import { Notice } from "../ui/Notice";
import { Reveal } from "../ui/Reveal";

export type LegendState =
  | { status: "idle" }
  | { status: "working" }
  | { status: "done"; response: LegendResponse }
  | { status: "error" };

export const RATING_TONE: Record<string, "lime" | "pink" | "white" | "slate"> = {
  STRONG: "lime",
  OVERHEATING: "pink",
  CRASHING: "pink",
  WEAK: "slate",
  STABLE: "white",
};

const CheckMark = () => (
  <svg className="legend-row__mark" width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.6">
    <path d="m4 12.5 5 5L20 6.5" />
  </svg>
);

const AlertMark = () => (
  <svg className="legend-row__mark" width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="currentColor">
    <path d="M10.6 4h2.8l-.5 10.5h-1.8zM12 16.4a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6z" />
  </svg>
);

const NewsMark = () => (
  <svg className="legend-row__mark" width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2">
    <rect x="3.5" y="5" width="17" height="14" />
    <path d="M7 9h10M7 12.5h10M7 16h6" />
  </svg>
);

function Row({ label, text, risk, news }: { label: string; text: string; risk?: boolean; news?: boolean }) {
  return (
    <Reveal as="li" kind="slide" wash="none" className={`legend-row${risk ? " is-risk" : ""}`}>
      {risk ? <AlertMark /> : news ? <NewsMark /> : <CheckMark />}
      <span className="legend-row__body">
        <span className="legend-row__label">{label}</span>
        <span className="legend-row__text">{text}</span>
      </span>
    </Reveal>
  );
}

function subtitle(status: LegendState["status"], symbol: string): string {
  if (status === "working") return "ANALYZING SETUP...";
  if (status === "error") return "OFFLINE";
  if (status === "done") return `${symbol} ANALYSIS`;
  return "MOMENTUM ANALYST";
}

function newsLabel(response: LegendResponse): string {
  const parts = ["NEWS"];
  if (response.newsSentiment !== "none") parts.push(response.newsSentiment.toUpperCase());
  if (response.catalyst !== "none") parts.push(`${response.catalyst.toUpperCase()} CATALYST`);
  return parts.join(" · ");
}

/** How the score was built: the quant components, then Legend's news catalyst and risk calls. */
export function ScoreBreakdown({ response }: { response: LegendResponse }) {
  const { breakdown } = response;
  const rows = [
    ...breakdown.components.map((c) => ({ label: c.label, points: c.points, max: c.max, tone: "cyan" })),
    { label: `CATALYST · ${breakdown.catalyst.level.toUpperCase()}`, points: breakdown.catalyst.points, max: 400, tone: "gold" },
  ];
  return (
    <div className="breakdown">
      <p className="breakdown__intro">
        The numbers set the base score. Legend's read of the news adds a catalyst bonus and subtracts any
        risk penalty.
      </p>
      <ul className="breakdown__rows">
        {rows.map((row) => (
          <li key={row.label} className="breakdown__row">
            <span className="breakdown__label">{row.label}</span>
            <span className="breakdown__track">
              <span className={`breakdown__fill is-${row.tone}`} data-a9="bar" style={{ transform: `scaleX(${Math.max(0, row.points) / row.max})` }} />
            </span>
            <span className="breakdown__points">
              {row.points}
              <small>/{row.max}</small>
            </span>
          </li>
        ))}
        {breakdown.risk.points < 0 && (
          <li className="breakdown__row is-penalty">
            <span className="breakdown__label">RISK · {breakdown.risk.level.toUpperCase()}</span>
            <span className="breakdown__flags">{response.riskFlags.map((f) => f.replace(/_/g, " ").toUpperCase()).join(" · ")}</span>
            <span className="breakdown__points">{breakdown.risk.points}</span>
          </li>
        )}
        {breakdown.liquidity < 1 && (
          <li className="breakdown__row is-penalty">
            <span className="breakdown__label">THIN LIQUIDITY</span>
            <span className="breakdown__flags">UNDER $1M TRADED</span>
            <span className="breakdown__points">×{breakdown.liquidity}</span>
          </li>
        )}
      </ul>
      <p className="breakdown__total">
        TOTAL <strong>{response.score.toLocaleString("en-US")}</strong>
        <small>/2000</small>
      </p>
    </div>
  );
}

/** Legend's analysis, laid out like the game's Legend Pass card. */
export function LegendPanel({ legend, symbol }: { legend: LegendState; symbol: string }) {
  const rating = legend.status === "done" ? legend.response.rating.toUpperCase() : "";

  return (
    <Reveal kind="panel" className="legend">
      <div className="legend__head">
        <LegendEmblem size={76} working={legend.status === "working"} />
        <div className="legend__titles">
          <span className="legend__title">LEGEND</span>
          <span className="legend__subtitle">{subtitle(legend.status, symbol)}</span>
        </div>
        {legend.status === "done" && (
          <Reveal kind="pop" as="span" className="legend__rating" key={rating}>
            <Chip tone={RATING_TONE[rating] ?? "white"} size="lg">
              {rating}
            </Chip>
          </Reveal>
        )}
      </div>

      <div className="legend__body" aria-live="polite">
        {legend.status === "idle" && <p className="legend__hint">RUN A SCAN TO GET LEGEND'S READ ON THE SETUP</p>}

        {legend.status === "working" && (
          <ul className="legend__rows" aria-label="Legend is analyzing">
            {[0, 1, 2].map((i) => (
              <li key={i} className="legend-row is-loading">
                <span className="legend-row__shimmer" style={{ animationDelay: `${i * 120}ms` }} />
              </li>
            ))}
          </ul>
        )}

        {legend.status === "error" && <Notice>LEGEND IS NOT AVAILABLE AT THIS MOMENT</Notice>}

        {legend.status === "done" && (
          <div className="legend__result" key={legend.response.headline}>
            <Reveal kind="slide" wash="none" as="p" className="legend__headline">
              {legend.response.headline}
            </Reveal>
            <p className="legend__section">MOMENTUM READ:</p>
            <ul className="legend__rows">
              {legend.response.newsRead && <Row label={newsLabel(legend.response)} text={legend.response.newsRead} news />}
              <Row label="CONVICTION" text={legend.response.conviction} />
              <Row label="EFFICIENCY" text={legend.response.efficiency} />
              <Row label="RISKS" text={legend.response.risks} risk />
            </ul>
            <p className="legend__model">{legend.response.model === "dry-run" ? "DRY RUN · EXAMPLE ANALYSIS" : `MODEL · ${legend.response.model}`}</p>
          </div>
        )}
      </div>
    </Reveal>
  );
}
