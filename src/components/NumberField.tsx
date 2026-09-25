import { useRef } from "react";
import { expandSuffix } from "../lib/numbers";

interface NumberFieldProps {
  id: string;
  className: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

// Text input that expands K/M/B shorthand (e.g. 2.5M -> 2,500,000) and flashes green when it does.
export function NumberField({ onChange, ...props }: NumberFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function flashIndicateField() {
    const field = inputRef.current;
    if (!field) return;
    field.style.backgroundColor = "#a2ffa3ff";
    setTimeout(() => {
      field.style.transition = "background-color 0.5s ease-out";
      field.style.backgroundColor = "white";
    }, 200);
    setTimeout(() => {
      field.style.transition = "background-color 0.0s ease-out";
    }, 750);
  }

  function handleChange(raw: string) {
    const expanded = expandSuffix(raw);
    if (expanded === null) {
      onChange(raw);
    } else {
      onChange(expanded);
      flashIndicateField();
    }
  }

  return <input ref={inputRef} {...props} onChange={(e) => handleChange(e.target.value)} />;
}
