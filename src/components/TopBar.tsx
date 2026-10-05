import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { onTokenDropTest } from "../lib/notify";
import { sfx } from "../audio/sfx";
import type { ClockData } from "../lib/clock";
import { formatTokens } from "../lib/numbers";
import { useRollingNumber } from "../lib/useRollingNumber";
import type { MarketState, TokenUsage } from "../lib/types";
import { BackIcon, CalendarIcon, CandlesIcon, ClockIcon, GearIcon, HomeIcon } from "../ui/Icons";
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
  /** Stocks on the watchlist (the game's garage count); null until known */
  garageCount: number | null;
  onGarage?: () => void;
}

const DROP_GHOSTS = 4;
// The count starts rolling as the incoming tokens reach the icon
const ROLL_DELAY_MS = 380;

/**
 * A compact train of faint tokens arrives from the left at even intervals; the tile responds
 * with a short blue wash at impact, synchronized with the rolling count.
 */
function TokenDrop() {
  return (
    <span className="token-drop" aria-hidden>
      <span className="token-drop__wash" />
      {Array.from({ length: DROP_GHOSTS }, (_, i) => (
        <span key={i} className="token-drop__ghost" style={{ animationDelay: `${i * 60}ms` } as CSSProperties}>
          <TokenIcon size={26} />
        </span>
      ))}
    </span>
  );
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
 * (gear/home, market status, date, clock, Legend tokens, watchlist garage). New tiles go on the left end.
 */
export function TopBar({ barRef, clock, hidden, onBack, onHome, onSettings, usage, onTokens, garageCount, onGarage }: TopBarProps) {
  const today = usage ? usage.today.tokens : null;
  const tokens = useRollingNumber(today, 1100, ROLL_DELAY_MS);
  // Each increase (and the Settings test) plays the drop once
  const [drops, setDrops] = useState(0);
  const lastTokens = useRef(today);
  useEffect(() => {
    if (today !== null && lastTokens.current !== null && today > lastTokens.current) setDrops((n) => n + 1);
    lastTokens.current = today;
  }, [today]);
  useEffect(() => onTokenDropTest(() => setDrops((n) => n + 1)), []);
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

      {/* Watchlist size, like the game's garage count (candlesticks for tickers). New tiles are added on this end. */}
      <Tile order={5} className="topbar__garage">
        <button
          type="button"
          aria-label={`Watchlist: ${garageCount ?? "unknown"} stocks. Open the watchlist`}
          disabled={!onGarage}
          onClick={() => {
            sfx.play("click");
            onGarage?.();
          }}
        >
          <CandlesIcon size={26} />
          <span className="topbar__num">{garageCount ?? "--"}</span>
        </button>
      </Tile>

      {/* Legend tokens used today, like the game's A-token counter */}
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
        {drops > 0 && <TokenDrop key={drops} />}
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
