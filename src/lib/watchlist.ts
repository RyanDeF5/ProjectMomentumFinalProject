import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { scoreToClass } from "./numbers";
import type { LegendResponse, NewsItem, StockData, WatchAlert, WatchEngine, WatchItem, WatchSettings, WatchSnapshot } from "./types";
import { notify } from "./notify";
import { openStream } from "./stream";

// Same origin by default: the Express server serves both the site and the API
const API_URL = import.meta.env.VITE_API_URL ?? "";

// ---------- Live list ----------

export interface Watchlist {
  items: WatchItem[];
  settings: WatchSettings;
  engine: WatchEngine;
  limit: number;
  intervals: number[];
  /** Whether the live stream is connected */
  connected: boolean;
  /** This device's clock minus the server's, for countdowns */
  clockOffset: number;
}

const INITIAL: Watchlist = {
  items: [],
  settings: { interval: 30, dryRun: false },
  engine: { state: "offline", symbol: null, nextAt: null },
  limit: 30,
  intervals: [0, 10, 30, 60],
  connected: false,
  clockOffset: 0,
};

/**
 * The watchlist, kept live from the server's event stream (the server runs the updates while any
 * page is connected). `onUpdated` fires when a stock finishes a new update.
 */
export function useWatchlist(onUpdated?: (item: WatchItem) => void): Watchlist {
  const [list, setList] = useState(INITIAL);
  const onUpdatedRef = useRef(onUpdated);
  onUpdatedRef.current = onUpdated;

  useEffect(() => {
    const known = new Map<string, number | null>();
    // Reconnects by itself; a fresh snapshot follows each time
    return openStream(
      "/watchlist/stream",
      {
        snapshot: (data) => {
          const snap = data as WatchSnapshot;
          known.clear();
          snap.items.forEach((item) => known.set(item.symbol, item.updatedAt));
          setList({ ...snap, connected: true, clockOffset: Date.now() - snap.now });
        },
        item: (data) => {
          const item = data as WatchItem;
          const before = known.get(item.symbol);
          known.set(item.symbol, item.updatedAt);
          if (before !== undefined && item.updatedAt && item.updatedAt !== before) onUpdatedRef.current?.(item);
          setList((prev) => {
            const at = prev.items.findIndex((x) => x.symbol === item.symbol);
            const items = at < 0 ? [...prev.items, item] : prev.items.map((x, i) => (i === at ? item : x));
            return { ...prev, items };
          });
        },
        remove: (data) => {
          const { symbol } = data as { symbol: string };
          known.delete(symbol);
          setList((prev) => ({ ...prev, items: prev.items.filter((x) => x.symbol !== symbol) }));
        },
        settings: (data) => setList((prev) => ({ ...prev, settings: data as WatchSettings })),
        engine: (data) => {
          const engine = data as WatchEngine;
          setList((prev) => ({ ...prev, engine, clockOffset: engine.now ? Date.now() - engine.now : prev.clockOffset }));
        },
        alert: (data) => notify(data as WatchAlert),
      },
      (up) => {
        if (!up) setList((prev) => (prev.connected ? { ...prev, connected: false } : prev));
      },
    );
  }, []);

  return list;
}

// ---------- Changes ----------

async function request(path: string, init: RequestInit): Promise<Response> {
  const res = await fetch(`${API_URL}${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Request failed: ${res.status}`);
  }
  return res;
}

/** Add a stock; a scan's results can come along so its card is complete straight away. */
export async function addToWatchlist(symbol: string, snapshot?: { stock: StockData; legend: LegendResponse; news: NewsItem[] }) {
  await request("/watchlist", { method: "POST", body: JSON.stringify({ symbol, snapshot }) });
}

export async function removeFromWatchlist(symbol: string) {
  await request(`/watchlist/${encodeURIComponent(symbol)}`, { method: "DELETE" });
}

/** Update a stock now, ahead of the schedule. */
export async function refreshWatchItem(symbol: string) {
  await request(`/watchlist/${encodeURIComponent(symbol)}/refresh`, { method: "POST" });
}

export async function updateWatchSettings(patch: Partial<WatchSettings>) {
  await request("/watchlist/settings", { method: "PUT", body: JSON.stringify(patch) });
}

// ---------- Derived values ----------

export const watchScore = (item: WatchItem): number | null => (item.legend ? Math.round(Number(item.legend.score)) : null);

export const watchClass = (item: WatchItem): string => (item.legend ? scoreToClass(item.legend.score) : "?");

export function watchChange(item: WatchItem): number | null {
  const s = item.stock;
  if (!s || !Number.isFinite(s.currentPrice) || !s.lastClose) return null;
  return ((s.currentPrice - s.lastClose) / s.lastClose) * 100;
}

export function watchRvol(item: WatchItem): number | null {
  const s = item.stock;
  return s && s.averageVolume ? s.volume / s.averageVolume : null;
}

/** Cards with this many stars or more are gold, like the game's maxed cars. */
export const GOLD_STARS = 4;

/** Stars from 0 to 6, like the garage cards, for the score out of 2000. */
export const watchStars = (item: WatchItem): number => {
  const score = watchScore(item);
  return score === null ? 0 : Math.max(0, Math.min(6, Math.round((score / 2000) * 6)));
};

/** Which way the last update moved the score: 1 up, -1 down, 0 unchanged or unknown. */
export function watchTrend(item: WatchItem): -1 | 0 | 1 {
  const score = watchScore(item);
  if (score === null || item.prevScore === null) return 0;
  const delta = score - Math.round(item.prevScore);
  return delta > 0 ? 1 : delta < 0 ? -1 : 0;
}

/** Card headline flag: an update failure, or serious risk from Legend's read. */
export function watchAlert(item: WatchItem): string | null {
  if (item.error) return item.error;
  const risk = item.legend?.riskLevel;
  if (risk === "critical") return "CRITICAL RISK";
  if (risk === "severe") return "HIGH RISK";
  return null;
}

export const CLASS_ORDER = ["S", "A", "B", "C", "D"];

// ---------- Sorting (shared by the home list and the watchlist screen, saved in this browser) ----------

export type WatchSortKey = "class" | "score" | "change" | "rvol" | "price" | "symbol" | "added" | "updated";

export const SORTS: { value: WatchSortKey; label: string }[] = [
  { value: "class", label: "CLASS" },
  { value: "score", label: "SCORE" },
  { value: "change", label: "% CHANGE" },
  { value: "rvol", label: "RELATIVE VOLUME" },
  { value: "price", label: "PRICE" },
  { value: "symbol", label: "TICKER" },
  { value: "added", label: "RECENTLY ADDED" },
  { value: "updated", label: "LAST UPDATED" },
];

export interface WatchSort {
  key: WatchSortKey;
  /** true: highest first (A to Z for tickers) */
  descending: boolean;
}

const SORT_KEY = "pm.watchlist.sort";

function readSort(): WatchSort {
  try {
    const saved = JSON.parse(localStorage.getItem(SORT_KEY) ?? "null") as WatchSort | null;
    if (saved && SORTS.some((s) => s.value === saved.key)) return { key: saved.key, descending: saved.descending !== false };
  } catch {
    // Fall back to the default
  }
  return { key: "class", descending: true };
}

let sortState = readSort();
const sortListeners = new Set<() => void>();

export function setWatchSort(next: WatchSort) {
  sortState = next;
  try {
    localStorage.setItem(SORT_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable; the choice lasts for this visit only
  }
  sortListeners.forEach((fn) => fn());
}

export function useWatchSort(): WatchSort {
  return useSyncExternalStore(
    (fn) => {
      sortListeners.add(fn);
      return () => sortListeners.delete(fn);
    },
    () => sortState,
  );
}

function sortValue(item: WatchItem, key: WatchSortKey): number | string | null {
  switch (key) {
    case "class":
    case "score":
      return watchScore(item);
    case "change":
      return watchChange(item);
    case "rvol":
      return watchRvol(item);
    case "price":
      return item.stock?.currentPrice ?? null;
    case "symbol":
      return item.symbol;
    case "added":
      return item.addedAt;
    case "updated":
      return item.updatedAt;
  }
}

/** Sorted copy; stocks without a value for the key (not analyzed yet) always go last. */
export function sortWatchItems(items: WatchItem[], { key, descending }: WatchSort): WatchItem[] {
  const dir = key === "symbol" ? (descending ? 1 : -1) : descending ? -1 : 1;
  return [...items].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === null || vb === null) return va === vb ? a.symbol.localeCompare(b.symbol) : va === null ? 1 : -1;
    if (va === vb) return a.symbol.localeCompare(b.symbol);
    return (va < vb ? -1 : 1) * dir;
  });
}

/** Ticks every `ms` so "12S AGO" labels and countdowns stay current; stops while `enabled` is false. */
export function useNow(ms = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms, enabled]);
  return now;
}

/** "NOW", "12S AGO", "4M AGO", "2H AGO". */
export function agoLabel(at: number | null, now: number): string {
  if (!at) return "NOT YET";
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 3) return "JUST NOW";
  if (seconds < 60) return `${seconds}S AGO`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}M AGO`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}H AGO`;
  return `${Math.floor(seconds / 86_400)}D AGO`;
}

export function intervalLabel(seconds: number): string {
  if (!seconds) return "PAUSED";
  if (seconds >= 3600) return `EVERY ${seconds / 3600}H`;
  return seconds >= 60 ? `EVERY ${seconds / 60} MIN` : `EVERY ${seconds}S`;
}
