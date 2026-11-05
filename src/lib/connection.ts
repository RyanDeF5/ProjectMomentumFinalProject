import { useEffect, useState, useSyncExternalStore } from "react";

// Same origin by default: the Express server serves both the site and the API
const API_URL = import.meta.env.VITE_API_URL ?? "";

const POLL_MS = 10_000;
const POLL_BAD_MS = 4000; // check more often while something is wrong
const TIMEOUT_MS = 6000;
const SLOW_MS = 900; // a round trip to the server slower than this is a weak connection
const STREAM_GRACE_MS = 6000; // live streams may drop briefly while reconnecting

export type ConnectionState = "ok" | "weak" | "internet" | "offline";

export interface Connection {
  state: ConnectionState;
  label: string;
  detail: string;
}

const OK: Connection = { state: "ok", label: "", detail: "" };
const STATES: Record<Exclude<ConnectionState, "ok">, Connection> = {
  weak: { state: "weak", label: "WEAK CONNECTION", detail: "UPDATES MAY BE SLOW" },
  internet: { state: "internet", label: "NO INTERNET", detail: "MARKET DATA UNREACHABLE" },
  offline: { state: "offline", label: "NO CONNECTION", detail: "RECONNECTING" },
};

interface Health {
  ok: boolean;
  internet: { state: "ok" | "slow" | "down" | "unknown"; ms: number | null };
}

// ---------- Settings test: show a state for a few seconds ----------

let testState: Connection | null = null;
let testTimer: number | undefined;
const testListeners = new Set<() => void>();

export function testConnection(state: Exclude<ConnectionState, "ok"> = "weak", ms = 7000) {
  testState = STATES[state];
  window.clearTimeout(testTimer);
  testTimer = window.setTimeout(() => {
    testState = null;
    testListeners.forEach((l) => l());
  }, ms);
  testListeners.forEach((l) => l());
}

function useTestState() {
  return useSyncExternalStore(
    (fn) => {
      testListeners.add(fn);
      return () => testListeners.delete(fn);
    },
    () => testState,
  );
}

/**
 * How well this page is connected: the browser's own online flag, a regular timed check of the
 * server (/health, which also reports whether the server can reach the web) and whether the live
 * streams (`streamsUp`) are holding.
 */
export function useConnection(streamsUp: boolean): Connection {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [health, setHealth] = useState<{ fails: number; rtts: number[]; internet: Health["internet"]["state"] }>({
    fails: 0,
    rtts: [],
    internet: "unknown",
  });
  const [streamsLate, setStreamsLate] = useState(false);
  const test = useTestState();

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    let stopped = false;
    let bad = false;

    async function check() {
      window.clearTimeout(timer);
      if (stopped) return;
      // Hidden tabs don't need to know
      if (document.visibilityState === "visible") {
        const started = performance.now();
        try {
          const res = await fetch(`${API_URL}/health`, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
          if (!res.ok) throw new Error(String(res.status));
          const body = (await res.json()) as Health;
          const rtt = performance.now() - started;
          bad = rtt > SLOW_MS || body.internet.state === "down" || body.internet.state === "slow";
          if (!stopped) setHealth((prev) => ({ fails: 0, rtts: [...prev.rtts, rtt].slice(-3), internet: body.internet.state }));
        } catch {
          bad = true;
          if (!stopped) setHealth((prev) => ({ ...prev, fails: prev.fails + 1 }));
        }
      }
      if (!stopped) timer = window.setTimeout(check, bad ? POLL_BAD_MS : POLL_MS);
    }

    const recheck = () => {
      if (document.visibilityState === "visible") void check();
    };
    void check();
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("online", recheck);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("online", recheck);
    };
  }, []);

  useEffect(() => {
    if (streamsUp) {
      setStreamsLate(false);
      return;
    }
    const timer = window.setTimeout(() => setStreamsLate(true), STREAM_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [streamsUp]);

  if (test) return test;
  if (!online || health.fails >= 2) return STATES.offline;
  if (health.internet === "down") return STATES.internet;
  const sorted = [...health.rtts].sort((a, b) => a - b);
  const typical = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  if (health.fails === 1 || typical > SLOW_MS || health.internet === "slow" || streamsLate) return STATES.weak;
  return OK;
}
