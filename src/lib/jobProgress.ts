import { useRef } from "react";
import type { JobProgress } from "./types";
import { useNow } from "./watchlist";

/** A background job shown in the top bar: a screener update or a watchlist update. */
export interface TopJob {
  source: "screener" | "watchlist";
  /** Short name, e.g. SCREENER */
  label: string;
  /** What is happening, e.g. LEGEND IS GRADING ABCD */
  step: string;
  progress: JobProgress | null;
  /** On hold (waiting for a scan run by hand) */
  held: boolean;
  /** This device's clock minus the server's */
  clockOffset: number;
}

function duration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? `${s}S` : `${Math.floor(s / 60)}M ${String(s % 60).padStart(2, "0")}S`;
}

/**
 * Where a job's progress bar is now. The server sends where each step starts and should end; this
 * fills between them as time passes (or as items are counted off), and never runs backwards within
 * a job. Ticks four times a second while the job runs.
 */
export function useJobProgress(job: TopJob | null) {
  const p = job?.progress ?? null;
  const running = Boolean(p && !job?.held && !p.held);
  const now = useNow(250, running);
  const best = useRef({ job: 0, pct: 0 });
  if (!job || !p) return { pct: 0, left: null as string | null, count: null as string | null };

  const serverNow = now - job.clockOffset;
  const inStep = Math.max(0, serverNow - p.stepStartedAt);
  let share: number;
  if (!running) share = 0;
  else if (p.total > 0) share = p.done / p.total;
  else share = Math.min(0.95, inStep / Math.max(1, p.stepEstimateMs));
  let pct = p.from + (p.to - p.from) * share;
  if (best.current.job !== p.startedAt) best.current = { job: p.startedAt, pct: 0 };
  pct = Math.max(pct, best.current.pct);
  best.current.pct = pct;

  let left: string | null = null;
  if (running) {
    const stepLeft = p.total > 0 && p.done > 0 ? (inStep / p.done) * (p.total - p.done) : Math.max(0, p.stepEstimateMs - inStep);
    const total = stepLeft + p.afterMs;
    left = total < 1500 ? "ALMOST DONE" : `~${duration(total)} LEFT`;
  }
  const count = p.total > 0 ? `${p.done}/${p.total}` : p.units > 1 ? `${p.unit + 1}/${p.units}` : null;
  return { pct, left, count };
}
