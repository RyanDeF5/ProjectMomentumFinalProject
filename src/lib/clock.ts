import { useSyncExternalStore } from "react";
import { closedDayReason, dayKind, lastTradingDate, marketStateAt, nextSessionStart, nyParts } from "./marketCalendar";
import type { MarketState } from "./types";

export interface ClockData {
  hours: string;
  minutes: string;
  seconds: string;
  anteMeridiem: string;
  date: string;
  timeOfDay: string;
  marketState: MarketState;
  nextSession: { label: string; remaining: string };
  /** Why the market is closed all day today (a holiday's name, or THE WEEKEND); null on a trading day */
  closedFor: string | null;
  /** Today the market closes early, at 1:00 PM New York time */
  earlyClose: boolean;
}

// Market sessions follow New York time and the exchange's calendar (holidays, early closes),
// whatever this device's time zone is: see marketCalendar.ts.
const getMarketState = (now: Date): MarketState => marketStateAt(now);

const WEEKDAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

/**
 * The latest trading day as of now: today from 4:00 AM New York on a trading day, otherwise the
 * trading day before (weekends and holidays skipped). Returned as that date at noon, local time.
 */
export function lastTradingDay(now = new Date()): Date {
  const { y, m, d } = lastTradingDate(now);
  return new Date(y, m - 1, d, 12);
}

/**
 * Which day a price move belongs to, for "% UP TODAY": TODAY, YESTERDAY, the weekday (FRIDAY) within
 * the week, or the date. Uses the quote's own time when there is one (so holidays come out right),
 * otherwise the latest trading day by the clock (on a weekend, a stock's change is Friday's).
 */
export function moveDayLabel(sessionAt?: string | number | null, now = new Date()): string {
  const parsed = sessionAt ? new Date(sessionAt) : null;
  const at = parsed && Number.isFinite(parsed.getTime()) ? parsed : lastTradingDay(now);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(at)) / 86_400_000);
  if (days <= 0) return "TODAY";
  if (days === 1) return "YESTERDAY";
  if (days < 7) return `ON ${WEEKDAYS[at.getDay()]}`;
  return `ON ${at.toLocaleString("en-US", { month: "short", day: "numeric" }).toUpperCase()}`;
}

function getDate(now: Date): string {
  const month = now.toLocaleString("default", { month: "long" });
  const year = now.getFullYear();
  const dateNum = now.getDate();
  let suffix = "th";

  if (dateNum === 1 || dateNum === 21 || dateNum === 31) suffix = "st";
  else if (dateNum === 2 || dateNum === 22) suffix = "nd";
  else if (dateNum === 3 || dateNum === 23) suffix = "rd";

  const dayOfWeek = now.toLocaleString("default", { weekday: "long" });
  return `It is ${dayOfWeek}, ${month} ${dateNum}${suffix}, ${year}`;
}

const NEXT_LABEL: Record<MarketState, string> = {
  "PRE-MARKET": "PRE-MARKET IN",
  "MARKET OPEN": "MARKET OPENS IN",
  "AFTER HOURS": "MARKET CLOSES IN",
  "MARKET CLOSED": "AFTER HOURS ENDS IN",
};

// The next session change is worked out once and kept until it passes (the clock asks every tick)
let upcoming: { from: number; at: number; state: MarketState } | null = null;

/** Time until the next session change (weekends, holidays and early closes accounted for). */
export function nextSessionChange(now: Date): { label: string; remaining: string } {
  const t = now.getTime();
  if (!upcoming || t >= upcoming.at || t < upcoming.from) {
    const next = nextSessionStart(now);
    upcoming = next ? { from: t, ...next } : null;
  }
  if (!upcoming) return { label: "", remaining: "" };
  return { label: NEXT_LABEL[upcoming.state], remaining: formatDuration(upcoming.at - t) };
}

function formatDuration(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const days = Math.floor(total / 86400);
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(Math.floor((total % 86400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  return days > 0 ? `${days}D ${clock}` : clock;
}

function isEarlyClose(now: Date): boolean {
  const p = nyParts(now);
  return dayKind(p.y, p.m, p.d) === "early";
}

export function readClock(now = new Date()): ClockData {
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const twelveHour = hours % 12 === 0 ? 12 : hours % 12;

  return {
    hours: `${twelveHour}`,
    minutes: minutes < 10 ? `0${minutes}` : `${minutes}`,
    seconds: seconds < 10 ? `0${seconds}` : `${seconds}`,
    anteMeridiem: hours >= 12 ? "PM" : "AM",
    date: getDate(now),
    timeOfDay: hours >= 12 ? " Good Evening " : " Good Morning ",
    marketState: getMarketState(now),
    nextSession: nextSessionChange(now),
    closedFor: closedDayReason(now),
    earlyClose: isEarlyClose(now),
  };
}

// One shared clock for the whole app: a single 100ms check that only notifies subscribers when the
// second changes. Components read just what they show (the time, or only the market session), so
// the rest of the app no longer re-renders every second.
let current = readClock();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (!timer) {
    timer = setInterval(() => {
      const next = readClock();
      if (next.seconds === current.seconds && next.minutes === current.minutes) return;
      current = next;
      listeners.forEach((l) => l());
    }, 100);
  }
  return () => {
    listeners.delete(fn);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** The full clock, re-rendering every second: only for components that show the time. */
export function useClock(): ClockData {
  return useSyncExternalStore(subscribe, () => current);
}

/** Only the market session, re-rendering when it changes (a few times a day). */
export function useMarketState(): MarketState {
  return useSyncExternalStore(subscribe, () => current.marketState);
}

/** The market session right now, for code outside rendering (e.g. starting a scan). */
export function marketStateNow(): MarketState {
  return getMarketState(new Date());
}
