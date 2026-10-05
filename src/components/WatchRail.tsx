import { sfx } from "../audio/sfx";
import type { WatchItem } from "../lib/types";
import { GOLD_STARS, intervalLabel, sortWatchItems, useWatchSort, watchChange, watchStars, watchClass, watchScore, watchTrend, type Watchlist } from "../lib/watchlist";
import { Glint } from "../ui/Glint";
import { ArrowRightIcon, EyeIcon, TrendBadgeIcon } from "../ui/Icons";

interface WatchRailProps {
  watchlist: Watchlist;
  onOpenItem: (item: WatchItem) => void;
  onOpenWatchlist: () => void;
}

function WatchRow({ item, onOpen }: { item: WatchItem; onOpen: (item: WatchItem) => void }) {
  const score = watchScore(item);
  const change = watchChange(item);
  const cls = watchClass(item);
  const trend = watchTrend(item);
  const up = (change ?? 0) >= 0;
  const price = item.stock?.currentPrice;

  return (
    <li>
      <button
        type="button"
        className={`wrow${watchStars(item) >= GOLD_STARS ? " is-gold" : ""}${item.updating ? " is-updating" : ""}${item.error ? " is-error" : ""}`}
        disabled={!item.legend}
        onClick={() => {
          sfx.play("click");
          onOpen(item);
        }}
      >
        <span className="wrow__class">{cls}</span>
        <span className="wrow__id">
          <span className="wrow__symbol">
            {item.symbol}
            {trend !== 0 && (
              <span className={`wrow__trend${trend < 0 ? " is-down" : ""}`}>
                <TrendBadgeIcon size={15} down={trend < 0} />
              </span>
            )}
          </span>
          <span className="wrow__name">{item.legend ? item.name : "LEGEND IS ANALYZING"}</span>
        </span>
        <span className="wrow__nums">
          <span className="wrow__price">{Number.isFinite(price) ? `$${(price as number).toFixed(2)}` : "--"}</span>
          <span className={`wrow__change${change === null ? "" : up ? " is-up" : " is-down"}`}>
            {change === null ? "--" : `${up ? "▲" : "▼"} ${Math.abs(change).toFixed(1)}%`}
          </span>
        </span>
        <span className="wrow__bar" aria-hidden>
          <span className="wrow__fill" style={{ width: `${Math.min(100, ((score ?? 0) / 2000) * 100)}%` }} />
        </span>
        <Glint token={item.updatedAt} />
      </button>
    </li>
  );
}

/** The watchlist on the home screen: a scrolling column of live rows under MARKET SCANNER. */
export function WatchRail({ watchlist, onOpenItem, onOpenWatchlist }: WatchRailProps) {
  const sort = useWatchSort();
  const items = sortWatchItems(watchlist.items, sort);
  const { engine, settings } = watchlist;
  const live = watchlist.connected && settings.interval > 0;

  return (
    <section className="wrail" aria-label="Watchlist">
      <div className="wrail__head">
        <span className="wrail__title">
          <EyeIcon size={18} />
          WATCHLIST
        </span>
        <span className={`wrail__live${live ? " is-live" : ""}`}>
          {!watchlist.connected ? "OFFLINE" : engine.state === "updating" ? `UPDATING ${engine.symbol}` : intervalLabel(settings.interval)}
        </span>
      </div>

      {items.length ? (
        <ul className="wrail__list">
          {items.map((item) => (
            <WatchRow key={item.symbol} item={item} onOpen={onOpenItem} />
          ))}
        </ul>
      ) : (
        <p className="wrail__empty">
          {watchlist.connected ? "SCAN A STOCK AND ADD IT TO YOUR WATCHLIST TO FOLLOW IT LIVE" : "CONNECTING TO THE WATCHLIST…"}
        </p>
      )}

      <button
        type="button"
        className="wrail__all"
        onClick={() => {
          sfx.play("click");
          onOpenWatchlist();
        }}
      >
        <span>
          VIEW WATCHLIST <small>{items.length}/{watchlist.limit}</small>
        </span>
        <ArrowRightIcon size={18} />
      </button>
    </section>
  );
}
