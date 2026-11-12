import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { enterScreen, exitScreen } from "../animation/a9";
import { sfx } from "../audio/sfx";
import { stampLabel } from "../lib/freshness";
import { MOOD_LABELS, NEWS_CATEGORY_LABELS, readStory } from "../lib/marketNews";
import { sinceLabel } from "../lib/newsflash";
import type { NewsTicker, Newsflash as NewsflashData } from "../lib/types";
import { agoLabel } from "../lib/watchlist";
import { Button } from "../ui/Button";
import { Diamond } from "../ui/Diamond";
import { ArrowRightIcon, BackIcon, CloseIcon, TimerIcon } from "../ui/Icons";
import { LegendMark } from "../ui/LegendEmblem";
import { Reveal } from "../ui/Reveal";

type FlashStory = NewsflashData["stories"][number];
type Brief = NonNullable<FlashStory["brief"]>;

const IMPACT_LABEL = { high: "HIGH", medium: "MED", low: "LOW", none: "--" } as const;
const IMPACT_WORD = { high: "HIGH IMPACT", medium: "MEDIUM IMPACT", low: "LOW IMPACT", none: "NO IMPACT" } as const;
// The photo behind the newsflash when its top story has none: the exchange the market opens on
const FALLBACK_PHOTO = "/images/exchanges/nyse.jpg";
const IN_PLAY_MAX = 3;
const POINTS_MAX = 2;

/** The stocks the stories move, biggest move first, each once. */
function inPlay(stories: FlashStory[]): NewsTicker[] {
  const seen = new Map<string, NewsTicker>();
  for (const s of stories) for (const t of s.tickers) if (!seen.has(t.symbol) && t.change !== null) seen.set(t.symbol, t);
  return [...seen.values()].sort((a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0)).slice(0, IN_PLAY_MAX);
}

function StockReward({ ticker, top }: { ticker: NewsTicker; top: boolean }) {
  const c = ticker.change ?? 0;
  return (
    <li className={`nflash__stock${top ? " is-top" : ""}${c >= 0 ? " is-up" : " is-down"}`}>
      <span className="nflash__stock-tag">{top ? "TOP MOVER" : ticker.session === "PRE" ? "PRE-MARKET" : "IN PLAY"}</span>
      <span className="nflash__stock-symbol">{ticker.symbol}</span>
      <span className="nflash__stock-change">
        {c >= 0 ? "▲" : "▼"} {Math.abs(c).toFixed(1)}%
      </span>
      <span className="nflash__stock-name">{ticker.name}</span>
    </li>
  );
}

function StoryCard({ story, selected, isNew, now, index, onOpen }: { story: FlashStory; selected: boolean; isNew: boolean; now: number; index: number; onOpen: () => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const ai = story.ai;
  const image = story.image && !imageFailed ? story.image : null;
  // Stepping through the stories keeps the open one's card in view
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [selected]);
  return (
    <li ref={ref} className={`nflash__card is-${ai?.sentiment ?? "neutral"}${image ? " has-image" : ""}${selected ? " is-selected" : ""}`} style={{ "--card-i": index } as CSSProperties}>
      <button type="button" className="nflash__card-face" aria-label={`${story.title}. Show the story`} aria-pressed={selected} onClick={onOpen}>
        {image && <img className="nflash__card-image" src={image} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setImageFailed(true)} />}
        <span className="nflash__card-tags">
          <span className="nflash__tag is-pink">
            <TimerIcon size={14} />
            {agoLabel(Date.parse(story.publishedAt), now).replace(" AGO", "")}
          </span>
          {ai && <span className="nflash__tag is-dark">{IMPACT_LABEL[ai.impact]}</span>}
        </span>
        <span className="nflash__card-text">
          <span className="nflash__card-kicker">
            {ai ? (NEWS_CATEGORY_LABELS[ai.category] ?? "NEWS") : "NEWS"} · {story.publisher.toUpperCase()}
          </span>
          <span className="nflash__card-title">{story.title}</span>
        </span>
      </button>
      {isNew && (
        <span className="nflash__new" aria-label="New since your last visit">
          !
        </span>
      )}
    </li>
  );
}

/**
 * One story, open inside the pop-up: its photo, when and where it ran, Legend's short brief and the
 * stocks it moves. Arrows step through the stories; FULL STORY opens it in Market News.
 */
function StoryDetail({
  story,
  index,
  count,
  now,
  brief,
  briefState,
  onStep,
  onBack,
  onFull,
}: {
  story: FlashStory;
  index: number;
  count: number;
  now: number;
  brief: Brief | null;
  briefState: "ready" | "reading" | "failed";
  onStep: (by: number) => void;
  onBack: () => void;
  onFull: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const ai = story.ai;
  const at = Date.parse(story.publishedAt);
  const image = story.image && !imageFailed ? story.image : null;
  const summary = brief?.summary || ai?.why || story.summary;
  const points = (brief?.points ?? []).slice(0, POINTS_MAX);
  const notes = new Map((brief?.stocks ?? []).map((s) => [s.symbol, s.note]));

  return (
    <div className={`nflash__detail is-${ai?.sentiment ?? "neutral"}`}>
      <div className={`nflash__detail-media${image ? " has-image" : ""}`}>
        {image && <img src={image} alt="" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />}
        <span className="nflash__detail-tags">
          {ai && <span className="nflash__tag is-dark">{IMPACT_WORD[ai.impact]}</span>}
          {ai?.quality === "speculative" && <span className="nflash__tag is-pink">UNCONFIRMED</span>}
        </span>
        {story.tickers.length > 0 && (
          <ul className="nflash__detail-stocks">
            {story.tickers.slice(0, 4).map((t) => {
              const c = t.change;
              return (
                <li key={t.symbol} className={c === null ? "" : c >= 0 ? "is-up" : "is-down"} title={notes.get(t.symbol) ?? t.name}>
                  <b>{t.symbol}</b>
                  {c === null ? "--" : `${c >= 0 ? "▲" : "▼"} ${Math.abs(c).toFixed(1)}%`}
                </li>
              );
            })}
          </ul>
        )}
        <span className="nflash__detail-index">
          <b>{index + 1}</b>/{count}
        </span>
      </div>

      <div className="nflash__detail-body">
        <span className="nflash__detail-meta">
          <span className="nflash__detail-when" title={new Date(at).toLocaleString()}>
            <TimerIcon size={15} />
            PUBLISHED {stampLabel(at, now)} · {agoLabel(at, now)}
          </span>
          <span className="nflash__detail-kicker">
            {story.publisher.toUpperCase()} · {ai ? (NEWS_CATEGORY_LABELS[ai.category] ?? "NEWS") : "NEWS"}
            {story.coverage > 1 ? ` · ${story.coverage} OUTLETS` : ""}
          </span>
        </span>
        <h3 className="nflash__detail-title">{story.title}</h3>
        <p className="nflash__detail-summary">
          <b>
            <LegendMark size={16} /> LEGEND
          </b>{" "}
          {summary}
        </p>
        {points.length > 0 && (
          <ul className="nflash__detail-points">
            {points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {briefState === "reading" && (
          <span className="nflash__detail-reading">
            <Diamond size={16} /> LEGEND IS READING THE ARTICLE
          </span>
        )}

        <div className="nflash__detail-nav">
          <button type="button" className="nflash__nav-btn" onClick={onBack} aria-label="Back to the overview">
            <BackIcon size={18} />
            ALL STORIES
          </button>
          <span className="nflash__nav-steps">
            <button type="button" className="nflash__nav-arrow" aria-label="Previous story" disabled={index === 0} onClick={() => onStep(-1)}>
              <span className="is-flip">
                <ArrowRightIcon size={18} />
              </span>
            </button>
            <button type="button" className="nflash__nav-arrow" aria-label="Next story" disabled={index === count - 1} onClick={() => onStep(1)}>
              <ArrowRightIcon size={18} />
            </button>
          </span>
          <Button variant="ghost" className="nflash__full" onClick={onFull}>
            FULL STORY
          </Button>
        </div>
      </div>
    </div>
  );
}

interface NewsflashProps {
  flash: NewsflashData;
  /** Close it (CONTINUE, the X, a click outside or Escape) */
  onClose: () => void;
  /** Open a story in the news reader */
  onRead: (story: FlashStory) => void;
}

/**
 * The day's newsflash: a pop-up over the home screen, like the game's event pop-ups, styled after its
 * event banner (Introducing SLIPSTREAM MODE): a title over the top story's photo, Legend's summary,
 * the stocks in play as the featured rewards, and the stories as event cards. Tapping a card shows
 * that story's short brief in the pop-up. It sizes with the window. Close with the X, CONTINUE,
 * Escape or a click outside. Shown the first time the app is opened each day.
 */
export function Newsflash({ flash, onClose, onRead }: NewsflashProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  // The story open in the pop-up; null shows the overview
  const [open, setOpen] = useState<number | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [now] = useState(() => Date.now());
  // Briefs Legend writes while the pop-up is open, for stories it hadn't read yet
  const [briefs, setBriefs] = useState<Record<string, Brief | "reading" | "failed">>({});
  const asked = useRef(new Set<string>());
  const stories = flash.stories;
  const stocks = inPlay(stories);
  const photo = !photoFailed ? (stories.find((s) => s.image)?.image ?? FALLBACK_PHOTO) : FALLBACK_PHOTO;
  const story = open === null ? null : stories[open];

  useLayoutEffect(() => {
    if (rootRef.current) void enterScreen(rootRef.current);
  }, []);

  // A story without a brief yet: Legend writes it now (the same brief the news reader keeps)
  useEffect(() => {
    if (!story || story.brief || asked.current.has(story.id)) return;
    const id = story.id;
    asked.current.add(id);
    setBriefs((b) => ({ ...b, [id]: "reading" }));
    readStory(id)
      .then((read) => setBriefs((b) => ({ ...b, [id]: { summary: read.summary, points: read.points, stocks: read.stocks, context: read.context } })))
      .catch(() => setBriefs((b) => ({ ...b, [id]: "failed" })));
  }, [story]);

  async function close(then?: () => void) {
    if (closing.current || !rootRef.current) return;
    closing.current = true;
    await exitScreen(rootRef.current);
    onClose();
    then?.();
  }

  const show = (i: number | null) => {
    if (i === open) return;
    sfx.play(i === null ? "tap" : "switch");
    setOpen(i);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Back to the overview first, then out
        if (open !== null) show(null);
        else {
          sfx.play("click");
          void close();
        }
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const by = e.key === "ArrowRight" ? 1 : -1;
        show(Math.min(stories.length - 1, Math.max(0, (open ?? (by > 0 ? -1 : stories.length)) + by)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const read = (s: FlashStory) => void close(() => onRead(s));
  const tokens = flash.tokens?.total;
  const fetched = story ? briefs[story.id] : undefined;
  const brief = story?.brief ?? (typeof fetched === "object" ? fetched : null);

  return (
    <div className="nflash" ref={rootRef} role="dialog" aria-modal="true" aria-labelledby="nflash-title">
      {/* The home screen stays in view behind it; clicking there closes it */}
      <div className="nflash__backdrop" data-a9-bg onClick={() => void close()} />

      <Reveal kind="panel" className="nflash__panel">
        <div className="nflash__bg" aria-hidden>
          <img src={photo} alt="" referrerPolicy="no-referrer" onError={() => setPhotoFailed(true)} />
        </div>

        <div className="nflash__head">
          <span className="nflash__tag is-pink is-lg">
            <TimerIcon size={16} />
            {sinceLabel(flash)}
          </span>
          {flash.mood && <span className="nflash__tag is-dark is-lg">{MOOD_LABELS[flash.mood]}</span>}
          <span className="nflash__count">
            <LegendMark size={18} />
            <b>{stories.length}</b> BIG {stories.length === 1 ? "STORY" : "STORIES"}
          </span>
          <button
            type="button"
            className="nflash__close"
            aria-label="Close the newsflash"
            onClick={() => {
              sfx.play("click");
              void close();
            }}
          >
            <CloseIcon size={26} />
          </button>
        </div>

        <div className="nflash__stage">
          {story && open !== null ? (
            <StoryDetail
              key={story.id}
              story={story}
              index={open}
              count={stories.length}
              now={now}
              brief={brief}
              briefState={brief ? "ready" : fetched === "failed" ? "failed" : "reading"}
              onStep={(by) => show(Math.min(stories.length - 1, Math.max(0, open + by)))}
              onBack={() => show(null)}
              onFull={() => read(story)}
            />
          ) : (
            <div className="nflash__body">
              <div className="nflash__hero">
                <h2 className="nflash__title" id="nflash-title">
                  <span className="nflash__lead">Newsflash</span> {flash.title.toUpperCase()}
                </h2>
                <p className="nflash__summary">
                  <b>LEGEND'S READ</b> {flash.summary}
                </p>
                <span className="nflash__hint">TAP A STORY BELOW FOR LEGEND'S SHORT READ ON IT</span>
              </div>

              {stocks.length > 0 && (
                <div className="nflash__featured">
                  <span className="nflash__featured-label">STOCKS IN PLAY</span>
                  <ul className="nflash__stocks">
                    {stocks.map((t, i) => (
                      <StockReward key={t.symbol} ticker={t} top={i === 0} />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <ul className="nflash__cards">
          {stories.map((s, i) => (
            <StoryCard
              key={s.id}
              story={s}
              index={i}
              now={now}
              selected={i === open}
              isNew={flash.window === "since" || Date.parse(s.publishedAt) >= flash.since}
              onOpen={() => show(i === open ? null : i)}
            />
          ))}
        </ul>

        <div className="nflash__foot">
          <span className="nflash__note">
            WRITTEN BY LEGEND · {stampLabel(flash.at, now)}
            {tokens ? ` · ${tokens.toLocaleString("en-US")} TOKENS` : ""} · NOT FINANCIAL ADVICE
          </span>
          <Button variant="normal" className="nflash__continue" onClick={() => void close()}>
            CONTINUE
          </Button>
        </div>
      </Reveal>
    </div>
  );
}
