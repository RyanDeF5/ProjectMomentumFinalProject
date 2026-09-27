import { useCountUp } from "../lib/useCountUp";
import { Reveal } from "../ui/Reveal";

interface StatRowProps {
  icon: string;
  label: string;
  value: number;
  format: (value: number) => string;
  /** Bar fill from 0 to 1 */
  fill: number;
  /** Changes each time the summary screen is entered, restarting the count-up */
  token: number;
  delay: number;
}

/** Car-stat style row: round icon, label, counting value and a cyan bar. */
export function StatRow({ icon, label, value, format, fill, token, delay }: StatRowProps) {
  const shown = useCountUp(value, { token, delay: delay + 150, duration: 1000 });
  const clamped = Number.isFinite(fill) ? Math.min(1, Math.max(0, fill)) : 0;

  return (
    <Reveal kind="slide" className="stat" delay={delay}>
      <img className="stat__icon" src={icon} alt="" />
      <span className="stat__label">{label}</span>
      <span className="stat__value">{Number.isFinite(shown) ? format(shown) : "N/A"}</span>
      <span className="stat__track">
        <span className="stat__fill" data-a9="bar" data-a9-delay={delay + 150} style={{ transform: `scaleX(${clamped})` }} />
      </span>
    </Reveal>
  );
}
