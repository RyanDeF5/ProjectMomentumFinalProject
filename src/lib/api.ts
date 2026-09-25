import type { GeminiResponse, MarketState, StockData } from "./types";

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

export function generateAIResponse(stockData: StockData) {
  return post<GeminiResponse>("/generate", { stockData });
}

export function generateExampleAIResponse(stockData: StockData) {
  return post<GeminiResponse>("/generateExample", { stockData });
}
