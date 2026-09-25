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
