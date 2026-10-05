import { useId } from "react";

// The game's logo badge: a pink shield outline around a blocky white "9". Under the 9's top loop a
// slot opens to the left and runs into a V-shaped lower counter that follows the shield's point.
// Measured from the Asphalt 9: Legends title screen (1 unit = a quarter pixel at 1600 px wide).
const SHIELD = "M0 0H480V456L240 584L0 456Z M44 44V430L240 534L436 430V44Z";
const NINE = "M86 96H394V424L240 506L86 424V352H156V400L240 432L324 400V296H86Z M156 152V220H324V152Z";

/** Shield-and-9 badge on its own (favicon size up to the title screen). */
export function LogoBadge({ size = 48 }: { size?: number | string }) {
  const id = useId();
  const height = typeof size === "number" ? `${size}px` : size;
  return (
    <svg className="logo-badge" style={{ height, width: `calc(${height} * ${480 / 584})` }} viewBox="0 0 480 584" aria-hidden>
      <defs>
        <linearGradient id={`${id}-pink`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff1a5e" />
          <stop offset="1" stopColor="#e0004a" />
        </linearGradient>
        <linearGradient id={`${id}-silver`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#e9ecf0" />
          <stop offset="1" stopColor="#c3c8d0" />
        </linearGradient>
      </defs>
      <path d={SHIELD} fill={`url(#${CSS.escape(id)}-pink)`} fillRule="evenodd" />
      <path d={NINE} fill={`url(#${CSS.escape(id)}-silver)`} fillRule="evenodd" />
    </svg>
  );
}

/**
 * ALPHA 9: LEGENDS, laid out like the game's logo: the badge on top, ALPHA in wide silver caps
 * and LEGENDS spaced out in pink beneath. Sized by its font-size (CSS, or `size` in px); the badge
 * is 2.4em tall, matching the game's proportions.
 */
export function Logo({ size, className }: { size?: number; className?: string }) {
  return (
    <span className={`logo${className ? ` ${className}` : ""}`} role="img" aria-label="Alpha 9: Legends" style={size ? { fontSize: size } : undefined}>
      <LogoBadge size="2.4em" />
      <span className="logo__word" aria-hidden>
        ALPHA
      </span>
      <span className="logo__sub" aria-hidden>
        LEGENDS
      </span>
    </span>
  );
}
