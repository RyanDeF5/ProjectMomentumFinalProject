import { useSyncExternalStore } from "react";

// UI sound effects, played through Web Audio for low latency.
// Files are the project's SFX recordings, trimmed of leading silence (see public/sfx).
export type SfxName = "click" | "tap" | "launch" | "switch" | "race";

const FILES: Record<SfxName, string> = {
  click: "/sfx/button-1.mp3", // standard button press
  tap: "/sfx/button-2.mp3", // toggles, small controls
  launch: "/sfx/launch.mp3", // primary lime (BUY/PLAY style) buttons
  switch: "/sfx/screen-switch.mp3", // menu screen change
  race: "/sfx/screen-switch-race.mp3", // going into the loading screen before results
};

const VOLUME: Record<SfxName, number> = {
  click: 0.5,
  tap: 0.4,
  launch: 0.55,
  switch: 0.45,
  race: 0.5,
};

const STORAGE_KEY = "pm.sfx.muted";
const VOLUME_KEY = "pm.sfx.volume";
const noop = () => {};

// Sound is off until the user turns it on with the top bar's speaker tile
function readMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

function readVolume(): number {
  try {
    const stored = Number(localStorage.getItem(VOLUME_KEY));
    return localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(stored) ? Math.min(1, Math.max(0, stored)) : 1;
  } catch {
    return 1;
  }
}

class SoundBoard {
  muted = readMuted();
  /** Master volume from 0 to 1 (the Settings screen's SFX slider) */
  volume = readVolume();
  private ctx: AudioContext | null = null;
  private files = new Map<SfxName, Promise<ArrayBuffer>>();
  private buffers = new Map<SfxName, Promise<AudioBuffer | null>>();
  private listeners = new Set<() => void>();

  /** Start downloading sounds. The audio context itself waits for the first user gesture. */
  preload() {
    if (this.files.size || typeof window === "undefined") return;
    (Object.keys(FILES) as SfxName[]).forEach((name) => {
      this.files.set(
        name,
        fetch(FILES[name]).then((res) => {
          if (!res.ok) throw new Error(`${res.status} ${FILES[name]}`);
          return res.arrayBuffer();
        }),
      );
    });
    const unlock = () => {
      this.context();
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
  }

  private context(): AudioContext | null {
    if (!this.ctx && typeof AudioContext !== "undefined") this.ctx = new AudioContext();
    if (this.ctx?.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private buffer(name: SfxName): Promise<AudioBuffer | null> {
    let buffer = this.buffers.get(name);
    if (!buffer) {
      const ctx = this.context();
      const file = this.files.get(name);
      buffer =
        ctx && file
          ? file.then((data) => ctx.decodeAudioData(data.slice(0))).catch((err) => {
              console.warn("Sound failed to load:", name, err);
              return null;
            })
          : Promise.resolve(null);
      this.buffers.set(name, buffer);
    }
    return buffer;
  }

  /** Play a sound. Returns a function that fades it out early. */
  play(name: SfxName): () => void {
    if (this.muted || this.volume === 0) return noop;
    this.preload();
    const ctx = this.context();
    if (!ctx) return noop;

    let stopped = false;
    let stop = () => {
      stopped = true;
    };
    void this.buffer(name).then((buffer) => {
      if (!buffer || stopped || this.muted) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      gain.gain.value = VOLUME[name] * this.volume;
      source.connect(gain).connect(ctx.destination);
      source.start();
      stop = () => {
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.06);
        source.stop(ctx.currentTime + 0.4);
      };
    });
    return () => stop();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    try {
      localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
    } catch {
      // Storage unavailable (private mode); the setting lasts for this visit only
    }
    this.listeners.forEach((fn) => fn());
  }

  setVolume(volume: number) {
    this.volume = Math.min(1, Math.max(0, volume));
    try {
      localStorage.setItem(VOLUME_KEY, String(this.volume));
    } catch {
      // Storage unavailable; the setting lasts for this visit only
    }
    this.listeners.forEach((fn) => fn());
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
}

export const sfx = new SoundBoard();

export function useSfxMuted(): boolean {
  return useSyncExternalStore(sfx.subscribe, () => sfx.muted);
}

export function useSfxVolume(): number {
  return useSyncExternalStore(sfx.subscribe, () => sfx.volume);
}
