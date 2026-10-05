import { useRef, useState, type Ref } from "react";
import { createPortal } from "react-dom";
import { shake } from "../animation/a9";
import { sfx } from "../audio/sfx";
import { WatchCard } from "../components/WatchCard";
import type { WatchItem } from "../lib/types";
import {
  CLASS_ORDER,
  SORTS,
  addToWatchlist,
  intervalLabel,
  refreshWatchItem,
  removeFromWatchlist,
  setWatchSort,
  sortWatchItems,
  updateWatchSettings,
  useNow,
  useWatchSort,
  watchClass,
  type WatchSortKey,
  type Watchlist,
} from "../lib/watchlist";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Dropdown } from "../ui/Dropdown";
import { ChevronDownIcon, RefreshIcon, SearchIcon } from "../ui/Icons";
import { Reveal } from "../ui/Reveal";
import { SectionTitle } from "../ui/SectionTitle";

interface WatchlistPageProps {
  screenRef: Ref<HTMLElement>;
  active: boolean;
  watchlist: Watchlist;
  onOpenItem: (item: WatchItem) => void;
}

// Class filter in the garage's order
const FILTERS = ["ALL", "D", "C", "B", "A", "S"] as const;
type Filter = (typeof FILTERS)[number];

const DIRECTION_LABELS: Record<WatchSortKey, [string, string]> = {
  class: ["S TO D", "D TO S"],
  score: ["HIGH TO LOW", "LOW TO HIGH"],
  change: ["HIGH TO LOW", "LOW TO HIGH"],
  rvol: ["HIGH TO LOW", "LOW TO HIGH"],
  price: ["HIGH TO LOW", "LOW TO HIGH"],
  symbol: ["A TO Z", "Z TO A"],
  added: ["NEWEST FIRST", "OLDEST FIRST"],
  updated: ["NEWEST FIRST", "OLDEST FIRST"],
};

/** The watchlist, laid out like the game's garage: class filters, a class rail and a grid of cards. */
export function WatchlistPage({
  screenRef,
  active,
  watchlist,
  onOpenItem,
}: WatchlistPageProps) {
  const now = useNow(1000);
  const sort = useWatchSort();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [ticker, setTicker] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [removing, setRemoving] = useState<WatchItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { items, settings, engine, limit, connected, clockOffset } = watchlist;
  const visible = sortWatchItems(
    items.filter((item) => filter === "ALL" || watchClass(item) === filter),
    sort,
  );

  // Sorting by class groups the cards under a class rail, like the garage; otherwise one group
  const classOrder = sort.descending ? CLASS_ORDER : [...CLASS_ORDER].reverse();
  const grouped =
    sort.key === "class"
      ? [...classOrder, "?"]
          .map((cls) => ({
            label: cls === "?" ? "NEW" : cls,
            items: visible.filter((item) => watchClass(item) === cls),
          }))
          .filter((group) => group.items.length)
      : [{ label: filter, items: visible }];
  const groups = grouped.length ? grouped : [{ label: filter, items: [] }];

  const serverNow = now - clockOffset;
  let status: string;
  if (!connected) status = "CONNECTING…";
  else if (engine.state === "updating") status = `UPDATING ${engine.symbol}`;
  else if (engine.state === "waiting") status = "WAITING FOR YOUR SCAN";
  else if (engine.state === "paused") status = "UPDATES PAUSED";
  else if (engine.nextAt && engine.symbol)
    status = `NEXT: ${engine.symbol} IN ${Math.max(0, Math.ceil((engine.nextAt - serverNow) / 1000))}S`;
  else status = items.length ? "UP TO DATE" : "READY";

  async function add() {
    const symbol = ticker.trim().toUpperCase();
    if (!symbol) {
      setAddError("ENTER A STOCK TICKER/SYMBOL");
      sfx.play("tap");
      if (inputRef.current) shake(inputRef.current);
      return;
    }
    if (items.some((item) => item.symbol === symbol)) {
      setAddError(`${symbol} IS ALREADY ON YOUR WATCHLIST`);
      return;
    }
    sfx.play("launch");
    setAdding(true);
    setAddError("");
    try {
      await addToWatchlist(symbol);
      setTicker("");
    } catch (err) {
      setAddError(
        err instanceof Error
          ? err.message.toUpperCase()
          : "COULD NOT ADD THIS STOCK",
      );
      if (inputRef.current) shake(inputRef.current);
    } finally {
      setAdding(false);
    }
  }

  return (
    <section
      className="screen screen--watchlist"
      ref={screenRef}
      hidden={!active}
      aria-label="Watchlist"
    >
      <div className="screen__bg screen__bg--menu" data-a9-bg aria-hidden />

      <div className="garage">
        <div className="garage__head">
          <div className="garage__title">
            <SectionTitle as="h1" size="lg">
              WATCHLIST
            </SectionTitle>
            <Reveal kind="panel" className="garage__count">
              {items.length}/{limit} STOCKS
            </Reveal>
          </div>

          <Reveal kind="fade" className="garage__filters">
            <div
              className="garage__filter-set"
              role="group"
              aria-label="Filter by class"
            >
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`garage__filter${f === "ALL" ? " is-all" : ""}${filter === f ? " is-on" : ""}`}
                  aria-pressed={filter === f}
                  onClick={() => {
                    if (filter === f) return;
                    sfx.play("tap");
                    setFilter(f);
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          </Reveal>
        </div>

        <Reveal kind="panel" className="garage__bar">
          <form
            className="garage__add"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <span className="search garage__search">
              <SearchIcon />
              <input
                ref={inputRef}
                className="a9-input a9-input--ticker a9-input--search"
                placeholder="ADD A TICKER"
                aria-label="Ticker to add"
                autoComplete="off"
                spellCheck={false}
                value={ticker}
                maxLength={12}
                onChange={(e) => {
                  setTicker(e.target.value);
                  setAddError("");
                }}
              />
            </span>
            <Button
              type="submit"
              variant="buy"
              sound={null}
              disabled={adding || items.length >= limit}
              className="garage__add-btn"
            >
              {adding ? "ADDING" : "ADD"}
            </Button>
            {addError && <span className="garage__error">{addError}</span>}
          </form>

          <div className="garage__controls">
            <Dropdown
              label="SORT BY"
              options={SORTS}
              value={sort.key}
              onChange={(key) => setWatchSort({ key, descending: true })}
            />
            <button
              type="button"
              className={`garage__dir${sort.descending ? "" : " is-up"}`}
              onClick={() => {
                sfx.play("tap");
                setWatchSort({ ...sort, descending: !sort.descending });
              }}
            >
              {DIRECTION_LABELS[sort.key][sort.descending ? 0 : 1]}
              <ChevronDownIcon size={14} />
            </button>
            <Dropdown
              label="UPDATES"
              options={watchlist.intervals.map((s) => ({
                value: s,
                label: intervalLabel(s),
              }))}
              value={settings.interval}
              onChange={(interval) => void updateWatchSettings({ interval })}
            />
          </div>
        </Reveal>

        <Reveal kind="fade" className="garage__status">
          <span
            className={`garage__pulse is-${connected ? engine.state : "offline"}`}
            aria-hidden
          />
          <span className="garage__status-text" aria-live="polite">
            {status}
          </span>
          <span className="garage__status-note">
            EACH UPDATE: LIVE QUOTE · NEWS SEARCH · LEGEND RE-SCORE
          </span>
          {items.length > 0 && (
            <button
              type="button"
              className="garage__all"
              onClick={() => {
                sfx.play("tap");
                items.forEach((item) => void refreshWatchItem(item.symbol));
              }}
            >
              <RefreshIcon size={15} />
              UPDATE ALL NOW
            </button>
          )}
        </Reveal>

        <div className="garage__body">
          {groups.map((group) => (
            <div key={group.label} className="garage__group">
              <div
                className={`garage__rail${group.label.length > 1 ? " is-word" : ""}`}
                aria-hidden
              >
                <span>{group.label}</span>
              </div>
              {group.items.length ? (
                <div className="garage__grid">
                  {group.items.map((item, i) => (
                    <Reveal
                      key={item.symbol}
                      kind="slide"
                      wash="none"
                      delay={260 + Math.min(i, 8) * 50}
                      className={`garage__cell${now - item.addedAt < 4000 ? " is-new" : ""}`}
                    >
                      <WatchCard
                        item={item}
                        now={serverNow}
                        onOpen={onOpenItem}
                        onRefresh={(it) => void refreshWatchItem(it.symbol)}
                        onRemove={(it) => {
                          sfx.play("tap");
                          setRemoving(it);
                        }}
                      />
                    </Reveal>
                  ))}
                </div>
              ) : (
                <p className="garage__empty">
                  {items.length
                    ? `NO CLASS ${filter} STOCKS ON YOUR WATCHLIST`
                    : "YOUR WATCHLIST IS EMPTY. ADD A TICKER ABOVE, OR SCAN A STOCK AND PRESS ADD TO WATCHLIST."}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {removing &&
        createPortal(
          <Dialog
            title="REMOVE STOCK"
            onClose={() => setRemoving(null)}
            action={{
              label: "REMOVE",
              onClick: () => void removeFromWatchlist(removing.symbol),
            }}
          >
            <p>
              REMOVE {removing.symbol} FROM YOUR WATCHLIST? LEGEND WILL STOP
              UPDATING IT.
            </p>
          </Dialog>,
          document.body,
        )}
    </section>
  );
}
