import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../animation/a9";

/**
 * Rolls a counter up from its previous value whenever `target` grows (the token counter). The first
 * value and any decrease (e.g. a new day) are shown immediately. Returns the value to display and
 * whether it is currently rolling.
 */
export function useRollingNumber(target: number | null, duration = 1400): { value: number | null; rolling: boolean } {
  const [value, setValue] = useState<number | null>(target);
  const [rolling, setRolling] = useState(false);
  const shown = useRef<number | null>(target);

  useEffect(() => {
    if (target === null) return;
    const from = shown.current;
    if (from === null || target <= from || prefersReducedMotion()) {
      shown.current = target;
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    setRolling(true);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      const next = Math.round(from + (target - from) * eased);
      shown.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(tick);
      else setRolling(false);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      setRolling(false);
    };
  }, [target, duration]);

  return { value, rolling };
}
