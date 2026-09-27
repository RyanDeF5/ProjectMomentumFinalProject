import type { ReactNode } from "react";
import { RevealText } from "./RevealText";

/** "| SOUND & DISPLAY" style heading with the pink accent bar. */
export function SectionTitle({ children, as: Tag = "h2", size = "md" }: { children: ReactNode; as?: "h1" | "h2" | "h3"; size?: "sm" | "md" | "lg" }) {
  return (
    <Tag className={`a9-section a9-section--${size}`}>
      <span className="a9-section__bar" aria-hidden />
      <RevealText>{children}</RevealText>
    </Tag>
  );
}
