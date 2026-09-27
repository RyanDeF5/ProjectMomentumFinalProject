import type { ReactNode, Ref } from "react";
import { sfx } from "../audio/sfx";
import type { ClockData } from "../lib/clock";
import type { MarketState } from "../lib/types";
import { BackIcon, CalendarIcon, ClockIcon, GearIcon, HomeIcon } from "../ui/Icons";

interface TopBarProps {
  barRef: Ref<HTMLElement>;
  clock: ClockData;
  hidden: boolean;
  onBack?: () => void;
  onHome?: () => void;
  onSettings?: () => void;
}

// The wide highlighted tile works like the game's SHOP / FREE PACK! / NEW OFFER! tile
const STATUS_TONE: Record<MarketState, string> = {
  "MARKET OPEN": "is-open",
  "PRE-MARKET": "is-extended",
  "AFTER HOURS": "is-extended",
  "MARKET CLOSED": "",
};

// Tiles build in from the right edge on every screen change; `order` is distance from the right.
function Tile({ order, className = "", children }: { order: number; className?: string; children: ReactNode }) {
  return (
    <div className={`topbar__tile ${className}`} data-a9-tile={order}>
      {children}
      <span className="a9-wash" aria-hidden />
    </div>
  );
}

/** Top bar like the game's: tiles anchored to the right (gear/home, highlighted tile, counters). */
export function TopBar({ barRef, clock, hidden, onBack, onHome, onSettings }: TopBarProps) {
  const shortDate = new Date().toLocaleString("en-US", { month: "short", day: "numeric" }).toUpperCase();

  return (
    <header className={`topbar${hidden ? " is-hidden" : ""}`} ref={barRef} aria-hidden={hidden || undefined}>
      <div className="topbar__strip" data-a9-strip />

      {onBack && (
        <button
          type="button"
          className="topbar__back"
          aria-label="Back"
          onClick={() => {
            sfx.play("click");
            onBack();
          }}
        >
          <BackIcon size={26} />
        </button>
      )}

      {/* Empty strip on the left; tiles are anchored to the right edge and run right to left */}
      <div className="topbar__space" />

      <Tile order={3} className="topbar__counter">
        <ClockIcon />
        <span className="topbar__num">
          {clock.hours}:{clock.minutes}
        </span>
        <small>{clock.anteMeridiem}</small>
      </Tile>

      <Tile order={2} className="topbar__counter topbar__date">
        <CalendarIcon />
        <span className="topbar__num">{shortDate}</span>
      </Tile>

      <Tile order={1} className={`topbar__status ${STATUS_TONE[clock.marketState]}`}>
        {clock.marketState}
      </Tile>

      <Tile order={0} className="topbar__icon">
        {onSettings ? (
          <button
            type="button"
            aria-label="Settings"
            onClick={() => {
              sfx.play("click");
              onSettings();
            }}
          >
            <GearIcon />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Home"
            disabled={!onHome}
            onClick={() => {
              sfx.play("click");
              onHome?.();
            }}
          >
            <HomeIcon size={28} />
          </button>
        )}
      </Tile>

      <div className="a9-flash" aria-hidden />
    </header>
  );
}
