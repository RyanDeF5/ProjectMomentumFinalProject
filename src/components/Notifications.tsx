import { useEffect, useRef, useState } from "react";
import { sfx } from "../audio/sfx";
import { dismissNotification, useCurrentNotification } from "../lib/notify";
import type { WatchAlert } from "../lib/types";
import { LegendEmblem } from "../ui/LegendEmblem";

const GOAL_HOLD_MS = 4200; // on screen before it clears, like DAILY GOAL COMPLETED
const BANNER_HOLD_MS = 4600;
const EXIT_MS = 420;

/** The game's daily-goal badge: a lime stopwatch with a pale quarter wedge, in a white laurel. */
function GoalBadge() {
  // Pointed leaves on a circle around the dial, from the bottom up each side to about mid-height;
  // each follows the curve, tipped slightly outward
  const R = 47;
  const leaves = [108, 128, 148, 168, 188];
  const leaf = "M0 -11C5.5 -5 5.5 5 0 11C-5.5 5 -5.5 -5 0 -11Z";
  return (
    <svg className="goal__badge" viewBox="0 0 120 120" aria-hidden>
      {[-1, 1].map((side) =>
        leaves.map((deg) => {
          const theta = side < 0 ? deg : 180 - deg; // left side, mirrored for the right
          const t = (theta * Math.PI) / 180;
          const x = 60 + Math.cos(t) * R;
          const y = 62 + Math.sin(t) * R;
          const rot = theta + side * 22;
          return <path key={`${side}-${deg}`} d={leaf} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)})`} fill="#eef6e2" />;
        }),
      )}
      {/* Crown and side buttons */}
      <rect x="47" y="10" width="26" height="7" rx="1.5" fill="#9fd61c" />
      <rect x="55" y="16" width="10" height="9" fill="#9fd61c" />
      <rect x="25" y="25" width="11" height="7" rx="1.5" fill="#9fd61c" transform="rotate(-42 30.5 28.5)" />
      <rect x="84" y="25" width="11" height="7" rx="1.5" fill="#9fd61c" transform="rotate(42 89.5 28.5)" />
      {/* Dial: lime ring, lighter face, pale quarter wedge */}
      <circle cx="60" cy="60" r="35" fill="#9fd61c" />
      <circle cx="60" cy="60" r="27.5" fill="#c6ef47" />
      <path d="M60 60V35A25 25 0 0 1 85 60Z" fill="#effad2" />
      {/* Stars */}
      <path d={star(100, 17, 8)} fill="#ffffff" />
      <path d={star(19, 38, 6)} fill="#ffd21f" />
      <path d={star(27, 18, 4.5)} fill="#ffd21f" opacity="0.85" />
    </svg>
  );
}

function star(cx: number, cy: number, r: number): string {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    return `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`;
  });
  return `M${pts.join("L")}Z`;
}

/** Bullish news on a watched stock, staged like the game's DAILY GOAL COMPLETED. */
function GoalNotice({ alert, leaving }: { alert: Extract<WatchAlert, { kind: "bullish" }>; leaving: boolean }) {
  return (
    <div className={`goal${leaving ? " is-leaving" : ""}`} role="status" aria-live="polite">
      <span className="goal__slab" aria-hidden />
      <span className="goal__slab goal__slab--shade" aria-hidden />
      <span className="goal__streak" aria-hidden />
      <span className="goal__wipe" aria-hidden />
      <GoalBadge />
      <span className="goal__small">{alert.symbol} NEWS</span>
      <span className="goal__big">BULLISH</span>
      <span className="goal__bar">
        <span className="goal__bar-text">
          {alert.publisher ? `${alert.publisher.toUpperCase()} · ` : ""}
          {alert.title.toUpperCase()}
          {alert.more > 0 ? ` +${alert.more} MORE` : ""}
        </span>
      </span>
    </div>
  );
}

/** Slim banner like the game's TRADE COINS strip; here, a watched stock ranking up a class. */
function RankBanner({ alert, leaving }: { alert: Extract<WatchAlert, { kind: "class-up" }>; leaving: boolean }) {
  return (
    <div className={`nbanner${leaving ? " is-leaving" : ""}`} role="status" aria-live="polite">
      <div className="nbanner__body">
        <span className="nbanner__title">RANKED UP</span>
        <span className="nbanner__text">
          {alert.symbol} CLIMBED FROM CLASS {alert.from} TO CLASS {alert.to} AFTER LEGEND'S LATEST UPDATE. IT STAYS ON YOUR WATCHLIST AND KEEPS UPDATING.
        </span>
      </div>
      <div className="nbanner__art" aria-hidden>
        <LegendEmblem size={58} className="nbanner__emblem" />
        <span className="nbanner__classes">
          <span className="nbanner__class is-from">{alert.from}</span>
          <span className="nbanner__arrow">›</span>
          <span className="nbanner__class is-to">{alert.to}</span>
        </span>
      </div>
      <div className="nbanner__side">
        <span className="nbanner__delta">{alert.delta >= 0 ? `+${alert.delta}` : alert.delta}</span>
        <span className="nbanner__total">{alert.score.toLocaleString("en-US")}</span>
      </div>
    </div>
  );
}

/** A new A/A+ setup on the stock screener, in the same banner style. */
function SetupBanner({ alert, leaving }: { alert: Extract<WatchAlert, { kind: "setup" }>; leaving: boolean }) {
  return (
    <div className={`nbanner${leaving ? " is-leaving" : ""}`} role="status" aria-live="polite">
      <div className="nbanner__body">
        <span className="nbanner__title">NEW {alert.grade} SETUP</span>
        <span className="nbanner__text">
          {alert.symbol}: {alert.whyNow.toUpperCase()}. THE STOCK SCREENER RANKS IT {alert.grade}; OPEN IT FOR LEGEND'S FULL READ.
        </span>
      </div>
      <div className="nbanner__art" aria-hidden>
        <LegendEmblem size={58} className="nbanner__emblem" />
        <span className="nbanner__classes">
          <span className="nbanner__class is-to is-grade">{alert.grade}</span>
        </span>
      </div>
      <div className="nbanner__side">
        <span className="nbanner__delta">{alert.change >= 0 ? `+${alert.change.toFixed(1)}%` : `${alert.change.toFixed(1)}%`}</span>
        <span className="nbanner__total">{alert.score.toLocaleString("en-US")}</span>
      </div>
    </div>
  );
}

/** Shows queued notifications one at a time; click to clear early. */
export function Notifications({ onOpen }: { onOpen?: (symbol: string) => void }) {
  const alert = useCurrentNotification();
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const leaving = Boolean(alert && leavingId === alert.id);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (!alert) return;
    setLeavingId(null);
    sfx.play(alert.kind === "bullish" ? "race" : "switch");
    const hold = alert.kind === "bullish" ? GOAL_HOLD_MS : BANNER_HOLD_MS;
    timers.current = [
      window.setTimeout(() => setLeavingId(alert.id), hold),
      window.setTimeout(() => dismissNotification(alert.id), hold + EXIT_MS),
    ];
    return () => timers.current.forEach(clearTimeout);
  }, [alert]);

  if (!alert) return null;

  function close() {
    if (!alert || leaving) return;
    timers.current.forEach(clearTimeout);
    setLeavingId(alert.id);
    timers.current = [window.setTimeout(() => dismissNotification(alert.id), EXIT_MS)];
  }

  return (
    <div
      className={`notice-layer is-${alert.kind}`}
      key={alert.id}
      onClick={() => {
        if (leaving) return;
        close();
        if (alert && !alert.id.startsWith("test-")) onOpen?.(alert.symbol);
      }}
    >
      {alert.kind === "bullish" ? (
        <GoalNotice alert={alert} leaving={leaving} />
      ) : alert.kind === "setup" ? (
        <SetupBanner alert={alert} leaving={leaving} />
      ) : (
        <RankBanner alert={alert} leaving={leaving} />
      )}
    </div>
  );
}
