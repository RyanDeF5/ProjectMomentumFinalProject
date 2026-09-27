import { useEffect, useState } from "react";
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
}

// Market sessions are based on the device's local time, matching the original site.
function getMarketState(now: Date): MarketState {
  const day = now.getDay();
  if (day === 0 || day === 6) return "MARKET CLOSED";

  const militaryTime = now.getHours() * 100 + now.getMinutes();
  if (militaryTime >= 400 && militaryTime < 930) return "PRE-MARKET";
  if (militaryTime >= 930 && militaryTime <= 1600) return "MARKET OPEN";
  if (militaryTime > 1600 && militaryTime <= 2000) return "AFTER HOURS";
  return "MARKET CLOSED";
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

// Minutes after midnight when each weekday session begins, matching getMarketState above
const SESSION_STARTS: { minute: number; state: MarketState }[] = [
  { minute: 4 * 60, state: "PRE-MARKET" },
  { minute: 9 * 60 + 30, state: "MARKET OPEN" },
  { minute: 16 * 60 + 1, state: "AFTER HOURS" },
  { minute: 20 * 60 + 1, state: "MARKET CLOSED" },
];

const NEXT_LABEL: Record<MarketState, string> = {
  "PRE-MARKET": "PRE-MARKET IN",
  "MARKET OPEN": "MARKET OPENS IN",
  "AFTER HOURS": "MARKET CLOSES IN",
  "MARKET CLOSED": "AFTER HOURS ENDS IN",
};

/** Time until the next session change (weekends skipped, holidays not considered). */
export function nextSessionChange(now: Date): { label: string; remaining: string } {
  const next = new Date(now);
  next.setSeconds(0, 0);
  for (let day = 0; day < 8; day++) {
    const weekday = next.getDay();
    if (weekday !== 0 && weekday !== 6) {
      for (const session of SESSION_STARTS) {
        next.setHours(0, session.minute, 0, 0);
        if (next > now) return { label: NEXT_LABEL[session.state], remaining: formatDuration(next.getTime() - now.getTime()) };
      }
    }
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
  }
  return { label: "", remaining: "" };
}

function formatDuration(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const days = Math.floor(total / 86400);
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(Math.floor((total % 86400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  return days > 0 ? `${days}D ${clock}` : clock;
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
  };
}

// Ticks every 100ms like the original update loop, re-rendering only when the second changes.
export function useClock(): ClockData {
  const [clock, setClock] = useState(readClock);

  useEffect(() => {
    const id = setInterval(() => {
      const next = readClock();
      setClock((prev) =>
        prev.seconds === next.seconds && prev.minutes === next.minutes ? prev : next,
      );
    }, 100);
    return () => clearInterval(id);
  }, []);

  return clock;
}
