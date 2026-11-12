import { agoLabel } from "./watchlist";

/**
 * How old a page's data is, so nobody trades on numbers that have moved on:
 * fresh (nothing shown but the time), aging (the time turns orange), stale (an orange warning),
 * old (a pink warning and the data dimmed).
 */
export type Freshness = "fresh" | "aging" | "stale" | "old";

export type DataKind = "news" | "screener" | "stock";

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Age (ms) at which each kind of data turns aging, stale and old. Momentum moves fastest. */
export const FRESHNESS_LIMITS: Record<DataKind, { aging: number; stale: number; old: number }> = {
  // Movers and grades: a setup can fade within the hour
  screener: { aging: 30 * MIN, stale: 2 * HOUR, old: 8 * HOUR },
  // The news feed and Legend's briefing
  news: { aging: 1 * HOUR, stale: 3 * HOUR, old: 12 * HOUR },
  // A stock's quote and Legend's score (the watchlist and the summary screen)
  stock: { aging: 1 * HOUR, stale: 4 * HOUR, old: 24 * HOUR },
};

export function freshness(at: number | null | undefined, now: number, kind: DataKind): Freshness {
  if (!at) return "fresh";
  const age = now - at;
  const limit = FRESHNESS_LIMITS[kind];
  if (age >= limit.old) return "old";
  if (age >= limit.stale) return "stale";
  if (age >= limit.aging) return "aging";
  return "fresh";
}

/** Stale or old: worth a warning. */
export const isStale = (f: Freshness) => f === "stale" || f === "old";

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** A clear clock time for a timestamp: "3:42 PM", "YESTERDAY 3:42 PM", "FRI 3:42 PM", "NOV 3, 3:42 PM". */
export function stampLabel(at: number | null | undefined, now = Date.now()): string {
  if (!at || !Number.isFinite(at)) return "";
  const date = new Date(at);
  const time = date.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" }).toUpperCase();
  const days = Math.round((startOfDay(new Date(now)) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return time;
  if (days === 1) return `YESTERDAY ${time}`;
  if (days < 7) return `${date.toLocaleString("en-US", { weekday: "short" }).toUpperCase()} ${time}`;
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  const day = date.toLocaleString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).toUpperCase();
  return `${day}, ${time}`;
}

/** "4M AGO · 3:42 PM": how long ago, and when. Within the last minutes, just the age. */
export function whenLabel(at: number | null | undefined, now = Date.now()): string {
  if (!at) return "NOT YET";
  const ago = agoLabel(at, now);
  return now - at < 5 * MIN ? ago : `${ago} · ${stampLabel(at, now)}`;
}

/** "3 HOURS", "2 DAYS": a spoken age for the warnings. */
export function ageWords(at: number, now: number): string {
  const minutes = Math.max(1, Math.round((now - at) / MIN));
  if (minutes < 60) return `${minutes} MINUTE${minutes === 1 ? "" : "S"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} HOUR${hours === 1 ? "" : "S"}`;
  const days = Math.floor(hours / 24);
  return `${days} DAYS`;
}
