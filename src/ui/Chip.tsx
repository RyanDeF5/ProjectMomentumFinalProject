import type { ReactNode } from "react";

interface ChipProps {
  tone?: "pink" | "white" | "lime" | "slate" | "dark";
  size?: "sm" | "md" | "lg";
  className?: string;
  children: ReactNode;
}

/** Solid label block: "01 | SAN FRANCISCO" tags, rank letters, rating labels. */
export function Chip({ tone = "white", size = "md", className, children }: ChipProps) {
  return <span className={`a9-chip a9-chip--${tone} a9-chip--${size}${className ? ` ${className}` : ""}`}>{children}</span>;
}
