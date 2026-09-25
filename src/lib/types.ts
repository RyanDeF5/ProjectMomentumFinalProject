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

export interface GeminiResponse {
  score: number | string;
  rating: string;
  insight: string;
}

export type PageId = "startPage" | "summaryPage";
