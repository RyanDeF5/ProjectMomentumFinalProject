import type { ReactNode } from "react";

/** Pink-bordered notice box, like the game's "NO EVENTS AVAILABLE AT THIS MOMENT". */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="a9-notice" role="status">
      {children}
    </p>
  );
}
