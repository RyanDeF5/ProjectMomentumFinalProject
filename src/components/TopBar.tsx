import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { onTokenDropTest } from "../lib/notify";
import { sfx } from "../audio/sfx";
import { useClock, useMarketState } from "../lib/clock";
import type { Connection } from "../lib/connection";
import { useJobProgress, type TopJob } from "../lib/jobProgress";
import { Diamond } from "../ui/Diamond";
import { formatTokens } from "../lib/numbers";
import { useRollingNumber } from "../lib/useRollingNumber";
import type { MarketState, TokenUsage } from "../lib/types";
import { BackIcon, CalendarIcon, CandlesIcon, ClockIcon, GearIcon, HomeIcon, SignalIcon, TimerIcon } from "../ui/Icons";
import { TokenIcon } from "../ui/TokenIcon";

interface TopBarProps {
  barRef: Ref<HTMLElement>;
  hidden: boolean;
  onBack?: () => void;
  onHome?: () => void;
  onSettings?: () => void;
  usage: TokenUsage | null;
  onTokens?: () => void;
  /** Stocks on the watchlist (the game's garage count); null until known */
  garageCount: number | null;
  onGarage?: () => void;
  connection: Connection;
  /** The background job running now (a screener or watchlist update), shown in the bar */
  job: TopJob | null;
  onOpenJob?: (source: TopJob["source"]) => void;
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

/**
 * Weak or lost connection: a signal icon with a red warning badge that slowly fades in and out at
 * the right end of the empty strip, next to the tiles, and fades away once the connection is back.
 */
function ConnectionSignal({ connection }: { connection: Connection }) {
  const [shown, setShown] = useState(connection);
  const ok = connection.state === "ok";
  useEffect(() => {
    if (connection.state !== "ok") setShown(connection);
  }, [connection]);
  if (shown.state === "ok") return null;
  return (
    <div className={`signal is-${shown.state}${ok ? " is-gone" : ""}`} role="status" aria-live="polite" title={`${shown.label}: ${shown.detail}`}>
      <span className="signal__icon">
        <SignalIcon bars={shown.state === "weak" ? 1 : 0} />
      </span>
      <span className="signal__text">
        <span className="signal__label">{shown.label}</span>
        <span className="signal__detail">{shown.detail}</span>
      </span>
    </div>
  );
}

/**
 * The job running in the background, at the right end of the empty strip: a spinning diamond, the
 * job and its percentage, and what it's doing with the time left. A fixed-size tile (the text
 * truncates inside it) that steps down to the percentage, then the icon, as the bar fills up.
 * Opens that job's screen.
 */
function JobTile({ job, onOpen }: { job: TopJob; onOpen?: (source: TopJob["source"]) => void }) {
  const { pct, left, count } = useJobProgress(job);
  const detail = job.held ? "WAITING FOR YOUR SCAN" : [job.step, count, left].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      className={`jobtile${job.held ? " is-held" : ""}`}
      title={`${job.label}: ${detail}`}
      disabled={!onOpen}
      onClick={() => {
        sfx.play("click");
        onOpen?.(job.source);
      }}
    >
      <span className="jobtile__icon" aria-hidden>
        {job.held ? <TimerIcon size={18} /> : <Diamond size={18} />}
      </span>
      <span className="jobtile__text">
        <span className="jobtile__label">
          <span className="jobtile__name">{job.label}</span>
          <strong>{job.progress ? `${Math.round(pct * 100)}%` : "--"}</strong>
        </span>
        <span className="jobtile__step">{detail}</span>
      </span>
    </button>
  );
}

/** The loading line along the bottom edge of the top bar: lime fill with a white leading edge. */
function JobLine({ job }: { job: TopJob }) {
  const { pct } = useJobProgress(job);
  return (
    <span className={`topbar__line${job.held ? " is-held" : ""}`} aria-hidden>
      <span className="topbar__line-fill" style={{ transform: `scaleX(${pct})` }} />
      <span className="topbar__line-edge" style={{ left: `${pct * 100}%` }} />
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
/** The clock tile's time: the only part of the bar that re-renders every second. */
function ClockText() {
  const clock = useClock();
  return (
    <>
      <span className="topbar__num">
        {clock.hours}:{clock.minutes}
      </span>
      <small>{clock.anteMeridiem}</small>
    </>
  );
}

function DateText() {
  useClock();
  return <span className="topbar__num">{new Date().toLocaleString("en-US", { month: "short", day: "numeric" }).toUpperCase()}</span>;
}

export function TopBar({ barRef, hidden, onBack, onHome, onSettings, usage, onTokens, garageCount, onGarage, connection, job, onOpenJob }: TopBarProps) {
  const marketState = useMarketState();
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
      <div className={`topbar__space${job ? " has-job" : ""}`}>
        {job && <JobTile key={job.source} job={job} onOpen={onOpenJob} />}
        <ConnectionSignal connection={connection} />
      </div>

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
        <ClockText />
      </Tile>

      <Tile order={2} className="topbar__counter topbar__date">
        <CalendarIcon />
        <DateText />
      </Tile>

      <Tile order={1} className={`topbar__status ${STATUS_TONE[marketState]}`}>
        {marketState}
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

      {job && <JobLine key={job.source} job={job} />}
      <div className="a9-flash" aria-hidden />
    </header>
  );
}
