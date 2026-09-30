import type { CSSProperties, ElementType, ReactNode } from "react";
import type { A9Kind } from "../animation/a9";

interface RevealProps {
  kind: Exclude<A9Kind, "text" | "bar">;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  delay?: number;
  /** Color of the block the element appears as before washing into its content */
  wash?: "white" | "pink" | "lime" | "none";
  children?: ReactNode;
  /** For interactive reveals (as="button") */
  onClick?: () => void;
  type?: "button";
  [attr: `aria-${string}` | `data-${string}`]: unknown;
}

/** Marks an element for the Asphalt 9 animation engine (see animation/a9.ts). */
export function Reveal({ kind, as: Tag = "div", className, delay, wash, children, ...rest }: RevealProps) {
  const washColor = wash ?? (kind === "panel" || kind === "slide" ? "white" : "none");
  return (
    <Tag className={className} data-a9={kind} data-a9-delay={delay} {...rest}>
      {children}
      {washColor !== "none" && <span className={`a9-wash${washColor === "white" ? "" : ` a9-wash--${washColor}`}`} aria-hidden />}
    </Tag>
  );
}
