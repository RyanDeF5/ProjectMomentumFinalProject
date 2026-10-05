import { useState } from "react";
import { sfx } from "../audio/sfx";
import { faviconUrl } from "../lib/api";
import type { WatchItem } from "../lib/types";
import { GOLD_STARS, agoLabel, watchAlert, watchChange, watchClass, watchScore, watchStars, watchTrend } from "../lib/watchlist";
import { Diamond } from "../ui/Diamond";
import { Glint } from "../ui/Glint";
import { CloseIcon, RefreshIcon, StarIcon, TrendBadgeIcon } from "../ui/Icons";
import { Sparkline } from "../ui/Sparkline";

interface WatchCardProps {
  item: WatchItem;
  now: number;
  onOpen: (item: WatchItem) => void;
  onRefresh: (item: WatchItem) => void;
  onRemove: (item: WatchItem) => void;
}

function Logo({ item }: { item: WatchItem }) {
  const [failed, setFailed] = useState(false);
  if (!item.domain || failed) return <span className="wcard__logo is-letter">{item.symbol.slice(0, 1)}</span>;
  return (
    <span className="wcard__logo">
      <img src={faviconUrl(item.domain)} alt="" width={22} height={22} draggable={false} onError={() => setFailed(true)} />
    </span>
  );
}

/**
 * A watched stock as a garage card: the blue plate carries the stars, the SCORE/2000 box, the
 * session's price line (where the car sits) and the day's change; the orange "blueprint" on the
 * right carries the logo, class letter and name, over the price bar. Stocks with 4+ stars get the
 * gold card and yellow bar the game gives maxed cars, serious risk or a failed update gets the pink timed-offer frame, and the badge
 * shows which way the last update moved the score. Each finished update plays the game's glint.
 */
export function WatchCard({ item, now, onOpen, onRefresh, onRemove }: WatchCardProps) {
  const score = watchScore(item);
  const cls = watchClass(item);
  const change = watchChange(item);
  const stars = watchStars(item);
  const trend = watchTrend(item);
  const alert = watchAlert(item);
  const pending = !item.legend;
  const up = (change ?? 0) >= 0;
  const price = item.stock?.currentPrice;

  // 4+ star stocks get the gold card the game gives maxed cars; everything else is a regular car
  const gold = stars >= GOLD_STARS;
  const classes = ["wcard", gold && "is-gold", alert && "is-alert", item.updating && "is-updating", pending && "is-pending"].filter(Boolean).join(" ");

  return (
    <article className={classes} aria-label={`${item.symbol}, score ${score ?? "pending"}`}>
      <button
        type="button"
        className="wcard__open"
        disabled={pending}
        onClick={() => {
          sfx.play("click");
          onOpen(item);
        }}
      >
        <span className="wcard__plate">
          {alert ? (
            <span className="wcard__alert">{alert}</span>
          ) : (
            <span className="wcard__stars" aria-label={`${stars} of 6 stars`}>
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} className={i < stars ? "is-on" : undefined}>
                  <StarIcon size={14} />
                </span>
              ))}
            </span>
          )}
          <span className="wcard__rank">
            <span className="wcard__rank-tag">SCORE</span>
            <span className="wcard__rank-value">
              <strong>{score === null ? "----" : score.toLocaleString("en-US")}</strong>/2,000
            </span>
          </span>

          <span className="wcard__chart">
            {pending ? (
              <span className="wcard__pending">
                <Diamond size={30} />
                LEGEND IS ANALYZING
              </span>
            ) : (
              <Sparkline className="spark" points={item.spark.length ? [...item.spark, price ?? NaN] : []} baseline={item.stock?.lastClose} />
            )}
          </span>

          <span className="wcard__foot">
            <span className={`wcard__change${change === null ? "" : up ? " is-up" : " is-down"}`}>
              {change === null ? "--" : `${up ? "▲" : "▼"} ${Math.abs(change).toFixed(2)}%`}
            </span>
            <span className="wcard__ago">{item.updating ? "UPDATING" : agoLabel(item.updatedAt, now)}</span>
          </span>

          {trend !== 0 && !item.updating && (
            <span className={`wcard__trend${trend < 0 ? " is-down" : ""}`} title={trend > 0 ? "Score went up" : "Score went down"}>
              <TrendBadgeIcon size={26} down={trend < 0} />
            </span>
          )}
          {item.updating && (
            <span className="wcard__busy">
              <Diamond size={22} label={`Updating ${item.symbol}`} />
            </span>
          )}
        </span>

        <span className="wcard__side">
          <span className="wcard__print">
            <span className="wcard__print-tag">{item.fortune500 ? `FORTUNE 500 · #${item.fortune500.rank}` : "WATCHLIST"}</span>
            <Logo item={item} />
            <span className="wcard__class">{cls}</span>
            <span className="wcard__maker">{item.name}</span>
            <span className="wcard__model">{item.symbol}</span>
          </span>
          <span className="wcard__price">
            <span className="wcard__price-icon" aria-hidden>
              $
            </span>
            <span className="wcard__price-bar">{Number.isFinite(price) ? (price as number).toFixed(2) : "--"}</span>
          </span>
        </span>
      </button>

      <span className="wcard__tools">
        <button
          type="button"
          className="wcard__tool"
          aria-label={`Update ${item.symbol} now`}
          title="Update now"
          disabled={item.updating}
          onClick={() => {
            sfx.play("tap");
            onRefresh(item);
          }}
        >
          <RefreshIcon size={16} />
        </button>
        <button type="button" className="wcard__tool" aria-label={`Remove ${item.symbol}`} title="Remove" onClick={() => onRemove(item)}>
          <CloseIcon size={14} />
        </button>
      </span>

      <Glint token={item.updatedAt} />
    </article>
  );
}
