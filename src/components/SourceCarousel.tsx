import { useEffect, useMemo, useRef, useState } from "react";
import { prefersReducedMotion } from "../animation/a9";
import { faviconUrl } from "../lib/api";

export interface Source {
  name: string;
  domain: string | null;
}

interface SourceCarouselProps {
  sources: Source[];
  /** Rotates while true; eases to a stop with a site in front when false */
  spinning: boolean;
  /** Caption verb while spinning, e.g. SEARCHING or READING */
  verb: string;
  /** Caption once settled */
  doneLabel: string;
}

const SECONDS_PER_SITE = 0.95; // time for the next site to come round to the front
const RADIUS_X = 104; // ring half-width in px
const LIFT = 7; // how much higher the back of the ring sits
const MIN_SCALE = 0.56; // size at the very back (the front is 1: never scaled up, so icons stay crisp)

/**
 * The sites being searched or read, riding a merry-go-round (like an AI search showing the websites
 * it is looking through). Tiles sit on a rotating ellipse: the front tile is full size with a gold
 * frame and names the site; tiles further round shrink and dim. Driven by requestAnimationFrame and
 * transforms only, so the motion is continuous and smooth.
 */
export function SourceCarousel({ sources, spinning, verb, doneLabel }: SourceCarouselProps) {
  // Keyed by content: the parent rebuilds the array on every render (the clock ticks each second)
  const signature = sources.map((s) => (s.domain || s.name).toLowerCase()).join("|");
  const unique = useMemo(() => {
    const seen = new Set<string>();
    return sources.filter((s) => {
      const key = (s.domain || s.name).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [signature]);

  const tiles = useRef<(HTMLLIElement | null)[]>([]);
  const angle = useRef(0);
  const spinningRef = useRef(spinning);
  spinningRef.current = spinning;
  const [front, setFront] = useState(0);

  useEffect(() => {
    const count = unique.length;
    tiles.current.length = count;
    if (!count) return;
    const step = (2 * Math.PI) / count;
    const cruise = step / SECONDS_PER_SITE;
    const reduce = prefersReducedMotion();
    // A new set of sites starts from rest with the first one in front
    angle.current = 0;
    let velocity = 0;
    let braking: { from: number; to: number; v0: number; duration: number; t: number } | null = null;
    let frame = 0;
    let last = performance.now();
    let shown = -1;

    const place = () => {
      let best = 0;
      let bestDepth = -2;
      tiles.current.forEach((tile, i) => {
        if (!tile) return;
        const theta = i * step - angle.current;
        const depth = Math.cos(theta); // 1 = front, -1 = back
        const t = (depth + 1) / 2;
        const x = Math.sin(theta) * RADIUS_X;
        const y = (1 - t) * -LIFT;
        const scale = MIN_SCALE + (1 - MIN_SCALE) * t;
        tile.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(3)})`;
        tile.style.opacity = (0.15 + 0.85 * t * t).toFixed(3);
        tile.style.zIndex = String(Math.round(depth * 100) + 100);
        if (depth > bestDepth) {
          bestDepth = depth;
          best = i;
        }
      });
      tiles.current.forEach((tile, i) => tile?.classList.toggle("is-front", i === best && bestDepth > 0.97));
      if (best !== shown) {
        shown = best;
        setFront(best);
      }
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (spinningRef.current && count > 1 && !reduce) {
        // Spin up gently to cruising speed
        braking = null;
        velocity += (cruise - velocity) * Math.min(1, dt * 3);
        angle.current += velocity * dt;
      } else if (velocity > 0) {
        // Brake at a constant rate so the ring glides forward and stops exactly on the next site
        if (!braking) {
          let to = Math.ceil(angle.current / step) * step;
          if (to - angle.current < step * 0.3) to += step; // too close to stop gracefully
          const distance = to - angle.current;
          braking = { from: angle.current, to, v0: velocity, duration: (2 * distance) / velocity, t: 0 };
        }
        braking.t = Math.min(braking.duration, braking.t + dt);
        const { from, to, v0, duration, t } = braking;
        angle.current = t >= duration ? to : from + v0 * t - (v0 / (2 * duration)) * t * t;
        velocity = t >= duration ? 0 : v0 * (1 - t / duration);
        if (t >= duration) braking = null;
      }
      place();
      frame = requestAnimationFrame(tick);
    };

    place();
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [unique]);

  if (!unique.length) return null;
  const current = unique[Math.min(front, unique.length - 1)];

  return (
    <div className="sources">
      <ul key={signature} className="sources__ring" aria-hidden>
        {unique.map((source, i) => (
          <li
            key={source.domain || source.name}
            className="sources__tile"
            ref={(el) => {
              tiles.current[i] = el;
            }}
          >
            {source.domain ? (
              <img src={faviconUrl(source.domain)} alt="" width={22} height={22} decoding="async" draggable={false} />
            ) : (
              <span>{source.name.slice(0, 1)}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="sources__caption" aria-live="polite">
        {spinning ? (
          <span key={current.name} className="sources__name">
            {verb} <strong>{current.name}</strong>
          </span>
        ) : (
          <span key="done" className="sources__name">
            {doneLabel}
          </span>
        )}
      </p>
    </div>
  );
}
