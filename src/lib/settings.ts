import { useSyncExternalStore } from "react";

// App settings shown on the Settings screen, saved in this browser.
export interface Settings {
  /** Show the DEV OPTIONS panel on the start screen */
  devOptions: boolean;
  /** Show the title screen once per browser session */
  titleScreen: boolean;
}

const STORAGE_KEY = "pm.settings";
const DEFAULTS: Settings = { devOptions: true, titleScreen: true };

function read(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

let current = read();
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage unavailable (private mode); settings last for this visit only
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const SPLASH_SEEN_KEY = "pm.splash.seen";
const SPLASH_FORCE_KEY = "pm.splash.force";

/** Whether to show the title screen on this page load. */
export function shouldShowTitleScreen(): boolean {
  try {
    if (sessionStorage.getItem(SPLASH_FORCE_KEY) === "1") {
      sessionStorage.removeItem(SPLASH_FORCE_KEY);
      return true;
    }
    return current.titleScreen && sessionStorage.getItem(SPLASH_SEEN_KEY) !== "1";
  } catch {
    return current.titleScreen;
  }
}

export function markTitleScreenSeen() {
  try {
    sessionStorage.setItem(SPLASH_SEEN_KEY, "1");
  } catch {
    // Storage unavailable; the title screen shows again next load
  }
}

/** Dev option: reload the page and start again from the title screen, like relaunching the game. */
export function restartFromTitleScreen() {
  try {
    sessionStorage.removeItem(SPLASH_SEEN_KEY);
    sessionStorage.setItem(SPLASH_FORCE_KEY, "1");
  } catch {
    // Storage unavailable; a plain reload still shows the title screen when it's enabled
  }
  window.location.reload();
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings);
}
