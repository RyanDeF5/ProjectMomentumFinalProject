import type { LegendResponse, NewsItem, Sentiment } from "../lib/types";
import { Chip } from "../ui/Chip";
import { Notice } from "../ui/Notice";
import { Reveal } from "../ui/Reveal";
import { SectionTitle } from "../ui/SectionTitle";

export interface NewsState {
  status: "idle" | "done" | "error";
  items: NewsItem[];
}

const SENTIMENT_TONE: Record<Sentiment, "lime" | "pink" | "white" | "slate"> = {
  bullish: "lime",
  bearish: "pink",
  mixed: "white",
  neutral: "slate",
};

function timeAgo(hours: number): string {
  if (!Number.isFinite(hours)) return "";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}M AGO`;
  if (hours < 48) return `${Math.round(hours)}H AGO`;
  return `${Math.round(hours / 24)}D AGO`;
}

function NewsCard({ item, flag }: { item: NewsItem; flag?: LegendResponse["keyNews"][number] }) {
  return (
    <Reveal as="li" kind="slide" wash="none" className={`news-card${flag ? " is-key" : ""}`}>
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="news-card__link">
        <span className="news-card__art" aria-hidden>
          {item.thumbnail ? <img src={item.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="news-card__initial">{item.publisher.slice(0, 1)}</span>}
          {flag && (
            <span className="news-card__flag">
              <Chip tone={SENTIMENT_TONE[flag.sentiment]} size="sm">
                {flag.sentiment}
              </Chip>
            </span>
          )}
        </span>
        <span className="news-card__meta">
          <span className="news-card__publisher">{item.publisher}</span>
          <span className="news-card__age">{timeAgo(item.ageHours)}</span>
        </span>
        <span className="news-card__title">{item.title}</span>
        {flag?.impact && (
          <span className="news-card__impact">
            <span className="gold">LEGEND</span> {flag.impact}
          </span>
        )}
      </a>
    </Reveal>
  );
}

interface NewsStripProps {
  news: NewsState;
  symbol: string;
  keyNews: LegendResponse["keyNews"];
}

/** Recent news for the scanned stock, with the stories Legend relied on first and flagged. */
export function NewsStrip({ news, symbol, keyNews }: NewsStripProps) {
  const flags = new Map(keyNews.map((k) => [k.id, k]));
  const ordered = [...news.items].sort((a, b) => Number(flags.has(b.id)) - Number(flags.has(a.id)));

  return (
    <section className="news" aria-label={`Latest news for ${symbol}`}>
      <div className="news__head">
        <SectionTitle as="h2" size="sm">
          LATEST NEWS
        </SectionTitle>
        {news.status === "done" && news.items.length > 0 && (
          <span className="news__sources">
            {news.items.length} {news.items.length === 1 ? "STORY" : "STORIES"} · YAHOO FINANCE · GOOGLE NEWS
          </span>
        )}
      </div>

      {news.status === "idle" && <Notice>SCAN A STOCK TO SEE ITS LATEST NEWS</Notice>}
      {news.status === "error" && <Notice>NEWS IS NOT AVAILABLE AT THIS MOMENT</Notice>}
      {news.status === "done" && news.items.length === 0 && <Notice>NO RECENT NEWS FOUND FOR {symbol}</Notice>}
      {news.items.length > 0 && (
        <ul className="news__list">
          {ordered.map((item) => (
            <NewsCard key={item.id} item={item} flag={flags.get(item.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}
