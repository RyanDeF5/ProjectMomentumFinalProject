import { useState, type CSSProperties } from "react";
import { formatTokens } from "../lib/numbers";
import type { TokenTally } from "../lib/types";

interface TokenHourChartProps {
  tally: TokenTally | null;
  /** Card label of the period shown, e.g. TODAY */
  period: string;
  /** Hour to mark as NOW (only for today), or null */
  nowHour: number | null;
  /** Delay before the bars grow, so they land after the screen has built in */
  delayMs: number;
  /** First day with an hour split (YYYY-MM-DD), for the untracked-tokens note */
  hourlySince: string | null;
}

// Trading sessions in local time, matching the top bar's market status
const SESSIONS = [
  { label: "PRE-MARKET", from: 4, to: 9.5, tone: "pre" },
  { label: "MARKET OPEN", from: 9.5, to: 16, tone: "open" },
  { label: "AFTER HOURS", from: 16, to: 20, tone: "after" },
] as const;

const AXIS_HOURS = [0, 3, 6, 9, 12, 15, 18, 21];

function hourLabel(hour: number): string {
  const h = hour % 24;
  return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
}

/** A round top for the scale (1, 2 or 5 times a power of ten) so the gridlines read cleanly. */
function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((m) => m * power >= value) ?? 10;
  return step * power;
}

function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleString("en-US", { month: "short", day: "numeric" }).toUpperCase();
}

/** When in the day Legend's tokens were spent: one bar per hour, over the selected period. */
export function TokenHourChart({ tally, period, nowHour, delayMs, hourlySince }: TokenHourChartProps) {
  const [focus, setFocus] = useState<number | null>(null);
  const hours = tally?.hours ?? Array<number>(24).fill(0);
  const scans = tally?.hourScans ?? Array<number>(24).fill(0);
  const timed = hours.reduce((a, b) => a + b, 0);
  const peak = hours.reduce((best, v, h) => (v > hours[best] ? h : best), 0);
  const top = niceCeiling(hours[peak]);
  const untimed = tally?.untimed ?? 0;

  return (
    <div className="hours" style={{ "--hours-delay": `${delayMs}ms` } as CSSProperties}>
      <div className="hours__head">
        <span className="hours__title">USAGE BY HOUR</span>
        <span className="hours__period">{period}</span>
        <span className="hours__peak">
          {timed > 0 ? (
            <>
              PEAK <strong>{hourLabel(peak)}</strong>
              <span className="hours__peak-sep" aria-hidden />
              <strong>{formatTokens(hours[peak])}</strong> TOKENS
            </>
          ) : (
            "NO SCANS YET"
          )}
        </span>
      </div>

      <div className="hours__frame">
        <div className="hours__scale" aria-hidden>
          <span>{timed > 0 ? formatTokens(top) : ""}</span>
          <span>{timed > 0 ? formatTokens(top / 2) : ""}</span>
          <span>0</span>
        </div>

        <div className="hours__plot" onMouseLeave={() => setFocus(null)}>
          {SESSIONS.map((s) => (
            <span
              key={s.label}
              className={`hours__session is-${s.tone}`}
              style={{ left: `${(s.from / 24) * 100}%`, width: `${((s.to - s.from) / 24) * 100}%` }}
              aria-hidden
            >
              <span>{s.label}</span>
            </span>
          ))}
          <span className="hours__grid" aria-hidden />

          <ol className="hours__bars" key={`${period}-${timed}`} aria-label={`Tokens used by hour, ${period.toLowerCase()}`}>
            {hours.map((tokens, h) => (
              <li
                key={h}
                className={`hours__col${h === focus ? " is-focus" : ""}${h === nowHour ? " is-now" : ""}${tokens > 0 && h === peak ? " is-peak" : ""}`}
                aria-label={`${hourLabel(h)}: ${formatTokens(tokens)} tokens`}
                onMouseEnter={() => setFocus(h)}
                onClick={() => setFocus((f) => (f === h ? null : h))}
              >
                {tokens > 0 ? (
                  <span className="hours__bar" style={{ height: `${(tokens / top) * 100}%`, animationDelay: `calc(var(--hours-delay) + ${h * 18}ms)` }} />
                ) : (
                  <span className="hours__stub" />
                )}
              </li>
            ))}
          </ol>

          {focus !== null && (
            <div
              className={`hours__tip${focus < 4 ? " is-left" : focus > 19 ? " is-right" : ""}`}
              style={{ left: `${((focus + 0.5) / 24) * 100}%` }}
              role="status"
            >
              <span className="hours__tip-time">
                {hourLabel(focus)} – {hourLabel(focus + 1)}
              </span>
              <span>
                <strong>{formatTokens(hours[focus])}</strong> TOKENS · {scans[focus]} {scans[focus] === 1 ? "SCAN" : "SCANS"}
              </span>
            </div>
          )}
        </div>

        <div className="hours__axis" aria-hidden>
          {AXIS_HOURS.map((h) => (
            <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
              {hourLabel(h)}
            </span>
          ))}
          {nowHour !== null && (
            <span className="hours__now" style={{ left: `${((nowHour + 0.5) / 24) * 100}%` }}>
              NOW
            </span>
          )}
        </div>
      </div>

      {untimed > 0 && (
        <p className="hours__note">
          {formatTokens(untimed)} TOKENS FROM BEFORE HOURLY TRACKING{hourlySince ? ` BEGAN ${formatDay(hourlySince)}` : " BEGAN"} ARE NOT SHOWN
        </p>
      )}
    </div>
  );
}
