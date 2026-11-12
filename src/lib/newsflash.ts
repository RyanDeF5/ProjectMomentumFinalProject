import type { Newsflash } from "./types";

// The newsflash shows once a day, the first time the app is opened, covering the news since the last
// visit. The last visit is when the app was last in front: kept up to date every minute while open.

const API_URL = import.meta.env.VITE_API_URL ?? "";
const LAST_ACTIVE_KEY = "pm.lastActiveAt";
const SEEN_KEY = "pm.newsflash.day";
const ACTIVE_TICK_MS = 60_000;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode): the newsflash may show again next time
  }
}

const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** When the app was last open before this visit (ms), or null on a first visit. Read once, at load. */
export const lastVisit: number | null = (() => {
  const n = Number(read(LAST_ACTIVE_KEY));
  return Number.isFinite(n) && n > 0 ? n : null;
})();

let tracking = false;

/** Record the app being open (now, every minute while in front, and on leaving). */
export function trackVisits() {
  if (tracking || typeof window === "undefined") return;
  tracking = true;
  const mark = () => {
    if (!document.hidden) write(LAST_ACTIVE_KEY, String(Date.now()));
  };
  mark();
  window.setInterval(mark, ACTIVE_TICK_MS);
  document.addEventListener("visibilitychange", () => {
    // Leaving counts as the last moment seen; coming back starts counting again
    write(LAST_ACTIVE_KEY, String(Date.now()));
  });
  window.addEventListener("pagehide", () => write(LAST_ACTIVE_KEY, String(Date.now())));
}

/** Not yet shown (or found to have nothing big) today */
export function newsflashDue(): boolean {
  return read(SEEN_KEY) !== dayKey();
}

export function markNewsflashSeen() {
  write(SEEN_KEY, dayKey());
}

export type NewsflashResult = { status: "ready"; flash: Newsflash } | { status: "none" } | { status: "pending" };

/** The newsflash covering the time since `since` (ms); without it, the last day. */
export async function fetchNewsflash(since: number | null): Promise<NewsflashResult> {
  const query = since ? `?since=${Math.round(since)}` : "";
  const res = await fetch(`${API_URL}/market-news/newsflash${query}`);
  if (!res.ok && res.status !== 202) throw new Error(`Newsflash request failed: ${res.status}`);
  return res.json() as Promise<NewsflashResult>;
}

/** "SINCE 9:42 PM YESTERDAY", "SINCE FRIDAY 4:10 PM", or "LAST 24 HOURS" */
export function sinceLabel(flash: Pick<Newsflash, "since" | "window">, now = new Date()): string {
  if (flash.window === "recent") return "LAST 24 HOURS";
  const at = new Date(flash.since);
  const time = at.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" }).toUpperCase();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(at)) / 86_400_000);
  if (days <= 0) return `SINCE ${time} TODAY`;
  if (days === 1) return `SINCE ${time} YESTERDAY`;
  return `SINCE ${at.toLocaleString("en-US", { weekday: "long" }).toUpperCase()} ${time}`;
}
