// Small line icons in the style of the game's top bar.
type IconProps = { size?: number };

export const BackIcon = ({ size = 22 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square">
    <path d="M15 4 7 12l8 8" />
  </svg>
);

export const HomeIcon = ({ size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="currentColor">
    <path d="M12 3 2 11.5h3V21h5v-6h4v6h5v-9.5h3z" />
  </svg>
);

export const SoundIcon = ({ size = 22, muted }: IconProps & { muted?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="none" />
    {muted ? <path d="m16 9 6 6m0-6-6 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
  </svg>
);

export const CloseIcon = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="3">
    <path d="m5 5 14 14M19 5 5 19" />
  </svg>
);

export const TimerIcon = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4">
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 9.5v4l2.5 2M9.5 2.5h5M19 5.5l1.5 1.5" />
  </svg>
);

export const LockIcon = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="currentColor">
    <path d="M7 10V7a5 5 0 0 1 10 0v3h2v12H5V10zm2 0h6V7a3 3 0 0 0-6 0z" />
  </svg>
);

export const SearchIcon = ({ size = 22 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="square">
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.5 15.5 5 5" />
  </svg>
);

// Settings gear: six chunky, slightly tapered teeth and a round hole, drawn as one solid path
// (no masks or gradients, which Safari can drop when the icon is re-mounted).
const GEAR_PATH = (() => {
  const cx = 16;
  const cy = 16;
  const teeth = 6;
  const outer = 15; // tooth tips
  const root = 11.2; // body between teeth
  const tipHalf = 0.26; // half-angle of a tooth tip (radians)
  const baseHalf = 0.36; // half-angle of a tooth base
  const hole = 5;
  const pt = (r: number, a: number) => `${(cx + r * Math.sin(a)).toFixed(2)} ${(cy - r * Math.cos(a)).toFixed(2)}`;
  let d = "";
  for (let i = 0; i < teeth; i++) {
    const a = (i * 2 * Math.PI) / teeth;
    const next = ((i + 1) * 2 * Math.PI) / teeth;
    d += `${i === 0 ? "M" : "L"}${pt(root, a - baseHalf)} L${pt(outer, a - tipHalf)} A${outer} ${outer} 0 0 1 ${pt(outer, a + tipHalf)} L${pt(root, a + baseHalf)} A${root} ${root} 0 0 1 ${pt(root, next - baseHalf)} `;
  }
  d += `Z M${cx + hole} ${cy} A${hole} ${hole} 0 1 0 ${cx - hole} ${cy} A${hole} ${hole} 0 1 0 ${cx + hole} ${cy} Z`;
  return d;
})();

export const GearIcon = ({ size = 30 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
    <path d={GEAR_PATH} fill="currentColor" fillRule="evenodd" />
  </svg>
);

export const ClockIcon = ({ size = 22 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const CalendarIcon = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2">
    <rect x="3.5" y="5" width="17" height="15" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);

export const EyeIcon = ({ size = 22 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4">
    <path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" />
    <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
  </svg>
);

/** Eye with a plus badge: add to the watchlist. */
export const WatchAddIcon = ({ size = 30 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 30 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4">
    <path d="M1.5 13S5.2 6.5 11.5 6.5 21.5 13 21.5 13s-3.7 6.5-10 6.5S1.5 13 1.5 13z" />
    <circle cx="11.5" cy="13" r="3" fill="currentColor" stroke="none" />
    <path d="M24 1.5v9M19.5 6h9" strokeWidth="2.8" />
  </svg>
);

export const RefreshIcon = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.6">
    <path d="M19.5 12a7.5 7.5 0 1 1-2.4-5.5" />
    <path d="M18.5 2.5v5h-5" strokeLinecap="square" />
  </svg>
);

export const ChevronDownIcon = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="square">
    <path d="m5 9 7 7 7-7" />
  </svg>
);

export const ArrowRightIcon = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square">
    <path d="M4 12h14M13 6l6 6-6 6" />
  </svg>
);

/** Double chevron in a circle, like the garage's upgrade badge; `down` flips it. */
export const TrendBadgeIcon = ({ size = 22, down }: IconProps & { down?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={down ? { transform: "rotate(180deg)" } : undefined}>
    <circle cx="12" cy="12" r="11" fill="currentColor" />
    <path d="m7 12.5 5-4.5 5 4.5M7 17l5-4.5 5 4.5" fill="none" stroke="#111" strokeWidth="2.6" />
  </svg>
);

export const StarIcon = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="currentColor">
    <path d="m12 1.8 3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.9l-6.4 3.5 1.4-7.1-5.3-5 7.2-.9z" />
  </svg>
);

/** Three solid candlesticks with their wicks: the watchlist's ticker count in the top bar. */
export const CandlesIcon = ({ size = 26 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="currentColor">
    <path d="M4.2 3.5h1.6v3H8v9H5.8v4H4.2v-4H2v-9h2.2z" />
    <path d="M11.2 1h1.6v5H15v8h-2.2v6h-1.6v-6H9V6h2.2z" />
    <path d="M18.2 6h1.6v4H22v8h-2.2v4h-1.6v-4H16v-8h2.2z" />
  </svg>
);
