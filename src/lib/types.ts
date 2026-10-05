export interface StockData {
  symbol: string;
  fullName: string;
  currentPrice: number;
  lastClose: number;
  volume: number;
  averageVolume: number;
  float: number;
}

export type MarketState = "PRE-MARKET" | "MARKET OPEN" | "AFTER HOURS" | "MARKET CLOSED";

/** A news story retrieved for a stock (see server/news.js) */
export interface NewsItem {
  id: string;
  title: string;
  publisher: string;
  url: string;
  publishedAt: string;
  thumbnail: string | null;
  /** Publisher website, for its icon */
  domain: string | null;
  source: "yahoo" | "google";
  summary?: string;
  ageHours: number;
}

export interface NewsResult {
  items: NewsItem[];
  fetchedAt: string;
}

export type Sentiment = "bullish" | "bearish" | "mixed" | "neutral";

export interface ScoreComponent {
  key: string;
  label: string;
  points: number;
  max: number;
}

/** Legend's analysis of a stock (see server/legend.js) */
export interface LegendResponse {
  /** Final score from 0 to 2000: quant + catalyst bonus + risk penalty */
  score: number;
  rating: string;
  headline: string;
  newsRead: string;
  conviction: string;
  efficiency: string;
  risks: string;
  catalyst: "none" | "weak" | "moderate" | "strong" | "major";
  riskLevel: "none" | "minor" | "moderate" | "severe" | "critical";
  riskFlags: string[];
  newsSentiment: Sentiment | "none";
  /** The stories that mattered most, by NewsItem id */
  keyNews: { id: string; sentiment: Sentiment; impact: string }[];
  breakdown: {
    components: ScoreComponent[];
    liquidity: number;
    quant: number;
    catalyst: { level: string; points: number };
    risk: { level: string; points: number };
  };
  /** Model that produced the analysis ("dry-run" for the canned example) */
  model: string;
  /** Tokens this analysis used (absent for the dry run) */
  tokens?: { prompt: number; completion: number; total: number };
}

export interface LegendStatus {
  online: boolean;
  model: string | null;
  url: string;
  latencyMs?: number;
  error?: string;
}

export type PageId = "startPage" | "summaryPage";

export interface TokenTally {
  tokens: number;
  prompt: number;
  completion: number;
  /** Number of Legend analyses */
  requests: number;
  /** Tokens by hour of the day (0 = midnight), summed over the period */
  hours: number[];
  /** Scans by hour of the day */
  hourScans: number[];
  /** Tokens recorded before hourly tracking began, so not in `hours` */
  untimed: number;
}

/** Legend's token usage ("A-tokens"), from the server's usage log */
export interface TokenUsage {
  /** Daily allowance; null means unlimited */
  dailyLimit: number | null;
  today: TokenTally;
  week: TokenTally;
  month: TokenTally;
  lifetime: TokenTally;
  /** First day with recorded usage (YYYY-MM-DD) */
  since: string | null;
  /** First day with an hour-by-hour split */
  hourlySince: string | null;
  /** The server's current hour (0-23) */
  hour: number;
}

/** A stock on the watchlist (see server/watchlist.js) */
export interface WatchItem {
  symbol: string;
  name: string;
  /** Company website, for its logo */
  domain: string | null;
  addedAt: number;
  /** When the last full update (quote, news, Legend) finished; null until the first */
  updatedAt: number | null;
  updates: number;
  stock: StockData | null;
  legend: LegendResponse | null;
  news: NewsItem[];
  /** The latest session's closing prices, for the card's chart */
  spark: number[];
  /** Score before the last update, to show which way it moved */
  prevScore: number | null;
  history: { t: number; score: number; price: number }[];
  /** LEGEND OFFLINE or UPDATE FAILED when the last update failed (the card keeps its old data) */
  error: string | null;
  /** Fortune 500 rank and company when the stock is on the list (these get the gold cards) */
  fortune500: { rank: number; company: string } | null;
  /** Being updated right now */
  updating: boolean;
}

export interface WatchSettings {
  /** Seconds between each stock's updates; 0 pauses updates */
  interval: number;
  dryRun: boolean;
}

/** What the update loop is doing */
export interface WatchEngine {
  state: "offline" | "idle" | "updating" | "waiting" | "paused";
  symbol: string | null;
  nextAt: number | null;
  /** Server clock when this was sent, to line countdowns up with this device's clock */
  now?: number;
}

export interface WatchSnapshot {
  items: WatchItem[];
  settings: WatchSettings;
  engine: WatchEngine;
  limit: number;
  intervals: number[];
  now: number;
}

/** Something worth telling the user about, sent by the server as watchlist updates land */
export type WatchAlert =
  | {
      id: string;
      kind: "bullish";
      symbol: string;
      name: string;
      at: number;
      /** Headline of the newly bullish story (the first, if several) */
      title: string;
      publisher: string;
      /** Legend's one-line read on why it matters */
      impact: string;
      /** How many more new bullish stories came with it */
      more: number;
    }
  | {
      id: string;
      kind: "class-up";
      symbol: string;
      name: string;
      at: number;
      from: string;
      to: string;
      score: number;
      delta: number;
    };
