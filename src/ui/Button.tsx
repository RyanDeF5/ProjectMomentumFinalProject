import type { ButtonHTMLAttributes, MouseEvent } from "react";
import { pressFlash } from "../animation/a9";
import { sfx, type SfxName } from "../audio/sfx";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** buy: lime call to action. normal: slate. ghost: outlined, for secondary actions. */
  variant?: "buy" | "normal" | "ghost";
  size?: "md" | "lg";
  /** Sound on click; null for none. Defaults to launch for buy buttons, click otherwise. */
  sound?: SfxName | null;
}

/** Button styled after the Asphalt 9 CTA kit (buy / normal / disabled / pressed). */
export function Button({ variant = "normal", size = "md", sound, className, onClick, children, type = "button", ...rest }: ButtonProps) {
  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    const name = sound === undefined ? (variant === "buy" ? "launch" : "click") : sound;
    if (name) sfx.play(name);
    pressFlash(e.currentTarget);
    onClick?.(e);
  }

  return (
    <button type={type} className={`a9-btn a9-btn--${variant} a9-btn--${size}${className ? ` ${className}` : ""}`} onClick={handleClick} {...rest}>
      <span className="a9-btn__label">{children}</span>
    </button>
  );
}
