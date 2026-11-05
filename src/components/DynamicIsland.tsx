import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { COVER_ART, music, useMusic, type Track } from "../audio/music";
import { SoundIcon } from "../ui/Icons";

// The soundtrack's now-playing island in the top bar, after the iPhone's Dynamic Island: a black
// pill with the album art and a live waveform; tap (or press and hold) to open the player, which
// grows out of the pill with a springy morph. When a new song starts, the pill briefly widens to
// show its name, then settles back.

type Mode = "compact" | "peek" | "expanded";

const PEEK_MS = 4500;
const HOLD_MS = 380;

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

// ---------- Live waveform ----------

/** The bass only (kick and bass line, 35-220 Hz), split log-spaced into one slice per bar */
const BASS_LO = 35;
const BASS_HI = 220;
function bassBands(count: number, sampleRate: number, bins: number) {
  const hzPerBin = sampleRate / 2 / bins;
  return Array.from({ length: count }, (_, i) => {
    const from = BASS_LO * (BASS_HI / BASS_LO) ** (i / count);
    const to = BASS_LO * (BASS_HI / BASS_LO) ** ((i + 1) / count);
    const a = Math.max(1, Math.floor(from / hzPerBin));
    return [a, Math.max(a + 1, Math.ceil(to / hzPerBin))] as const;
  });
}

/** Middle bars reach higher than the outer ones, like the phone's wave */
const profile = (i: number, bars: number) => {
  const c = (bars - 1) / 2;
  return c ? 0.62 + 0.38 * (1 - Math.abs(i - c) / c) : 1;
};

/**
 * Bars that pump with the bass of what's playing right now: one bass envelope drives every bar (so
 * they move together on the kick), each bar tilted a little by its own slice of the bass. Read from the
 * analyser every frame, straight to the DOM (no React renders). Still and low when paused.
 */
function Wave({ bars, playing, className = "" }: { bars: number; playing: boolean; className?: string }) {
  const refs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const set = (i: number, h: number) => {
      const el = refs.current[i];
      if (el) el.style.transform = `scaleY(${h.toFixed(3)})`;
    };
    if (!playing || !music.analyser) {
      for (let i = 0; i < bars; i++) set(i, 0.16 + 0.1 * profile(i, bars));
      return;
    }
    const analyser = music.analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const bands = bassBands(bars, analyser.context.sampleRate, analyser.frequencyBinCount);
    const raw = new Float32Array(bars);
    const level = new Float32Array(bars);
    // Recent loudest and quietest bass, drifting: bars are drawn between them (an auto-gain), so
    // they pump on the kick of a loud master instead of sitting pinned at the top
    let peak = 0.3;
    let floor = 0.5;
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (document.hidden) return;
      analyser.getByteFrequencyData(data);
      let total = 0;
      bands.forEach(([a, b], i) => {
        let sum = 0;
        for (let k = a; k < b; k++) sum += data[k];
        raw[i] = sum / (b - a) / 255;
        total += raw[i];
      });
      const bass = total / bars;
      peak = Math.max(bass, peak * 0.995, 0.08);
      floor = Math.min(bass, floor + (bass - floor) * 0.008);
      const span = Math.max(0.06, peak - floor);
      const n = Math.min(1, Math.max(0, (bass - floor) / span));
      const loudest = Math.max(...raw, 0.01);
      for (let i = 0; i < bars; i++) {
        // One bass envelope for all bars; each slice only tilts its bar a little
        const tilt = 0.82 + 0.18 * (raw[i] / loudest);
        const target = 0.14 + 0.86 * n ** 2 * profile(i, bars) * tilt;
        // Snaps up on the hit, eases back down between hits
        level[i] += (target - level[i]) * (target > level[i] ? 0.65 : 0.18);
        set(i, level[i]);
      }
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [bars, playing]);

  return (
    <span className={`iwave${playing ? " is-playing" : ""} ${className}`} aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} ref={(el) => void (refs.current[i] = el)} className="iwave__bar" />
      ))}
    </span>
  );
}

// ---------- Icons (filled, rounded, like the phone's player) ----------

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden>
    <path d="M7 4.6c0-1 1.1-1.6 2-1.1l11.3 6.9c.8.5.8 1.7 0 2.2L9 19.5c-.9.5-2-.1-2-1.1z" fill="currentColor" />
  </svg>
);
const PauseIcon = () => (
  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden>
    <rect x="5.5" y="4" width="4.6" height="16" rx="1.4" fill="currentColor" />
    <rect x="13.9" y="4" width="4.6" height="16" rx="1.4" fill="currentColor" />
  </svg>
);
const SkipIcon = ({ back }: { back?: boolean }) => (
  <svg viewBox="0 0 32 24" width="34" height="26" aria-hidden style={back ? { transform: "scaleX(-1)" } : undefined}>
    <path d="M3 5.3c0-.9 1-1.4 1.7-.9l9.4 6.7c.6.4.6 1.4 0 1.8l-9.4 6.7c-.7.5-1.7 0-1.7-.9z" fill="currentColor" />
    <path d="M15 5.3c0-.9 1-1.4 1.7-.9l9.4 6.7c.6.4.6 1.4 0 1.8l-9.4 6.7c-.7.5-1.7 0-1.7-.9z" fill="currentColor" />
  </svg>
);
const ListIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M4 6h11M4 12h11M4 18h7" />
    <path d="M19 5v10.5" />
    <circle cx="17" cy="16.5" r="2.2" fill="currentColor" stroke="none" />
  </svg>
);

// ---------- Scrubber ----------

/** Elapsed, the bar (drag or click to seek, arrows skip 10 s) and remaining, refreshed every frame. */
function Scrubber({ duration, active }: { duration: number; active: boolean }) {
  const fill = useRef<HTMLSpanElement>(null);
  const elapsed = useRef<HTMLSpanElement>(null);
  const left = useRef<HTMLSpanElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const t = drag.current ?? music.time;
      const pct = duration > 0 ? Math.min(1, t / duration) : 0;
      if (fill.current) fill.current.style.transform = `scaleX(${pct})`;
      if (elapsed.current) elapsed.current.textContent = fmt(t);
      if (left.current) left.current.textContent = `-${fmt(Math.max(0, duration - t))}`;
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [active, duration]);

  const at = (e: PointerEvent) => {
    const r = track.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * duration;
  };

  return (
    <div className="iscrub">
      <span className="iscrub__time" ref={elapsed}>
        0:00
      </span>
      <div
        ref={track}
        className={`iscrub__track${dragging ? " is-dragging" : ""}`}
        role="slider"
        tabIndex={0}
        aria-label="Song position"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(music.time)}
        aria-valuetext={`${fmt(music.time)} of ${fmt(duration)}`}
        onPointerDown={(e) => {
          if (!duration) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = at(e);
          setDragging(true);
        }}
        onPointerMove={(e) => {
          if (drag.current !== null) drag.current = at(e);
        }}
        onPointerUp={(e) => {
          if (drag.current === null) return;
          music.seek(at(e));
          drag.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === "ArrowRight") music.skipBy(10);
          else if (e.key === "ArrowLeft") music.skipBy(-10);
          else return;
          e.preventDefault();
        }}
      >
        <span className="iscrub__rail">
          <span className="iscrub__fill" ref={fill} />
        </span>
      </div>
      <span className="iscrub__time is-left" ref={left}>
        -0:00
      </span>
    </div>
  );
}

// ---------- The island ----------

function Playlist({ tracks, current, playing }: { tracks: Track[]; current: Track | null; playing: boolean }) {
  const next = music.upNext(1)[0];
  return (
    <div className="iplaylist">
      <div className="iplaylist__head">
        <span>SOUNDTRACK</span>
        <span className="iplaylist__count">{tracks.length} SONGS · SHUFFLE</span>
      </div>
      <ul className="iplaylist__list">
        {tracks.map((t) => {
          const on = t.id === current?.id;
          return (
            <li key={t.id}>
              <button type="button" className={`iplaylist__item${on ? " is-on" : ""}`} onClick={() => music.pick(t.id)}>
                <span className="iplaylist__mark">{on ? <Wave bars={3} playing={playing} className="is-tiny" /> : null}</span>
                <span className="iplaylist__text">
                  <span className="iplaylist__title">{t.title}</span>
                  <span className="iplaylist__artist">{t.artist}</span>
                </span>
                {!on && t.id === next?.id && <span className="iplaylist__next">UP NEXT</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DynamicIsland() {
  const state = useMusic();
  const [mode, setMode] = useState<Mode>("compact");
  const [list, setList] = useState(false);
  const island = useRef<HTMLDivElement>(null);
  const hold = useRef<number | undefined>(undefined);
  const held = useRef(false);
  const lastChange = useRef(state.changes);

  useEffect(() => music.init(), []);

  // A new song: widen for a moment to show its name (unless the player is open)
  useEffect(() => {
    if (state.changes === lastChange.current) return;
    lastChange.current = state.changes;
    if (mode === "expanded") return;
    setMode("peek");
    const timer = window.setTimeout(() => setMode((m) => (m === "peek" ? "compact" : m)), PEEK_MS);
    return () => window.clearTimeout(timer);
  }, [state.changes, mode]);

  // Open: a tap outside or Escape closes it
  useEffect(() => {
    if (mode !== "expanded") return;
    const outside = (e: Event) => {
      if (!island.current?.contains(e.target as Node)) setMode("compact");
    };
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setMode("compact");
    };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", key);
    };
  }, [mode]);

  useLayoutEffect(() => {
    if (mode !== "expanded") setList(false);
  }, [mode]);


  // The anchor: a fixed point in the top bar the island is centered on (styles/island.css)
  const slot = "topbar__island";
  if (!state.tracks.length || !state.track) return <div className={slot} />;

  const { track, playing, waiting, duration, muted, volume } = state;
  const expanded = mode === "expanded";
  const open = () => {
    held.current = false;
    setMode("expanded");
  };

  return (
    <div className={slot}>
      <div
        ref={island}
        className={`island is-${mode}${list ? " has-list" : ""}${playing ? " is-playing" : ""}`}
        role={expanded ? "dialog" : "button"}
        aria-label={expanded ? `Now playing: ${track.title} by ${track.artist}` : `Now playing: ${track.title} by ${track.artist}. Open the music player`}
        aria-expanded={expanded}
        tabIndex={expanded ? -1 : 0}
        onPointerDown={() => {
          if (expanded) return;
          window.clearTimeout(hold.current);
          hold.current = window.setTimeout(() => {
            held.current = true;
            setMode("expanded");
          }, HOLD_MS);
        }}
        onPointerUp={() => window.clearTimeout(hold.current)}
        onPointerLeave={() => window.clearTimeout(hold.current)}
        onClick={() => {
          if (expanded) return;
          if (held.current) {
            held.current = false;
            return;
          }
          open();
        }}
        onKeyDown={(e) => {
          if (!expanded && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            open();
          }
        }}
      >
        {/* Compact: art on the left, the wave on the right, the song's name between while peeking */}
        <div className="island__compact" aria-hidden={expanded}>
          <img className="island__art" src={COVER_ART} alt="" draggable={false} />
          <span className="island__peek">
            <span className="island__peek-title">{track.title}</span>
            <span className="island__peek-artist">{track.artist}</span>
          </span>
          <Wave bars={5} playing={playing && !waiting && !expanded} />
        </div>

        {/* Expanded: the player */}
        <div className="island__player" aria-hidden={!expanded}>
          <div className="island__now">
            <img className="island__cover" src={COVER_ART} alt="Asphalt 9: Legends soundtrack" draggable={false} />
            <div className="island__meta">
              <span className="island__title" title={track.title}>
                {track.title}
              </span>
              <span className="island__artist" title={track.artist}>
                {track.artist}
              </span>
            </div>
            <Wave bars={6} playing={playing && !waiting && expanded} className="is-large" />
          </div>

          <Scrubber duration={duration} active={expanded} />

          <div className="island__controls">
            <button
              type="button"
              className={`island__side${muted || volume === 0 ? " is-off" : ""}`}
              aria-label={muted ? "Unmute music" : "Mute music"}
              tabIndex={expanded ? 0 : -1}
              onClick={() => music.setMuted(!muted)}
            >
              <SoundIcon size={22} muted={muted || volume === 0} />
            </button>
            <div className="island__transport">
              <button type="button" aria-label="Previous song" tabIndex={expanded ? 0 : -1} onClick={() => void music.previous()}>
                <SkipIcon back />
              </button>
              <button type="button" className="is-main" aria-label={playing ? "Pause" : "Play"} tabIndex={expanded ? 0 : -1} onClick={() => music.toggle()}>
                {playing ? <PauseIcon /> : <PlayIcon />}
              </button>
              <button type="button" aria-label="Next song" tabIndex={expanded ? 0 : -1} onClick={() => void music.next()}>
                <SkipIcon />
              </button>
            </div>
            <button
              type="button"
              className={`island__side${list ? " is-on" : ""}`}
              aria-label={list ? "Hide the soundtrack list" : "Show the soundtrack list"}
              aria-pressed={list}
              tabIndex={expanded ? 0 : -1}
              onClick={() => setList((v) => !v)}
            >
              <ListIcon />
            </button>
          </div>

          <div className="island__volume">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              aria-label="Music volume"
              tabIndex={expanded ? 0 : -1}
              style={{ "--v": muted ? 0 : volume } as CSSProperties}
              onChange={(e) => music.setVolume(Number(e.target.value))}
            />
          </div>

          {list && <Playlist tracks={state.tracks} current={track} playing={playing} />}
        </div>
      </div>
    </div>
  );
}
