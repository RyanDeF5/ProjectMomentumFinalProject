import { useEffect, useState } from "react";
import { sfx } from "../audio/sfx";
import { faviconUrl } from "../lib/api";
import { NEWS_CATEGORY_LABELS, readStory } from "../lib/marketNews";
import type { MarketStory, NewsTicker, StoryRead } from "../lib/types";
import { agoLabel } from "../lib/watchlist";
import { Button } from "../ui/Button";
import { Diamond } from "../ui/Diamond";
import { ArrowRightIcon, BackIcon } from "../ui/Icons";
import { LegendMark } from "../ui/LegendEmblem";

const IMPACT_LABEL = { high: "HIGH", medium: "MED", low: "LOW", none: "--" } as const;
const IMPACT_BARS = { high: 3, medium: 2, low: 1, none: 0 } as const;

/** Legend's impact card: the level big, three bars, the sentiment underneath. */
export function ImpactCard({ ai, large }: { ai: NonNullable<MarketStory["ai"]>; large?: boolean }) {
  return (
    <span className={`ncard is-${ai.sentiment}${large ? " is-large" : ""}`} aria-label={`${ai.impact} impact, ${ai.sentiment}`}>
      <span className="ncard__tag">IMPACT</span>
      <span className="ncard__level">{IMPACT_LABEL[ai.impact]}</span>
      <span className="ncard__bars" aria-hidden>
        {[1, 2, 3].map((n) => (
          <i key={n} className={n <= IMPACT_BARS[ai.impact] ? "is-on" : ""} />
        ))}
      </span>
      <span className="ncard__mood">{ai.sentiment.toUpperCase()}</span>
    </span>
  );
}

export function Favicon({ domain, className = "nrow__fav" }: { domain: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!domain || failed) return <span className={`${className} is-letter`} aria-hidden />;
  return <img className={className} src={faviconUrl(domain)} alt="" width={16} height={16} loading="lazy" onError={() => setFailed(true)} />;
}

const price = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 });

/** A stock in the story, larger than the feed's chip: its move, Legend's note on it, and a scan button. */
function StockCard({ ticker, note, onScan, disabled }: { ticker: NewsTicker; note?: string; onScan: (s: string) => void; disabled: boolean }) {
  const c = ticker.change;
  return (
    <li className={`nstock${c === null ? "" : c >= 0 ? " is-up" : " is-down"}`}>
      <div className="nstock__top">
        <span className="nstock__symbol">{ticker.symbol}</span>
        <span className="nstock__name">{ticker.name}</span>
      </div>
      <div className="nstock__quote">
        <span className="nstock__price">{Number.isFinite(ticker.price) ? `$${price(ticker.price)}` : "--"}</span>
        <span className="nstock__change">
          {c === null ? "--" : `${c >= 0 ? "▲" : "▼"} ${Math.abs(c).toFixed(2)}%`}
          {ticker.session === "PRE" && <em>PRE-MARKET</em>}
        </span>
        {ticker.after !== null && (
          <span className="nstock__after">
            AFTER HOURS {ticker.after >= 0 ? "+" : ""}
            {ticker.after.toFixed(2)}%
          </span>
        )}
      </div>
      {note && <p className="nstock__note">{note}</p>}
      <Button variant="ghost" className="nstock__scan" disabled={disabled} onClick={() => onScan(ticker.symbol)}>
        SCAN {ticker.symbol} WITH LEGEND
      </Button>
    </li>
  );
}

interface StoryReaderProps {
  story: MarketStory;
  /** Server time, for the story's age */
  now: number;
  onBack: () => void;
  onScan: (symbol: string) => void;
  scanBusy: boolean;
}

/**
 * A story opened in the app: the headline and Legend's verdict, Legend's brief of the article, the
 * stocks it moves and the other outlets that ran it. The outlet's own page is one tap away.
 * Key it by the story's id so each story starts fresh.
 */
export function StoryReader({ story, now, onBack, onScan, scanBusy }: StoryReaderProps) {
  const [read, setRead] = useState<StoryRead | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState<{ n: number; again: boolean }>({ n: 0, again: false });
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setStatus("loading");
    readStory(story.id, attempt.again)
      .then((r) => {
        if (!live) return;
        setRead(r);
        setStatus("ready");
      })
      .catch((err: Error) => {
        if (!live) return;
        setError(err.message);
        setStatus("error");
      });
    return () => {
      live = false;
    };
    // A new story, or READ AGAIN / TRY AGAIN
  }, [story.id, attempt]);

  const ai = story.ai;
  const at = Date.parse(story.publishedAt);
  const url = read?.url || story.url;
  const links = story.links?.length ? story.links : [{ publisher: story.publisher, url: story.url, domain: story.domain }];
  const others = links.filter((l) => l.publisher !== story.publisher);
  const notes = new Map((read?.stocks ?? []).map((s) => [s.symbol, s.note]));
  const tokens = read?.tokens?.total;
  const image = read?.image && !imageFailed ? read.image : null;

  return (
    <article className="nread" aria-label={story.title}>
      <div className="nread__bar">
        <button type="button" className="nread__back" onClick={onBack}>
          <BackIcon size={18} />
          BACK TO NEWS
        </button>
        <span className="nread__crumb">
          MARKET NEWS <i>/</i> {ai ? (NEWS_CATEGORY_LABELS[ai.category] ?? "NEWS") : "NEWS"}
        </span>
        <a className="nread__out" href={url} target="_blank" rel="noopener noreferrer" onClick={() => sfx.play("tap")}>
          READ ON {story.publisher.toUpperCase()}
          <ArrowRightIcon size={16} />
        </a>
      </div>

      <header className={`nread__hero${image ? " has-image" : ""}`}>
        {image && <img className="nread__image" src={image} alt="" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />}
        <div className="nread__headline">
          <span className="nrow__meta">
            <Favicon domain={story.domain} />
            <span className="nrow__publisher">{story.publisher.toUpperCase()}</span>
            <span className="nrow__age">{agoLabel(at, now)}</span>
            {story.coverage > 1 && <span className="nrow__tag is-coverage">{story.coverage} OUTLETS</span>}
            {ai?.quality === "speculative" && <span className="nrow__tag is-spec">UNCONFIRMED</span>}
          </span>
          <h2 className="nread__title">{story.title}</h2>
          {ai && (
            <div className="nread__verdict">
              <ImpactCard ai={ai} large />
              <div className="nread__why">
                <span className="nread__label">LEGEND'S READ</span>
                <p>{ai.why}</p>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="nread__body">
        <section className="nread__main" aria-live="polite">
          <div className="nread__section-head">
            <LegendMark size={22} />
            <span>LEGEND'S BRIEF</span>
            {status === "ready" && read && (
              <button type="button" className="nread__again" onClick={() => setAttempt((a) => ({ n: a.n + 1, again: true }))}>
                READ AGAIN
              </button>
            )}
          </div>

          {status === "loading" && (
            <div className="nread__loading">
              <Diamond size={40} />
              <span>
                {read ? "LEGEND IS READING IT AGAIN" : `LEGEND IS READING THE ARTICLE FROM ${story.publisher.toUpperCase()}`}
              </span>
              {story.summary && (
                <p className="nread__feed">
                  <b>FROM THE FEED</b>
                  {story.summary}
                </p>
              )}
            </div>
          )}

          {status === "error" && (
            <div className="nread__loading is-error">
              <span>LEGEND COULDN'T WRITE THE BRIEF: {error.toUpperCase()}</span>
              {story.summary && (
                <p className="nread__feed">
                  <b>FROM THE FEED</b>
                  {story.summary}
                </p>
              )}
              <Button variant="normal" onClick={() => setAttempt((a) => ({ n: a.n + 1, again: false }))}>
                TRY AGAIN
              </Button>
            </div>
          )}

          {status === "ready" && read && (
            <>
              <p className="nread__summary">{read.summary}</p>
              {read.points.length > 0 && (
                <div className="nread__block">
                  <span className="nread__label">KEY POINTS</span>
                  <ol className="nread__points">
                    {read.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ol>
                </div>
              )}
              {read.context && (
                <div className="nread__block">
                  <span className="nread__label">WHY IT MATTERS</span>
                  <p className="nread__context">{read.context}</p>
                </div>
              )}
              <p className="nread__source">
                {read.basis === "article"
                  ? `LEGEND READ THE FULL ARTICLE FROM ${story.publisher.toUpperCase()}`
                  : `${story.publisher.toUpperCase()} DOESN'T LET APPS OPEN ITS PAGE, SO LEGEND WROTE THIS FROM THE HEADLINES AND DESCRIPTIONS IN THE FEED`}
                {` · ${agoLabel(read.at, now)}`}
                {tokens ? ` · ${tokens.toLocaleString("en-US")} TOKENS` : ""}
                {" · NOT FINANCIAL ADVICE"}
              </p>
            </>
          )}
        </section>

        <aside className="nread__side">
          <div className="nread__section-head">
            <span>STOCKS IN THE STORY</span>
          </div>
          {story.tickers.length ? (
            <ul className="nstocks">
              {story.tickers.map((t) => (
                <StockCard key={t.symbol} ticker={t} note={notes.get(t.symbol)} onScan={onScan} disabled={scanBusy} />
              ))}
            </ul>
          ) : (
            <p className="nread__none">MARKET-WIDE STORY: NO SINGLE STOCK.</p>
          )}

          {others.length > 0 && (
            <>
              <div className="nread__section-head">
                <span>ALSO REPORTED BY</span>
              </div>
              <ul className="nlinks">
                {others.map((l) => (
                  <li key={l.publisher}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" onClick={() => sfx.play("tap")}>
                      <Favicon domain={l.domain} />
                      <span>{l.publisher.toUpperCase()}</span>
                      <ArrowRightIcon size={14} />
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>
    </article>
  );
}
