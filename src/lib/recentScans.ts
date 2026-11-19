import type { LegendResponse, NewsItem, StockData } from "./types";

// The last few stocks scanned by hand, kept on this device so they can be reopened without
// scanning again (the summary says how old the numbers are and offers SCAN AGAIN).

const KEY = "pm.recentScans";
export const RECENT_SCANS_MAX = 6;

export interface RecentScan {
  stock: StockData;
  legend: LegendResponse;
  news: NewsItem[];
  /** When it was scanned (ms) */
  at: number;
}

export function loadRecentScans(): RecentScan[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s) => s && s.stock && typeof s.stock.symbol === "string" && s.legend && Number.isFinite(s.at)).slice(0, RECENT_SCANS_MAX);
  } catch {
    return [];
  }
}

/** Put a scan at the top of the list (one entry per stock) and save it. Returns the new list. */
export function addRecentScan(list: RecentScan[], scan: RecentScan): RecentScan[] {
  const next = [scan, ...list.filter((s) => s.stock.symbol !== scan.stock.symbol)].slice(0, RECENT_SCANS_MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or unavailable: the list lasts for this visit only
  }
  return next;
}
