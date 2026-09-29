import type { LegendResponse, LegendStatus, MarketState, NewsItem, NewsResult, StockData, TokenUsage } from "./types";

// Same origin by default: the Express server serves both the site and the API
const API_URL = import.meta.env.VITE_API_URL ?? "";

export interface AnalyzeResponse {
  symbol: string;
  fullName: string;
  currentPrice: number;
  lastClose: number;
  currentVolume: number;
  averageVolume: number;
  float: number;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Network response was not ok: ${res.status}`);
  return res.json() as Promise<T>;
}

export function fetchStockData(symbol: string, state: MarketState) {
  return post<AnalyzeResponse>("/analyze", { symbol, state });
}

/** Recent news about a stock, ranked by relevance and recency (what Legend reads). */
export async function fetchNews(symbol: string, company: string): Promise<NewsResult> {
  const params = new URLSearchParams({ symbol, company });
  const res = await fetch(`${API_URL}/news?${params}`);
  if (!res.ok) throw new Error(`Network response was not ok: ${res.status}`);
  return res.json() as Promise<NewsResult>;
}

/** Ask Legend (LM Studio, via the server) to analyze a stock with its news. */
export function analyzeWithLegend(stockData: StockData, marketState: MarketState, news: NewsItem[]) {
  return post<LegendResponse>("/legend", { stockData, marketState, news });
}

/** LEGEND DRY RUN: a canned reply (with a real score breakdown) that doesn't call the model. */
export function exampleLegendAnalysis(stockData: StockData, marketState: MarketState, news: NewsItem[]) {
  return post<LegendResponse>("/legend/example", { stockData, marketState, news });
}

/** Whether Legend's LM Studio server is reachable, and which model it's running. */
export async function fetchLegendStatus(): Promise<LegendStatus> {
  const res = await fetch(`${API_URL}/legend/status`);
  if (!res.ok) throw new Error(`Network response was not ok: ${res.status}`);
  return res.json() as Promise<LegendStatus>;
}

/** Legend's token usage: today, this week, this month and lifetime. */
export async function fetchTokenUsage(): Promise<TokenUsage> {
  const res = await fetch(`${API_URL}/legend/usage`);
  if (!res.ok) throw new Error(`Network response was not ok: ${res.status}`);
  return res.json() as Promise<TokenUsage>;
}

/** Icon for a publisher's website, served (and cached) by the server. */
export function faviconUrl(domain: string): string {
  return `${API_URL}/favicon?domain=${encodeURIComponent(domain)}`;
}
