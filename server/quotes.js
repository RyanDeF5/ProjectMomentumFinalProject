// Market data from Yahoo Finance: the quote Legend scores, the intraday price line for the
// watchlist cards, and the market session (New York time, see marketCalendar.js).

const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const { marketStateAt } = require("./marketCalendar");

const CHART_CACHE_MS = 60_000;
const SPARK_POINTS = 60;
const chartCache = new Map();

/** Market session: New York time and the exchange's calendar (holidays, early closes). */
function marketState(now = new Date()) {
  return marketStateAt(now);
}

function domainOf(website) {
  try {
    return website ? new URL(website).hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

/**
 * Live quote for a symbol. The price follows the session: pre-market price before the open
 * (falling back to the last regular price when there's no pre-market trading yet).
 */
async function getQuote(symbol, state = marketState()) {
  const ticker = String(symbol).toUpperCase().trim();
  const quote = await yahooFinance.quote(ticker);
  if (!quote || !Number.isFinite(quote.regularMarketPrice)) throw new Error(`No quote for ${ticker}`);

  const pre = state === "PRE-MARKET" && Number.isFinite(quote.preMarketPrice);
  const price = pre ? quote.preMarketPrice : quote.regularMarketPrice;
  // When that price was set: the move is that trading day's, so a weekend scan shows Friday's
  const at = pre ? quote.preMarketTime : quote.regularMarketTime;
  const sessionAt = at ? new Date(at).toISOString() : null;
  let float = null;
  let website = null;
  try {
    const summary = await yahooFinance.quoteSummary(ticker, { modules: ["defaultKeyStatistics", "assetProfile"] });
    float = summary.defaultKeyStatistics?.floatShares ?? null;
    website = summary.assetProfile?.website ?? null;
  } catch {
    // Funds and some listings have no key statistics; the quote is still usable
  }

  return {
    symbol: ticker,
    fullName: quote.longName || quote.shortName || ticker,
    currentPrice: price,
    lastClose: quote.regularMarketPreviousClose,
    sessionAt,
    currentVolume: quote.regularMarketVolume,
    averageVolume: quote.averageDailyVolume3Month,
    float,
    domain: domainOf(website),
    // Where it trades, e.g. NMS / NasdaqGS or NYQ / NYSE (the loading screen shows that exchange)
    exchange: quote.exchange || null,
    exchangeName: quote.fullExchangeName || null,
  };
}

/** The latest session's price line (up to SPARK_POINTS closes), for a card's chart. */
async function getSparkline(symbol) {
  const ticker = String(symbol).toUpperCase();
  const cached = chartCache.get(ticker);
  if (cached && Date.now() - cached.at < CHART_CACHE_MS) return cached.value;

  const result = await yahooFinance.chart(ticker, { period1: new Date(Date.now() - 5 * 86_400_000), interval: "5m" }, { validateResult: false });
  const points = (result.quotes || []).filter((q) => Number.isFinite(q.close));
  if (!points.length) return [];
  // Keep only the most recent trading day
  const lastDay = new Date(points[points.length - 1].date).toDateString();
  const day = points.filter((q) => new Date(q.date).toDateString() === lastDay).map((q) => q.close);
  const step = Math.max(1, day.length / SPARK_POINTS);
  const value = [];
  for (let i = 0; i < day.length; i += step) value.push(Number(day[Math.floor(i)].toFixed(4)));
  if (value[value.length - 1] !== day[day.length - 1]) value.push(day[day.length - 1]);

  if (chartCache.size > 200) chartCache.clear();
  chartCache.set(ticker, { at: Date.now(), value });
  return value;
}

// ---------- Ticker search ----------
// Typing a company's name in the scan box: Yahoo's symbol search, US stocks and ETFs only.
const SEARCH_CACHE_MS = 10 * 60_000;
const SEARCH_TYPES = new Set(["EQUITY", "ETF"]);
const US_EXCHANGES = new Set(["NMS", "NYQ", "NGM", "NCM", "ASE", "PCX", "BTS", "PNK", "OQB", "OQX"]);
const searchCache = new Map();

/** Up to six stocks matching a name or the start of a ticker: [{ symbol, name, exchange, type }]. */
async function searchSymbols(query) {
  const q = String(query || "").trim().slice(0, 40);
  if (!q) return [];
  const key = q.toUpperCase();
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < SEARCH_CACHE_MS) return hit.results;
  const found = await yahooFinance.search(q, { quotesCount: 12, newsCount: 0, enableFuzzyQuery: false }, { validateResult: false });
  const results = (found.quotes || [])
    .filter((x) => x.symbol && SEARCH_TYPES.has(x.quoteType) && US_EXCHANGES.has(x.exchange) && /^[A-Z][A-Z.\-]{0,5}$/.test(x.symbol))
    .slice(0, 6)
    .map((x) => ({ symbol: x.symbol, name: x.longname || x.shortname || x.symbol, exchange: x.exchDisp || x.exchange, type: x.quoteType }));
  if (searchCache.size > 300) searchCache.clear();
  searchCache.set(key, { at: Date.now(), results });
  return results;
}

module.exports = { getQuote, getSparkline, marketState, searchSymbols };
