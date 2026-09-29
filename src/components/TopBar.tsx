import type { ReactNode, Ref } from "react";
import { sfx } from "../audio/sfx";
import type { ClockData } from "../lib/clock";
import { formatTokens } from "../lib/numbers";
import { useRollingNumber } from "../lib/useRollingNumber";
import type { MarketState, TokenUsage } from "../lib/types";
import { BackIcon, CalendarIcon, ClockIcon, GearIcon, HomeIcon } from "../ui/Icons";
import { TokenIcon } from "../ui/TokenIcon";

interface TopBarProps {
  barRef: Ref<HTMLElement>;
  clock: ClockData;
  hidden: boolean;
  onBack?: () => void;
  onHome?: () => void;
  onSettings?: () => void;
  usage: TokenUsage | null;
  onTokens?: () => void;
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

/**
 * Top bar like the game's: tiles anchored to the right edge and running right to left
 * (gear/home, market status, date, clock, Legend tokens). New tiles go on the left end.
 */
export function TopBar({ barRef, clock, hidden, onBack, onHome, onSettings, usage, onTokens }: TopBarProps) {
  const tokens = useRollingNumber(usage ? usage.today.tokens : null);
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

      {/* Legend tokens used today, like the game's A-token counter. New tiles are added on this end. */}
      <Tile order={4} className={`topbar__tokens${tokens.rolling ? " is-rolling" : ""}`}>
        <button
          type="button"
          aria-label={`Legend tokens used today: ${usage ? usage.today.tokens : "unknown"}. Open token usage`}
          disabled={!onTokens}
          onClick={() => {
            sfx.play("click");
            onTokens?.();
          }}
        >
          <TokenIcon size={26} />
          <span className="topbar__tokens-value">
            {tokens.value !== null ? formatTokens(tokens.value) : "--"}
            <span className="topbar__tokens-limit">/{usage?.dailyLimit ? formatTokens(usage.dailyLimit) : "∞"}</span>
          </span>
          <span className="topbar__plus" aria-hidden>
            +
          </span>
        </button>
      </Tile>

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
