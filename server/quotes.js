// Market data from Yahoo Finance: the quote Legend scores, the intraday price line for the
// watchlist cards, and the market session (in the server's local time, like the site's clock).

const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const CHART_CACHE_MS = 60_000;
const SPARK_POINTS = 60;
const chartCache = new Map();

/** Market session from local time; matches getMarketState in src/lib/clock.ts. */
function marketState(now = new Date()) {
  const day = now.getDay();
  if (day === 0 || day === 6) return "MARKET CLOSED";
  const time = now.getHours() * 100 + now.getMinutes();
  if (time >= 400 && time < 930) return "PRE-MARKET";
  if (time >= 930 && time <= 1600) return "MARKET OPEN";
  if (time > 1600 && time <= 2000) return "AFTER HOURS";
  return "MARKET CLOSED";
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

  const price = state === "PRE-MARKET" && Number.isFinite(quote.preMarketPrice) ? quote.preMarketPrice : quote.regularMarketPrice;
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

module.exports = { getQuote, getSparkline, marketState };
