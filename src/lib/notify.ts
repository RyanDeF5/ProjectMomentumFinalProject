import { useSyncExternalStore } from "react";
import type { WatchAlert } from "./types";

// Notifications are shown one at a time, oldest first: the big "goal completed" style takeover for
// bullish news, and the slim banner (like the game's TRADE COINS strip) for everything else.

let queue: WatchAlert[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

/** Queue a notification (a burst of the same kind for the same stock collapses into one). */
export function notify(alert: WatchAlert) {
  if (queue.some((a) => a.kind === alert.kind && a.symbol === alert.symbol)) return;
  queue = [...queue, alert].slice(-6);
  emit();
}

/** The one on screen is done; show the next. */
export function dismissNotification(id: string) {
  queue = queue.filter((a) => a.id !== id);
  emit();
}

export function useCurrentNotification(): WatchAlert | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => queue[0] ?? null,
  );
}

let testSeq = 0;

/** Sample notifications for the Settings screen's test buttons. */
export function testNotification(kind: WatchAlert["kind"], symbol = "NVDA", name = "NVIDIA Corporation") {
  const base = { id: `test-${Date.now()}-${++testSeq}`, symbol, name, at: Date.now() };
  notify(
    kind === "bullish"
      ? { ...base, kind, title: `${name} beats estimates and raises full-year guidance`, publisher: "Reuters", impact: "A fresh catalyst with real numbers behind it", more: 0 }
      : { ...base, kind, from: "B", to: "A", score: 1482, delta: 236 },
  );
}

// ---------- Token drop (the top bar's A-token animation), for testing ----------

const dropListeners = new Set<() => void>();

/** Play the token tile's incoming-tokens animation without changing the count. */
export function testTokenDrop() {
  dropListeners.forEach((fn) => fn());
}

export function onTokenDropTest(fn: () => void): () => void {
  dropListeners.add(fn);
  return () => dropListeners.delete(fn);
}
