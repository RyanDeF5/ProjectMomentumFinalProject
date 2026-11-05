import { memo, useState, type Ref } from "react";
import { sfx } from "../audio/sfx";
import { compactFormatter } from "../lib/numbers";
import { CATALYST_LABELS, newestStory, type Screener } from "../lib/screener";
import type { ScreenerEntry } from "../lib/types";
import { agoLabel, useNow } from "../lib/watchlist";
import { Button } from "../ui/Button";
import { Diamond } from "../ui/Diamond";
import { Glint } from "../ui/Glint";
import { LegendEmblem } from "../ui/LegendEmblem";
import { Reveal } from "../ui/Reveal";
import { RevealText } from "../ui/RevealText";
import { faviconUrl } from "../lib/api";
import { JobStatusChip } from "../components/JobStatusChip";

interface ScreenerPageProps {
  screenRef: Ref<HTMLElement>;
  active: boolean;
  screener: Screener;
  /** Open a graded stock's full read on the summary */
  onOpen: (entry: ScreenerEntry) => void;
  /** Open the screener's settings in the Update Schedule */
  onOpenSchedule: () => void;
}

type Tab = "board" | "criteria";

/** "12M AGO" from a story's publish time. */
function storyAge(publishedAt: string, now: number): string {
  const at = Date.parse(publishedAt);
  return Number.isFinite(at) ? agoLabel(at, now) : "";
}

function Logo({ entry }: { entry: ScreenerEntry }) {
  const [failed, setFailed] = useState(false);
  const domain = entry.domain;
  if (!domain || failed) return <span className="srow__logo is-letter">{entry.symbol.slice(0, 1)}</span>;
  return (
    <span className="srow__logo">
      <img src={faviconUrl(domain)} alt="" width={26} height={26} onError={() => setFailed(true)} />
    </span>
  );
}

/** The rank tab: place, and movement since the last update. */
function RankTab({ entry }: { entry: ScreenerEntry }) {
  const moved = entry.prevRank && entry.rank ? entry.prevRank - entry.rank : 0;
  let move = null;
  if (entry.isNew) move = <span className="srow__move is-new">NEW</span>;
  else if (moved > 0) move = <span className="srow__move is-up">▲ {moved}</span>;
  else if (moved < 0) move = <span className="srow__move is-down">▼ {-moved}</span>;
  else if (entry.prevRank) move = <span className="srow__move">= SAME</span>;
  return (
    <span className="srow__rank">
      <span className="srow__pos">#{entry.rank}</span>
      {move}
    </span>
  );
}

/** One stock on the board, laid out like a row of the game's rank rewards. */
const BoardRow = memo(function BoardRow({
  entry,
  now,
  grading,
  first,
  onOpen,
}: {
  entry: ScreenerEntry;
  now: number;
  grading: boolean;
  first: boolean;
  onOpen: (e: ScreenerEntry) => void;
}) {
  const up = entry.change >= 0;
  const s = entry.ai?.screener;
  const grade = entry.grade ?? s?.setupGrade ?? null;
  const top = grade === "A+" || grade === "A";
  const story = newestStory(entry.news);
  const fresh = story ? now - Date.parse(story.publishedAt) < 3 * 3600_000 : false;

  return (
    <li className={`srow${top ? " is-top" : ""}${grade === "F" ? " is-avoid" : ""}${grading ? " is-grading" : ""}${first ? " is-first" : ""}`}>
      <button type="button" className="srow__button" disabled={!entry.ai} onClick={() => onOpen(entry)}>
        <RankTab entry={entry} />

        <span className="srow__stock">
          <Logo entry={entry} />
          <span className="srow__id">
            <span className="srow__ticker">{entry.symbol}</span>
            <span className="srow__name">{entry.name}</span>
          </span>
          <span className="srow__quote">
            <span className="srow__price">${entry.price.toFixed(2)}</span>
            <span className={`srow__change${up ? " is-up" : " is-down"}`}>
              {up ? "▲" : "▼"} {Math.abs(entry.change).toFixed(1)}%
            </span>
          </span>
        </span>

        <span className="srow__divider" aria-hidden />

        {/* The five pillars */}
        <span className="srow__pillars" aria-label={`${entry.passed} of 5 pillars`}>
          {entry.pillars.map((p) => (
            <span key={p.key} className={`pillar${p.pass ? " is-pass" : ""}`} title={`${p.label}: ${p.value}`}>
              <span className="pillar__label">{p.label}</span>
              <span className="pillar__value">{p.value}</span>
            </span>
          ))}
        </span>

        <span className="srow__divider srow__divider--grade" aria-hidden />

        {/* Legend's grade on a red "blueprint", like the CLASS S+ pack, with the newest story */}
        <span className="srow__grade">
          <span className={`grade-card${grade ? ` is-${grade === "A+" ? "aplus" : grade.toLowerCase()}` : " is-pending"}`}>
            <span className="grade-card__tag">LEGEND</span>
            <span className="grade-card__letter">{grade ?? "?"}</span>
            <span className="grade-card__count">{entry.passed}/5</span>
          </span>
          <span className="srow__verdict">
            <span className="srow__verdict-title">
              {grade ? `${grade} SETUP` : "SETUP"}
              {s && <span className="srow__catalyst">{CATALYST_LABELS[s.catalystType] ?? "NEWS"}</span>}
              <span className="srow__score">{entry.score.toLocaleString("en-US")}</span>
            </span>
            {s ? <span className="srow__why">{s.whyNow}</span> : null}
            <span className={`srow__news${fresh ? " is-fresh" : ""}${story ? "" : " is-none"}`}>
              {story ? (
                <>
                  <span className="srow__news-age">{fresh ? "NEW · " : ""}{storyAge(story.publishedAt, now)}</span>
                  {story.publisher.toUpperCase()}: {story.title}
                </>
              ) : (
                "NO NEWS IN THE LAST WEEK"
              )}
            </span>
          </span>
          {entry.ai && <span className="srow__info" aria-hidden>i</span>}
        </span>
        <span className="srow__ago">{grading ? "RE-GRADING…" : entry.analyzedAt ? `GRADED ${agoLabel(entry.analyzedAt, now)}` : ""}</span>
        {top && <Glint idle />}
      </button>
    </li>
  );
});

/** The criteria tab: the five pillars and how the screener works. */
function Criteria({ screener }: { screener: Screener }) {
  const c = screener.settings.criteria;
  const rows = [
    { title: "PRICE", rule: `$${c.minPrice} TO $${c.maxPrice}`, why: "CHEAP ENOUGH TO MOVE FAST, ABOVE PENNY-STOCK TERRITORY" },
    { title: "FLOAT", rule: `UNDER ${compactFormatter.format(c.maxFloat)} SHARES`, why: "A SMALL SUPPLY OF SHARES LETS DEMAND PUSH THE PRICE" },
    { title: "% UP", rule: `AT LEAST +${c.minChange}%`, why: "ALREADY PROVING IT CAN RUN TODAY (PRE-MARKET BEFORE THE OPEN)" },
    { title: "REL VOLUME", rule: `${c.minRvol}X OR MORE`, why: "FAR MORE TRADING THAN USUAL: TRADERS ARE PAYING ATTENTION" },
    { title: "NEWS", rule: c.requireNews ? "FRESH IN THE LAST 24H" : "NOT REQUIRED", why: "A REAL REASON TO MOVE; LEGEND JUDGES HOW STRONG IT IS" },
  ];
  return (
    <ul className="sboard sboard--criteria">
      {rows.map((r, i) => (
        <li key={r.title} className="srow srow--criteria">
          <span className="srow__button">
            <span className="srow__rank">
              <span className="srow__pos">{i + 1}</span>
              <span className="srow__sub">PILLAR</span>
            </span>
            <span className="srow__stock">
              <span className="srow__id">
                <span className="srow__ticker">{r.title}</span>
                <span className="srow__name">{r.why}</span>
              </span>
            </span>
            <span className="srow__divider" aria-hidden />
            <span className="srow__criteria-rule">{r.rule}</span>
          </span>
        </li>
      ))}
      <li className="sboard__note">
        EACH UPDATE SEARCHES YAHOO FINANCE'S GAINERS AND MOST ACTIVE LISTS, TRENDING TICKERS ON YAHOO AND STOCKTWITS, AND MOMENTUM HEADLINES ON GOOGLE NEWS. EVERY
        STOCK UP 10%+ WITH REAL VOLUME IS A MOVER; THE HOTTEST BY THE NUMBERS (UP TO YOUR CHECK TOP LIMIT) GET A FRESH NEWS SEARCH AND ARE CHECKED
        AGAINST THE FIVE PILLARS. LEGEND THEN GRADES EVERY ONE (A+ TO F) ON CATALYST QUALITY AND RED FLAGS LIKE OFFERINGS, REVERSE SPLITS AND NO-NEWS PUMPS, AND THE
        BOARD RE-RANKS AS EACH GRADE LANDS. ONLY A+ TO C SETUPS ARE SHOWN, BEST FIRST; STOCKS GRADED F ARE LEFT OFF. NOT FINANCIAL ADVICE.
      </li>
    </ul>
  );
}

/** The stock screener, laid out like the game's multiplayer rank rewards. */
export function ScreenerPage({ screenRef, active, screener, onOpen, onOpenSchedule }: ScreenerPageProps) {
  // "Graded 2m ago" labels don't need a per-second tick
  const now = useNow(5000, active);
  const [tab, setTab] = useState<Tab>("board");
  const { board, engine, settings, stats, connected, clockOffset } = screener;
  const busy = engine.state === "scanning" || engine.state === "analyzing" || engine.state === "waiting";
  const serverNow = now - clockOffset;
  const grading = engine.state === "analyzing" ? engine.symbol : null;

  // Only the setups worth a look are shown (A+ to C); F grades and stocks Legend hasn't graded yet
  // are just counted
  const ranked = board.filter((e) => e.rank);
  const queued = board.filter((e) => !e.grade).length;
  const passed = board.filter((e) => e.grade === "F").length;
  const topSetups = board.filter((e) => e.grade === "A+" || e.grade === "A").length;

  const checked = board.length ? `LEGEND RESEARCHED THE ${board.length} HOTTEST MOVERS${passed ? `, PASSED ON ${passed} (RED FLAGS OR NO REAL CATALYST)` : ""}${queued ? `, ${busy ? "CHECKING" : "WILL CHECK"} ${queued} MORE` : ""}` : "";

  return (
    <section className="screen screen--screener" ref={screenRef} hidden={!active} aria-label="Stock screener">
      <div className="screen__bg screen__bg--screener" data-a9-bg aria-hidden />

      <div className="mp">
        <header className="mp__head">
          <div className="mp__title">
            <Reveal kind="fade" className="mp__rule" />
            <h1 className="mp__heading">
              <RevealText>STOCK SCREENER</RevealText>
            </h1>
            <div className="mp__chips">
              <JobStatusChip
                connected={connected}
                state={engine.state}
                busy={busy}
                interval={settings.interval}
                nextAt={engine.nextAt}
                reason={engine.reason}
                clockOffset={clockOffset}
                active={active}
                onOpen={onOpenSchedule}
              />
              <Reveal kind="panel" className="mp__legend">
                <LegendEmblem size={22} />
                <span>{board.length ? `${ranked.length} SETUP${ranked.length === 1 ? "" : "S"} · ${board.length} CHECKED` : "LEGEND"}</span>
              </Reveal>
              <Reveal kind="fade" className="mp__aplus">
                <span className="mp__aplus-tag">A+/A</span>
                <span className="mp__aplus-value">{topSetups}</span>
              </Reveal>
            </div>
          </div>

          <div className="mp__side">
            <div className="mp__tabs" role="tablist">
              {(
                [
                  ["board", "LIVE BOARD"],
                  ["criteria", "HOW IT WORKS"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  className={`mp__tab${tab === id ? " is-on" : ""}`}
                  onClick={() => {
                    if (tab === id) return;
                    sfx.play("tap");
                    setTab(id);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </header>

        <Reveal kind="slide" wash="none" className="mp__panel">
          {tab === "criteria" ? (
            <Criteria screener={screener} />
          ) : ranked.length ? (
            <>
              <div className="sboard__key" aria-hidden>
                <span>RANK</span>
                <span>STOCK · PRICE · TODAY</span>
                <span />
                <span>THE FIVE PILLARS (LIME = PASSED)</span>
                <span />
                <span>LEGEND'S GRADE · SCORE · NEWEST STORY</span>
              </div>
              <ul className="sboard">
                {stats && (
                  <li className="sboard__meta">
                    {stats.finishedAt ? `UPDATED ${agoLabel(stats.finishedAt, serverNow)} · ` : ""}
                    {stats.candidates} STOCKS SCANNED · {stats.movers} MOVERS · {checked}. RANKED BY GRADE, THEN SCORE · ▲▼ = RANK CHANGE SINCE THE LAST UPDATE · TAP A
                    STOCK FOR LEGEND'S FULL READ
                  </li>
                )}
                {ranked.map((entry, i) => (
                  <BoardRow key={entry.symbol} entry={entry} now={serverNow} grading={grading === entry.symbol} first={i === 0} onOpen={onOpen} />
                ))}
              </ul>
            </>
          ) : (
            <div className="sboard__empty">
              {busy ? (
                <>
                  <Diamond size={46} />
                  <span>{board.length ? `LEGEND IS RESEARCHING THE ${board.length} HOTTEST MOVERS; GOOD SETUPS APPEAR HERE AS THEY'RE FOUND` : engine.step}</span>
                </>
              ) : (
                <>
                  <span>
                    {board.length
                      ? `NO GOOD SETUPS RIGHT NOW. ${checked}.`
                      : `THE SCREENER IS ${settings.interval ? "WAITING FOR ITS NEXT UPDATE" : "PAUSED"}. SET HOW OFTEN LEGEND HUNTS FOR SETUPS, OR RUN AN UPDATE NOW, IN THE UPDATE SCHEDULE.`}
                  </span>
                  <Button variant="normal" onClick={onOpenSchedule}>
                    OPEN UPDATE SCHEDULE
                  </Button>
                </>
              )}
            </div>
          )}
        </Reveal>

      </div>
    </section>
  );
}
