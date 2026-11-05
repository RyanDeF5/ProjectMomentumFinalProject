import { useEffect, useState } from "react";
import { openStream } from "./stream";
import type { MarketStory, NewsBriefing, NewsEngine, NewsEstimate, NewsSettings, NewsSnapshot, NewsStats, PulseQuote, StoryRead } from "./types";

// Same origin by default: the Express server serves both the site and the API
const API_URL = import.meta.env.VITE_API_URL ?? "";

export interface MarketNews {
  stories: MarketStory[];
  briefing: NewsBriefing | null;
  pulse: PulseQuote[];
  stats: NewsStats | null;
  estimate: NewsEstimate;
  settings: NewsSettings;
  engine: NewsEngine;
  intervals: number[];
  storyCounts: number[];
  connected: boolean;
  /** This device's clock minus the server's, for the countdown */
  clockOffset: number;
}

const INITIAL: MarketNews = {
  stories: [],
  briefing: null,
  pulse: [],
  stats: null,
  estimate: { tokensPerStory: 450, tokensPerBriefing: 1800, measured: false, batch: 5, batchMs: 9000, baseMs: 6500, briefMs: 7000 },
  settings: { interval: 600, dryRun: false, storyCount: 20 },
  engine: { state: "offline", step: null, nextAt: null },
  intervals: [0, 120, 300, 600, 900, 1800, 3600],
  storyCounts: [10, 20, 30, 50],
  connected: false,
  clockOffset: 0,
};

/** The market news feed and Legend's briefing, live from the server's event stream. */
export function useMarketNews(): MarketNews {
  const [news, setNews] = useState(INITIAL);

  useEffect(
    () =>
      openStream(
        "/market-news/stream",
        {
          snapshot: (data) => {
            const snap = data as NewsSnapshot;
            setNews({ ...snap, connected: true, clockOffset: Date.now() - snap.now });
          },
          feed: (data) => {
            const feed = data as Pick<NewsSnapshot, "stories" | "briefing" | "pulse" | "stats" | "estimate">;
            setNews((prev) => ({ ...prev, ...feed }));
          },
          settings: (data) => setNews((prev) => ({ ...prev, settings: data as NewsSettings })),
          engine: (data) => {
            const engine = data as NewsEngine;
            setNews((prev) => ({ ...prev, engine, clockOffset: engine.now ? Date.now() - engine.now : prev.clockOffset }));
          },
        },
        (up) => {
          if (!up) setNews((prev) => (prev.connected ? { ...prev, connected: false } : prev));
        },
      ),
    [],
  );

  return news;
}

async function request(path: string, init: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok && res.status !== 409) throw new Error(`Request failed: ${res.status}`);
  return res;
}

/** Update now, whatever the schedule says (ignored if an update is already running). */
export async function updateNewsNow() {
  await request("/market-news/update", { method: "POST" });
}

export async function updateNewsSettings(patch: Partial<NewsSettings>) {
  await request("/market-news/settings", { method: "PUT", body: JSON.stringify(patch) });
}

/** Legend's brief of a story for the in-app reader: written on first open and kept; `again` rewrites it. */
export async function readStory(id: string, again = false): Promise<StoryRead> {
  const res = await fetch(`${API_URL}/market-news/story/${encodeURIComponent(id)}/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ again }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<StoryRead>;
}

/** Shown on the feed: real news that matters today. Promos, old news and noise are only counted. */
export const isKept = (s: MarketStory) => Boolean(s.ai && (s.ai.quality === "solid" || s.ai.quality === "speculative") && s.ai.impact !== "none");

export const NEWS_CATEGORY_LABELS: Record<string, string> = {
  macro: "MACRO",
  earnings: "EARNINGS",
  fda_biotech: "FDA / BIOTECH",
  deal_mna: "DEAL / M&A",
  analyst: "ANALYSTS",
  ipo_listing: "IPO / LISTING",
  tech_ai: "TECH / AI",
  legal_regulatory: "LEGAL",
  company_news: "COMPANY",
  market_wrap: "MARKET WRAP",
  commodities: "COMMODITIES",
  crypto: "CRYPTO",
  other: "NEWS",
};

export const MOOD_LABELS: Record<NewsBriefing["mood"], string> = {
  risk_on: "RISK ON",
  risk_off: "RISK OFF",
  mixed: "MIXED",
  quiet: "QUIET",
};
