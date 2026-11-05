import { useEffect, useState } from "react";
import { notify } from "./notify";
import { openStream } from "./stream";
import type { ScreenerEngine, ScreenerEntry, ScreenerEstimate, ScreenerSettings, ScreenerSnapshot, ScreenerStats, WatchAlert } from "./types";

// Same origin by default: the Express server serves both the site and the API
const API_URL = import.meta.env.VITE_API_URL ?? "";

export interface Screener {
  board: ScreenerEntry[];
  settings: ScreenerSettings;
  stats: ScreenerStats | null;
  engine: ScreenerEngine;
  intervals: number[];
  boardSizes: number[];
  estimate: ScreenerEstimate;
  connected: boolean;
  /** This device's clock minus the server's, for the countdown */
  clockOffset: number;
}

const INITIAL: Screener = {
  board: [],
  settings: { interval: 0, dryRun: false, boardSize: 20, criteria: { minPrice: 1, maxPrice: 10, maxFloat: 10_000_000, minChange: 25, minRvol: 10, requireNews: true } },
  stats: null,
  engine: { state: "offline", step: null, symbol: null, nextAt: null },
  intervals: [0, 60, 120, 300, 600, 900, 1800, 3600],
  boardSizes: [10, 20, 50, 100],
  estimate: { tokensPerGrade: 3500, measured: false, gradeMs: 6500, baseMs: 20000 },
  connected: false,
  clockOffset: 0,
};

/** The screener's board and progress, live from the server's event stream. */
export function useScreener(): Screener {
  const [screener, setScreener] = useState(INITIAL);

  useEffect(
    () =>
      openStream(
        "/screener/stream",
        {
          snapshot: (data) => {
            const snap = data as ScreenerSnapshot;
            setScreener({ ...snap, connected: true, clockOffset: Date.now() - snap.now });
          },
          board: (data) => {
            const { board, stats, estimate } = data as { board: ScreenerEntry[]; stats: ScreenerStats; estimate?: ScreenerEstimate };
            setScreener((prev) => ({ ...prev, board, stats, estimate: estimate ?? prev.estimate }));
          },
          settings: (data) => setScreener((prev) => ({ ...prev, settings: data as ScreenerSettings })),
          engine: (data) => {
            const engine = data as ScreenerEngine;
            setScreener((prev) => ({ ...prev, engine, clockOffset: engine.now ? Date.now() - engine.now : prev.clockOffset }));
          },
          alert: (data) => notify(data as WatchAlert),
        },
        (up) => {
          if (!up) setScreener((prev) => (prev.connected ? { ...prev, connected: false } : prev));
        },
      ),
    [],
  );

  return screener;
}

async function request(path: string, init: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok && res.status !== 409) throw new Error(`Request failed: ${res.status}`);
  return res;
}

/** Scan now, even while paused (ignored if a scan is already running). */
export async function scanNow() {
  await request("/screener/scan", { method: "POST" });
}

export async function updateScreenerSettings(patch: Partial<Pick<ScreenerSettings, "interval" | "dryRun" | "boardSize">>) {
  await request("/screener/settings", { method: "PUT", body: JSON.stringify(patch) });
}



/** The newest story in a list (stories are ranked by relevance, not time). */
export function newestStory<T extends { publishedAt: string }>(news: T[]): T | null {
  let best: T | null = null;
  for (const n of news) if (!best || Date.parse(n.publishedAt) > Date.parse(best.publishedAt)) best = n;
  return best;
}

export const CATALYST_LABELS: Record<string, string> = {
  fda_clinical: "FDA / CLINICAL",
  earnings: "EARNINGS",
  contract_partnership: "CONTRACT / PARTNERSHIP",
  merger_acquisition: "MERGER / BUYOUT",
  product_launch: "PRODUCT LAUNCH",
  analyst_action: "ANALYST ACTION",
  uplisting_index: "UPLISTING / INDEX",
  sector_sympathy: "SECTOR SYMPATHY",
  financing_offering: "FINANCING / OFFERING",
  theme_hype: "THEME HYPE",
  no_news: "NO NEWS",
  other: "OTHER NEWS",
};
