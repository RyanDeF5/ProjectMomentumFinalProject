import { useEffect, useState } from "react";
import { prefersReducedMotion } from "../animation/a9";

/**
 * Animates a number from 0 to `target`, like the game's rank and garage value counters.
 * Restarts whenever `token` changes. NaN targets are returned as-is.
 */
export function useCountUp(target: number, { duration = 900, delay = 0, token = 0 } = {}): number {
  const [value, setValue] = useState(target);

  useEffect(() => {
    if (!Number.isFinite(target) || prefersReducedMotion()) {
      setValue(target);
      return;
    }
    let frame = 0;
    let start = 0;
    setValue(0);
    const timer = setTimeout(() => {
      const tick = (now: number) => {
        if (!start) start = now;
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 4);
        setValue(target * eased);
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, delay);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [target, duration, delay, token]);

  return value;
}
