import { sfx } from "../audio/sfx";
import { ageWords, freshness, isStale, stampLabel, whenLabel, type DataKind } from "../lib/freshness";
import { Diamond } from "../ui/Diamond";
import { RefreshIcon, TimerIcon } from "../ui/Icons";
import { Reveal } from "../ui/Reveal";

/**
 * The chip by a page's title saying when its data is from: "UPDATED 4M AGO · 3:42 PM". Dark while
 * fresh, orange once it's aging, pink when stale or old.
 */
export function AgeChip({ at, now, kind, label = "UPDATED" }: { at: number | null | undefined; now: number; kind: DataKind; label?: string }) {
  if (!at) return null;
  const level = freshness(at, now, kind);
  return (
    <Reveal kind="panel" className={`agechip is-${level}`} title={`Data from ${new Date(at).toLocaleString()}`}>
      <TimerIcon size={17} />
      <span>
        {label} {whenLabel(at, now)}
      </span>
    </Reveal>
  );
}

interface StaleBannerProps {
  at: number | null | undefined;
  now: number;
  kind: DataKind;
  /** What could have changed since: "STORIES MOVE FAST; THESE MAY BE OUT OF DATE" */
  risk: string;
  /** An update is running right now */
  busy?: boolean;
  /** Overrides the "NOT UPDATED SINCE" line (the watchlist names how many stocks are behind) */
  headline?: string;
  onUpdate?: () => void;
  updateLabel?: string;
}

/**
 * The warning over a page whose data is stale (orange) or old (pink): when it's from, what may have
 * changed, and a button to update it. While an update runs it says so instead. Nothing when fresh.
 */
export function StaleBanner({ at, now, kind, risk, busy, headline, onUpdate, updateLabel = "UPDATE NOW" }: StaleBannerProps) {
  if (!at) return null;
  const level = freshness(at, now, kind);
  if (!isStale(level)) return null;
  const since = `${stampLabel(at, now)} (${ageWords(at, now)} AGO)`;
  return (
    // Marked for the screen's wash in and out, so it doesn't sit there while the rest of the page leaves
    <Reveal kind="slide" wash="none" className={`stale is-${level}${busy ? " is-busy" : ""}`} role="status">
      <span className="stale__icon" aria-hidden>
        {busy ? <Diamond size={20} /> : "!"}
      </span>
      <span className="stale__text">
        <b>{busy ? "UPDATING NOW" : level === "old" ? "OLD DATA" : "NOT UP TO DATE"}</b>
        {busy
          ? ` · UNTIL IT LANDS, THIS IS FROM ${since}.`
          : ` · ${headline ?? `NOT UPDATED SINCE ${since}`}. ${risk}${level === "old" ? "; DON'T TRADE ON IT UNTIL IT'S UPDATED." : ". UPDATE BEFORE YOU TRADE ON IT."}`}
      </span>
      {onUpdate && !busy && (
        <button
          type="button"
          className="stale__update"
          onClick={() => {
            sfx.play("tap");
            onUpdate();
          }}
        >
          <RefreshIcon size={16} />
          {updateLabel}
        </button>
      )}
    </Reveal>
  );
}
