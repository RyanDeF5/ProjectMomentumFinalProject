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
}
