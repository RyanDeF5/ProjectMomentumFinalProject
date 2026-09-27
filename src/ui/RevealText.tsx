import type { ReactNode } from "react";

interface RevealTextProps {
  children: ReactNode;
  /** ltr: block sweeps left to right (titles). rtl: right to left (subtitles). */
  dir?: "ltr" | "rtl";
  delay?: number;
  className?: string;
}

/** Text revealed behind a moving pink block, like Asphalt 9's menu titles. */
export function RevealText({ children, dir = "ltr", delay, className }: RevealTextProps) {
  return (
    <span className={`a9-text${className ? ` ${className}` : ""}`} data-a9="text" data-a9-dir={dir} data-a9-delay={delay}>
      <span className="a9-text__content">{children}</span>
      <span className="a9-text__bar" aria-hidden />
    </span>
  );
}
