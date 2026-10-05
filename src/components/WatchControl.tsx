import { useState } from "react";
import { pressFlash } from "../animation/a9";
import { sfx } from "../audio/sfx";
import { formatTokens } from "../lib/numbers";
import { Glint } from "../ui/Glint";
import { ArrowRightIcon, EyeIcon, WatchAddIcon } from "../ui/Icons";

interface WatchControlProps {
  watched: boolean;
  /** Why this stock can't be watched (manual entry, no analysis, list full), or null */
  blocked: string | null;
  count: number;
  limit: number;
  /** Tokens Legend used on this stock's analysis: roughly what each update will cost */
  tokensPerUpdate: number | null;
  onAdd: () => Promise<void>;
  onRemove: () => Promise<void>;
  onOpenWatchlist: () => void;
}

/**
 * Add-to-watchlist block laid out like the game's car screen corner: the gas-tank caption and
 * counter, the TOUCHDRIVE ON/OFF switch (here WATCHLIST ON/OFF) and the big lime PLAY button.
 */
export function WatchControl({ watched, blocked, count, limit, tokensPerUpdate, onAdd, onRemove, onOpenWatchlist }: WatchControlProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = busy || (!watched && Boolean(blocked));

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message.toUpperCase() : "THE WATCHLIST IS NOT AVAILABLE");
    } finally {
      setBusy(false);
    }
  }

  const caption = error || (!watched && blocked) || (watched ? "LEGEND IS WATCHING THIS STOCK" : tokensPerUpdate ? `EACH UPDATE USES ~${formatTokens(tokensPerUpdate)} TOKENS` : "LEGEND WILL KEEP IT UPDATED");

  return (
    <div className="watchctl">
      <div className="watchctl__tank">
        <span className={`watchctl__caption${error || (!watched && blocked) ? " is-warn" : ""}`}>{caption}</span>
        <span className="watchctl__count">
          <EyeIcon size={20} />
          {count}/{limit}
        </span>
      </div>

      <div className="watchctl__switch">
        <span className="watchctl__brand" aria-hidden>
          WATCH<span>LIST</span>
        </span>
        <span className="watchctl__seg" role="radiogroup" aria-label="On the watchlist">
          {(["on", "off"] as const).map((opt) => {
            const on = opt === "on" ? watched : !watched;
            return (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={on}
                className={on ? "is-on" : undefined}
                disabled={busy || on || (opt === "on" && Boolean(blocked))}
                onClick={() => {
                  sfx.play("tap");
                  void run(opt === "on" ? onAdd : onRemove);
                }}
              >
                {opt.toUpperCase()}
              </button>
            );
          })}
        </span>
      </div>

      <button
        type="button"
        className="watchctl__play"
        disabled={disabled}
        onClick={(e) => {
          pressFlash(e.currentTarget);
          if (watched) {
            sfx.play("switch");
            onOpenWatchlist();
          } else {
            sfx.play("launch");
            void run(onAdd);
          }
        }}
      >
        <span className="watchctl__play-label">{busy ? "ADDING…" : watched ? "OPEN WATCHLIST" : "ADD TO WATCHLIST"}</span>
        {watched ? <ArrowRightIcon size={26} /> : <WatchAddIcon size={34} />}
        {!watched && !disabled && <Glint idle />}
      </button>
    </div>
  );
}
