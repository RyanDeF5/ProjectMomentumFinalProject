import { useCallback, useEffect, useRef, useState } from "react";
import type { HoursWindow, JobKey, JobSchedule, ScheduleSnapshot, SchedulePatch, SessionKey } from "./types";

// Same origin by default: the Express server serves both the site and the API
const API_URL = import.meta.env.VITE_API_URL ?? "";

const REFRESH_MS = 15_000;

// ---------- Sessions ----------

/** The market sessions a job can run in, in the order of the day (times match the market clock). */
export const SESSIONS: { key: SessionKey; label: string; short: string; range: string; from: number; to: number }[] = [
  { key: "premarket", label: "PRE-MARKET", short: "PRE", range: "4:00 - 9:30 AM", from: 240, to: 570 },
  { key: "open", label: "MARKET OPEN", short: "OPEN", range: "9:30 AM - 4:00 PM", from: 570, to: 961 },
  { key: "afterhours", label: "AFTER HOURS", short: "AFTER", range: "4:00 - 8:00 PM", from: 961, to: 1201 },
  { key: "overnight", label: "OVERNIGHT", short: "NIGHT", range: "8:00 PM - 4:00 AM", from: 1201, to: 240 },
  { key: "weekend", label: "WEEKENDS", short: "WKND", range: "SAT & SUN, ALL DAY", from: 0, to: 1440 },
];

/** The weekday session a minute of the day falls in (server/schedule.js sessionAt). */
export function weekdaySession(minute: number): SessionKey {
  if (minute >= 240 && minute < 570) return "premarket";
  if (minute >= 570 && minute <= 960) return "open";
  if (minute > 960 && minute <= 1200) return "afterhours";
  return "overnight";
}

export function sessionAt(date: Date): SessionKey {
  const day = date.getDay();
  return day === 0 || day === 6 ? "weekend" : weekdaySession(date.getHours() * 60 + date.getMinutes());
}

export function inWindow(minute: number, hours: HoursWindow | null): boolean {
  if (!hours || hours.from === hours.to) return true;
  return hours.from < hours.to ? minute >= hours.from && minute < hours.to : minute >= hours.from || minute < hours.to;
}

/** Whether a job may run at a minute of a weekday (or of a weekend day). */
export function allowedAt(job: JobSchedule, minute: number, weekend = false): boolean {
  const session = weekend ? "weekend" : weekdaySession(minute);
  return job.sessions.includes(session) && inWindow(minute, job.hours);
}

/** Minutes a job may run on a weekday and on a weekend day. */
export function coverage(job: JobSchedule) {
  let weekday = 0;
  let weekend = 0;
  for (let m = 0; m < 1440; m++) {
    if (allowedAt(job, m)) weekday++;
    if (allowedAt(job, m, true)) weekend++;
  }
  return { weekday, weekend };
}

/** The stretches of a day a job runs, as [from, to) minute ranges, for the timeline. */
export function runs(job: JobSchedule, weekend = false): [number, number][] {
  const out: [number, number][] = [];
  let start: number | null = null;
  for (let m = 0; m <= 1440; m++) {
    const on = m < 1440 && allowedAt(job, m, weekend);
    if (on && start === null) start = m;
    if (!on && start !== null) {
      out.push([start, m]);
      start = null;
    }
  }
  return out;
}

/** "9:30 AM" from minutes after midnight. */
export function clockLabel(minute: number): string {
  const m = ((minute % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? "AM" : "PM"}`;
}

/** "4:00 AM" or "TUE 4:00 AM" for a moment on the server clock (shown in this device's time). */
export function resumeLabel(at: number, now: number): string {
  const d = new Date(at);
  const today = new Date(now);
  const time = clockLabel(d.getHours() * 60 + d.getMinutes());
  if (d.toDateString() === today.toDateString()) return time;
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return `TOMORROW ${time}`;
  return `${d.toLocaleString("en-US", { weekday: "short" }).toUpperCase()} ${time}`;
}

/** How often: "EVERY 30S", "EVERY 5 MIN", "EVERY 1H", or "OFF". */
export function everyLabel(seconds: number, off = "OFF"): string {
  if (!seconds) return off;
  if (seconds >= 3600) return `EVERY ${seconds / 3600}H`;
  if (seconds >= 60) return `EVERY ${seconds / 60} MIN`;
  return `EVERY ${seconds}S`;
}

/** Which sessions, in a few words: "PRE + OPEN", "ALL DAY", "NEVER". */
export function sessionsLabel(job: JobSchedule): string {
  const on = SESSIONS.filter((s) => job.sessions.includes(s.key));
  if (!on.length) return "NEVER";
  if (on.length === SESSIONS.length) return job.hours ? "ALL SESSIONS" : "ANY TIME";
  if (on.length === 3 && !job.sessions.includes("overnight") && !job.sessions.includes("weekend")) return "EXTENDED HOURS";
  return on.map((s) => s.short).join(" + ");
}

// ---------- Cost ----------

export interface JobCost {
  /** Tokens and time for one update (for the watchlist: one pass over every stock) */
  perUpdate: number;
  updateMs: number;
  perHour: number;
  /** While allowed to run, over a weekday, a weekend day and a week */
  weekday: number;
  weekend: number;
  week: number;
  updatesPerWeekday: number;
}

/** What a job costs on its schedule, from the server's measured timings and tokens. */
export function jobCost(snap: ScheduleSnapshot, key: JobKey, dryRun: boolean, job: JobSchedule = snap.jobs[key]): JobCost {
  const info = snap.info;
  let perUpdate = 0;
  let updateMs = 1000;
  let cycleMs = Infinity;
  let interval = 0;
  if (key === "screener") {
    const s = info.screener;
    const count = Math.min(s.boardSize, s.movers ?? s.boardSize);
    interval = s.interval;
    perUpdate = count * s.estimate.tokensPerGrade;
    updateMs = s.estimate.baseMs + count * s.estimate.gradeMs;
    cycleMs = interval * 1000 + updateMs;
  } else if (key === "news") {
    const n = info.news;
    const calls = Math.ceil(n.storyCount / Math.max(1, n.estimate.batch));
    interval = n.interval;
    perUpdate = n.storyCount * n.estimate.tokensPerStory + n.estimate.tokensPerBriefing;
    updateMs = n.estimate.baseMs + calls * n.estimate.batchMs + n.estimate.briefMs;
    cycleMs = interval * 1000 + updateMs;
  } else {
    const w = info.watchlist;
    interval = w.interval;
    // Each stock comes round again after the interval, or once every other stock has had its turn
    perUpdate = w.count * w.estimate.tokensPerUpdate;
    updateMs = Math.max(1, w.count) * w.estimate.updateMs;
    cycleMs = Math.max(interval * 1000 + w.estimate.updateMs, updateMs);
  }
  if (dryRun) perUpdate = 0;
  const perHour = interval && perUpdate ? (perUpdate * 3_600_000) / cycleMs : 0;
  const { weekday, weekend } = coverage(job);
  const day = (minutes: number) => Math.round((perHour * minutes) / 60);
  return {
    perUpdate,
    updateMs,
    perHour,
    weekday: day(weekday),
    weekend: day(weekend),
    week: day(weekday) * 5 + day(weekend) * 2,
    updatesPerWeekday: interval ? Math.floor((weekday * 60_000) / cycleMs) : 0,
  };
}

// ---------- Presets ----------

export interface Preset {
  id: string;
  title: string;
  detail: string;
  jobs: Record<JobKey, { interval: number; sessions: SessionKey[] }>;
}

const TRADING: SessionKey[] = ["premarket", "open"];
const EXTENDED: SessionKey[] = ["premarket", "open", "afterhours"];

export const PRESETS: Preset[] = [
  {
    id: "day-trader",
    title: "DAY TRADER",
    detail: "FAST UPDATES FROM PRE-MARKET TO THE CLOSE",
    jobs: {
      watchlist: { interval: 30, sessions: TRADING },
      screener: { interval: 120, sessions: TRADING },
      news: { interval: 300, sessions: TRADING },
    },
  },
  {
    id: "premarket",
    title: "PRE-MARKET PREP",
    detail: "HUNT FOR SETUPS BEFORE THE BELL ONLY",
    jobs: {
      watchlist: { interval: 60, sessions: ["premarket"] },
      screener: { interval: 60, sessions: ["premarket"] },
      news: { interval: 300, sessions: ["premarket"] },
    },
  },
  {
    id: "market-hours",
    title: "MARKET HOURS",
    detail: "STEADY UPDATES WHILE THE MARKET IS OPEN",
    jobs: {
      watchlist: { interval: 60, sessions: ["open"] },
      screener: { interval: 300, sessions: ["open"] },
      news: { interval: 600, sessions: ["open"] },
    },
  },
  {
    id: "extended",
    title: "EXTENDED HOURS",
    detail: "PRE-MARKET, THE OPEN AND AFTER HOURS",
    jobs: {
      watchlist: { interval: 60, sessions: EXTENDED },
      screener: { interval: 300, sessions: EXTENDED },
      news: { interval: 600, sessions: EXTENDED },
    },
  },
  {
    id: "light",
    title: "LIGHT",
    detail: "SLOW UPDATES, FEWEST TOKENS",
    jobs: {
      watchlist: { interval: 300, sessions: TRADING },
      screener: { interval: 900, sessions: ["open"] },
      news: { interval: 1800, sessions: EXTENDED },
    },
  },
];

/** The preset the schedule matches now, if any. */
export function matchingPreset(snap: ScheduleSnapshot): string | null {
  const same = (a: SessionKey[], b: SessionKey[]) => a.length === b.length && a.every((s) => b.includes(s));
  const found = PRESETS.find((p) =>
    (Object.keys(p.jobs) as JobKey[]).every((key) => {
      const want = p.jobs[key];
      return snap.info[key].interval === want.interval && same(snap.jobs[key].sessions, want.sessions) && !snap.jobs[key].hours;
    }),
  );
  return found?.id ?? null;
}

export function presetPatch(preset: Preset): SchedulePatch {
  return {
    paused: false,
    jobs: Object.fromEntries((Object.keys(preset.jobs) as JobKey[]).map((key) => [key, { ...preset.jobs[key], hours: null }])),
  };
}

// ---------- Server ----------

async function request(path: string, init?: RequestInit): Promise<ScheduleSnapshot> {
  const res = await fetch(`${API_URL}${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<ScheduleSnapshot>;
}

/**
 * The update schedule, loaded while `active` and kept fresh every few seconds. `apply` sends a
 * change and shows it straight away (the server's reply then takes over).
 */
export function useSchedule(active: boolean) {
  const [snap, setSnap] = useState<ScheduleSnapshot | null>(null);
  const [error, setError] = useState(false);
  const pending = useRef(0);

  const load = useCallback(() => {
    if (pending.current) return;
    request("/schedule")
      .then((next) => {
        if (!pending.current) setSnap(next);
        setError(false);
      })
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    if (!active) return;
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [active, load]);

  const apply = useCallback((patch: SchedulePatch) => {
    // Show the change at once
    setSnap((prev) => {
      if (!prev) return prev;
      const next: ScheduleSnapshot = { ...prev, ...patch, jobs: { ...prev.jobs }, info: { ...prev.info } };
      for (const [key, p] of Object.entries(patch.jobs ?? {}) as [JobKey, NonNullable<SchedulePatch["jobs"]>[JobKey]][]) {
        if (!p) continue;
        next.jobs[key] = { ...prev.jobs[key], ...(p.sessions ? { sessions: p.sessions } : {}), ...(p.hours !== undefined ? { hours: p.hours } : {}) };
        const info = { ...prev.info[key] } as ScheduleSnapshot["info"][JobKey];
        if (p.interval !== undefined) info.interval = p.interval;
        if (p.enabled === false) info.interval = 0;
        if (p.enabled === true && !info.interval) info.interval = info.resume;
        if (key === "screener" && p.boardSize !== undefined) (info as ScheduleSnapshot["info"]["screener"]).boardSize = p.boardSize;
        if (key === "news" && p.storyCount !== undefined) (info as ScheduleSnapshot["info"]["news"]).storyCount = p.storyCount;
        (next.info as Record<JobKey, unknown>)[key] = info;
      }
      return next;
    });
    pending.current++;
    request("/schedule", { method: "PUT", body: JSON.stringify(patch) })
      .then((next) => {
        pending.current--;
        if (!pending.current) setSnap(next);
      })
      .catch((err) => {
        pending.current--;
        console.error("Schedule change failed:", err);
        load();
      });
  }, [load]);

  return { schedule: snap, error, apply, reload: load };
}
