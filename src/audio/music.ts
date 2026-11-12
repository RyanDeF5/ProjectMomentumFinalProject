import { useSyncExternalStore } from "react";

// The menu soundtrack: every song in the project's Soundtrack folder (listed by the server),
// shuffled and played back to back, through Web Audio so the top bar's island can draw a live
// waveform from what's actually playing.

// Same origin by default: the Express server serves both the site and the API
const API_URL = import.meta.env.VITE_API_URL ?? "";

export interface Track {
  id: string;
  title: string;
  artist: string;
  url: string;
}

/** Album art for every song, for now: the game's poster */
export const COVER_ART = "/images/soundtrack/cover.jpg";

export interface MusicState {
  tracks: Track[];
  track: Track | null;
  /** Position in the shuffled queue and its length, for "3 OF 12" */
  position: number;
  playing: boolean;
  /** Waiting on the network (the song is buffering) */
  waiting: boolean;
  duration: number;
  volume: number;
  muted: boolean;
  /** Bumped on every new song, so the island can show what started */
  changes: number;
  error: string | null;
}

const MUTED_KEY = "pm.music.muted";
const VOLUME_KEY = "pm.music.volume";
const DEFAULT_VOLUME = 0.6;
const RESTART_AFTER_S = 3; // PREVIOUS restarts the song after this many seconds, like a phone

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

function readVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    const stored = Number(raw);
    return raw !== null && Number.isFinite(stored) ? Math.min(1, Math.max(0, stored)) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode); the setting lasts for this visit only
  }
}

function shuffled(count: number, avoidFirst?: number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  // A new round never starts with the song that just ended
  if (count > 1 && order[0] === avoidFirst) [order[0], order[1]] = [order[1], order[0]];
  return order;
}

class MusicPlayer {
  private state: MusicState = {
    tracks: [],
    track: null,
    position: 0,
    playing: false,
    waiting: false,
    duration: 0,
    volume: readVolume(),
    muted: readMuted(),
    changes: 0,
    error: null,
  };
  private listeners = new Set<() => void>();
  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  /** Taps the signal before the volume, so the waveform moves even when muted or quiet */
  analyser: AnalyserNode | null = null;
  private queue: number[] = [];
  private started = false;
  /** The app isn't in front (another tab, another window or app): the song keeps going, silent */
  private away = false;
  /** A stock search is on its loading screen: the music fades out, then back in for the results */
  private ducked = false;
  private loading: Promise<void> | null = null;

  getState = () => this.state;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private set(patch: Partial<MusicState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  /** Load the track list and wait for the first click or key press (browsers block sound before one). */
  init() {
    if (this.loading || typeof window === "undefined") return;
    this.loading = fetch(`${API_URL}/music/tracks`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<{ tracks: Track[] }>;
      })
      .then(({ tracks }) => {
        this.queue = shuffled(tracks.length);
        this.set({ tracks, position: 0, track: tracks[this.queue[0]] ?? null });
      })
      .catch((err) => {
        console.warn("Soundtrack unavailable:", err);
        this.set({ error: "SOUNDTRACK UNAVAILABLE" });
      });

    const start = () => {
      window.removeEventListener("pointerdown", start, true);
      window.removeEventListener("keydown", start, true);
      void this.loading?.then(() => {
        if (!this.started) void this.play();
      });
    };
    window.addEventListener("pointerdown", start, true);
    window.addEventListener("keydown", start, true);

    // Like the game: when the app isn't in front (another tab, or clicking into another window or
    // app), the music keeps playing but goes silent; coming back brings the sound up again, the
    // song having carried on in the meantime
    const check = () => this.setAway(document.hidden || !document.hasFocus());
    document.addEventListener("visibilitychange", check);
    window.addEventListener("blur", check);
    window.addEventListener("focus", check);
    check();
  }

  private setAway(away: boolean) {
    if (away === this.away) return;
    this.away = away;
    // A quick fade out on leaving, a slower fade back in on return
    this.fade(away ? 0.25 : 0.8);
  }

  /**
   * Like the game going into a race: the menu music fades out quickly as the loading screen comes
   * up, and fades back in once the results are showing. The song keeps playing underneath.
   */
  duck(on: boolean) {
    if (on === this.ducked) return;
    this.ducked = on;
    this.fade(on ? 0.6 : 1.4);
  }

  private fade(seconds: number) {
    if (!this.gain || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.linearRampToValueAtTime(this.level(), now + seconds);
  }

  private element(): HTMLAudioElement {
    if (this.audio) return this.audio;
    const audio = new Audio();
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";
    audio.addEventListener("play", () => this.set({ playing: true }));
    audio.addEventListener("pause", () => this.set({ playing: false }));
    audio.addEventListener("waiting", () => this.set({ waiting: true }));
    audio.addEventListener("playing", () => this.set({ waiting: false, error: null }));
    audio.addEventListener("loadedmetadata", () => this.set({ duration: audio.duration || 0 }));
    audio.addEventListener("durationchange", () => this.set({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 }));
    audio.addEventListener("ended", () => void this.next());
    audio.addEventListener("error", () => {
      // A missing or unreadable file: move on to the next song rather than stopping the music
      console.warn("Song failed to load:", this.state.track?.title);
      if (this.state.tracks.length > 1) window.setTimeout(() => void this.next(), 800);
      else this.set({ playing: false, error: "SONG FAILED TO LOAD" });
    });
    this.audio = audio;
    return audio;
  }

  /** Web Audio graph: song -> analyser -> volume -> speakers. Needs a user gesture to start. */
  private graph() {
    if (this.ctx || typeof AudioContext === "undefined") return;
    const audio = this.element();
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    // Fine enough to split the bass (about 12 Hz per bin) for the island's wave
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.55;
    const gain = ctx.createGain();
    gain.gain.value = this.level();
    source.connect(analyser).connect(gain).connect(ctx.destination);
    this.ctx = ctx;
    this.analyser = analyser;
    this.gain = gain;
  }

  private level() {
    if (this.state.muted || this.away || this.ducked) return 0;
    return this.state.volume ** 2; // perceptual curve for the slider
  }

  private applyLevel() {
    if (!this.gain || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.setTargetAtTime(this.level(), now, 0.05);
  }

  private load(track: Track) {
    const audio = this.element();
    if (audio.dataset.id !== track.id) {
      audio.src = `${API_URL}${track.url}`;
      audio.dataset.id = track.id;
      this.set({ track, duration: 0, waiting: true, changes: this.state.changes + 1 });
    }
  }

  async play() {
    const track = this.state.track;
    if (!track) return;
    this.started = true;
    this.graph();
    if (this.ctx?.state === "suspended") await this.ctx.resume();
    this.load(track);
    try {
      await this.element().play();
    } catch (err) {
      if ((err as DOMException)?.name !== "AbortError") console.warn("Music couldn't start:", err);
    }
  }

  pause() {
    this.audio?.pause();
  }

  toggle() {
    if (this.state.playing) this.pause();
    else void this.play();
  }

  private goTo(position: number) {
    const { tracks } = this.state;
    if (!tracks.length) return;
    let pos = position;
    if (pos >= this.queue.length) {
      // End of the round: shuffle again for the next one
      this.queue = shuffled(tracks.length, this.queue[this.queue.length - 1]);
      pos = 0;
    } else if (pos < 0) {
      pos = this.queue.length - 1;
    }
    const track = tracks[this.queue[pos]];
    this.set({ position: pos, track });
    this.load(track);
    void this.play();
  }

  async next() {
    this.goTo(this.state.position + 1);
  }

  async previous() {
    const audio = this.audio;
    if (audio && audio.currentTime > RESTART_AFTER_S) {
      audio.currentTime = 0;
      return;
    }
    this.goTo(this.state.position - 1);
  }

  /** Play a song from the list now; the shuffle carries on after it. */
  pick(id: string) {
    const index = this.state.tracks.findIndex((t) => t.id === id);
    if (index < 0) return;
    const pos = this.queue.indexOf(index);
    if (pos === this.state.position && this.state.track?.id === id) {
      void this.play();
      return;
    }
    // Move it right after the current song, then go to it
    this.queue.splice(pos, 1);
    const at = pos < this.state.position ? this.state.position : this.state.position + 1;
    this.queue.splice(at, 0, index);
    this.goTo(at);
  }

  /** Up next in the shuffle */
  upNext(count: number): Track[] {
    const out: Track[] = [];
    for (let i = 1; i <= count && i < this.queue.length; i++) {
      const pos = (this.state.position + i) % this.queue.length;
      out.push(this.state.tracks[this.queue[pos]]);
    }
    return out;
  }

  get time() {
    return this.audio?.currentTime ?? 0;
  }

  seek(seconds: number) {
    const audio = this.audio;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.min(Math.max(0, seconds), Math.max(0, audio.duration - 0.25));
  }

  skipBy(seconds: number) {
    this.seek(this.time + seconds);
  }

  setVolume(volume: number) {
    const v = Math.min(1, Math.max(0, volume));
    store(VOLUME_KEY, String(v));
    this.set({ volume: v, muted: v === 0 ? this.state.muted : false });
    if (v > 0) store(MUTED_KEY, "0");
    this.applyLevel();
  }

  setMuted(muted: boolean) {
    store(MUTED_KEY, muted ? "1" : "0");
    this.set({ muted });
    this.applyLevel();
  }
}

export const music = new MusicPlayer();

export function useMusic(): MusicState {
  return useSyncExternalStore(music.subscribe, music.getState);
}

// Dev only: reach the player from the console
if (import.meta.env.DEV && typeof window !== "undefined") (window as unknown as { __music: MusicPlayer }).__music = music;
