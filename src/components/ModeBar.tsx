import { useLayoutEffect, useRef } from "react";
import { LockIcon } from "../ui/Icons";

// Asphalt 9 mode row for the home screen, the watchlist and the stock screener. It stays mounted,
// so moving between those never animates it out; on other screens it slides away below the window.
const MODES = [
  { id: "scanner", top: "MARKET", bottom: "SCANNER" },
  { id: "watchlist", top: "WATCH", bottom: "LIST" },
  { id: "screener", top: "STOCK", bottom: "SCREENER" },
  { id: "alerts", top: "PRICE", bottom: "ALERTS" },
  { id: "news", top: "MARKET", bottom: "NEWS" },
] as const;

export function ModeBar({ activeMode, hidden, busy, onHome, onOpenWatchlist, onOpenScreener }: {
  activeMode: "scanner" | "watchlist" | "screener";
  hidden: boolean;
  busy: boolean;
  onHome: () => void;
  onOpenWatchlist: () => void;
  onOpenScreener: () => void;
}) {
  const barRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const bar = barRef.current;
    const app = bar?.closest<HTMLElement>(".app");
    if (!bar || !app) return;
    // Screens reserve room for the bar only while it is showing
    const measure = () => app.style.setProperty("--modes-h", hidden ? "0px" : `${bar.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [hidden]);

  const actions: Partial<Record<(typeof MODES)[number]["id"], () => void>> = {
    scanner: onHome,
    watchlist: onOpenWatchlist,
    screener: onOpenScreener,
  };

  return (
    <nav ref={barRef} className={`modes${hidden ? " is-hidden" : ""}`} aria-label="Modes" aria-busy={busy} aria-hidden={hidden || undefined} inert={hidden || undefined}>
      {MODES.map((mode) => {
        const current = mode.id === activeMode;
        const action = actions[mode.id];
        return (
          <button
            key={mode.id}
            type="button"
            className={`mode${current ? " is-active" : action ? " is-open" : " is-locked"}`}
            aria-current={current ? "page" : undefined}
            disabled={!action || busy}
            onClick={action}
          >
            {!action && (
              <span className="mode__lock" aria-label="Coming soon"><LockIcon /></span>
            )}
            <span className="mode__top">{mode.top}</span>
            <span className="mode__bottom">{mode.bottom}</span>
          </button>
        );
      })}
    </nav>
  );
}
