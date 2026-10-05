import { useId } from "react";

interface SparklineProps {
  points: number[];
  /** Previous close, drawn as a dashed line; the chart is lime above it and pink below */
  baseline?: number | null;
  className?: string;
}

const W = 100;
const H = 40;
const PAD = 3;

/** The session's price line for a watchlist card, with a soft fill underneath. */
export function Sparkline({ points, baseline, className }: SparklineProps) {
  const id = useId();
  const valid = points.filter(Number.isFinite);
  if (valid.length < 2) return <svg className={className} viewBox={`0 0 ${W} ${H}`} aria-hidden />;

  const ref = Number.isFinite(baseline) ? (baseline as number) : valid[0];
  const lo = Math.min(...valid, ref);
  const hi = Math.max(...valid, ref);
  const span = hi - lo || 1;
  const x = (i: number) => (i / (valid.length - 1)) * W;
  const y = (v: number) => H - PAD - ((v - lo) / span) * (H - PAD * 2);
  const line = valid.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join("");
  const up = valid[valid.length - 1] >= ref;

  return (
    <svg className={`${className ?? ""} ${up ? "is-up" : "is-down"}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.45" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line className="spark__base" x1="0" x2={W} y1={y(ref)} y2={y(ref)} vectorEffect="non-scaling-stroke" />
      <path d={`${line}L${W},${H}L0,${H}Z`} fill={`url(#${CSS.escape(id)})`} stroke="none" />
      <path className="spark__line" d={line} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
