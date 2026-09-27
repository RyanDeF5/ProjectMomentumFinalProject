import { useId, type CSSProperties } from "react";

// The diamond's outer edge, which the light rides along (clockwise from the top corner), in a 100x100 box
const EDGE = "M50 4 L96 50 L50 96 L4 50 Z";
const INNER = "M50 11 L89 50 L50 89 L11 50 Z";

// Every layer is a dash whose leading edge sits at TAIL along the path, so the head, tail and glow
// stay together; the pattern always totals 100 (the path length), so the loop is seamless.
const TAIL = 22;
const comet = (length: number) => `0 ${TAIL - length} ${length} ${100 - TAIL}`;

/**
 * The game's loading indicator: a black diamond with a dark rim and a faint inner outline, with a
 * pink comet (white-hot head, fading tail, glow into the interior) running clockwise along the edge.
 */
export function Diamond({ size = 34, label }: { size?: number; label?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <span className="a9-diamond" style={{ "--size": `${size}px` } as CSSProperties} role={label ? "status" : undefined} aria-label={label}>
      <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden>
        <defs>
          <clipPath id={`${id}-inside`}>
            <path d={EDGE} />
          </clipPath>
          <filter id={`${id}-soft`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <filter id={`${id}-bloom`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
        </defs>
        <path d={EDGE} fill="#000" stroke="#1a1a20" strokeWidth="4.5" strokeLinejoin="miter" />
        <path d={INNER} fill="none" stroke="#2c2c33" strokeWidth="1.6" />
        {/* Glow washing into the interior behind the head */}
        <g clipPath={`url(#${id}-inside)`}>
          <path className="a9-diamond__comet" d={EDGE} pathLength={100} strokeDasharray={comet(16)} fill="none" stroke="#ff1f63" strokeWidth="22" opacity="0.6" filter={`url(#${id}-soft)`} />
        </g>
        {/* Tail fading behind the head, then the white-hot head */}
        <path className="a9-diamond__comet" d={EDGE} pathLength={100} strokeDasharray={comet(22)} fill="none" stroke="#ff1f63" strokeWidth="3.4" opacity="0.4" />
        <path className="a9-diamond__comet" d={EDGE} pathLength={100} strokeDasharray={comet(9)} fill="none" stroke="#ff3d78" strokeWidth="3.4" />
        <path className="a9-diamond__comet" d={EDGE} pathLength={100} strokeDasharray={comet(3)} fill="none" stroke="#ff4f86" strokeWidth="7" filter={`url(#${id}-bloom)`} />
        <path className="a9-diamond__comet" d={EDGE} pathLength={100} strokeDasharray={comet(1.4)} fill="none" stroke="#ffe3ec" strokeWidth="3.6" />
      </svg>
    </span>
  );
}
