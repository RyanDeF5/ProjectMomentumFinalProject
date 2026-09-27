import { useId, type CSSProperties } from "react";

interface SliderProps {
  label: string;
  /** 0 to 1 */
  value: number;
  onChange: (value: number) => void;
  onCommit?: () => void;
}

/** Pink-filled volume slider with a round knob and percentage, from the game's SOUND & DISPLAY screen. */
export function Slider({ label, value, onChange, onCommit }: SliderProps) {
  const id = useId();
  const percent = Math.round(value * 100);
  return (
    <div className="a9-slider">
      <label className="a9-slider__label" htmlFor={id}>
        {label}
      </label>
      <div className="a9-slider__row">
        <input
          id={id}
          className="a9-slider__input"
          type="range"
          min={0}
          max={100}
          value={percent}
          style={{ "--fill": `${percent}%` } as CSSProperties}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          onPointerUp={onCommit}
          onKeyUp={onCommit}
        />
        <span className="a9-slider__value">{percent}%</span>
      </div>
    </div>
  );
}
