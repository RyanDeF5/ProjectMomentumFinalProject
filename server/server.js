require('dotenv').config();  
const express = require("express");
const cors = require("cors");
const path = require("path");

// YahooFinance Instances
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

// Legend AI (LM Studio) and its news retrieval
const legend = require("./legend");
const { getNews } = require("./news");

const app = express();
app.use(cors());
app.use(express.json());

// Init some variables 
let livePrice;

app.post("/analyze", async (req, res) => {
  const { symbol, state } = req.body;
  if (!symbol) return res.status(400).json({ error: "Symbol required" });

  try {
    const quote = await yahooFinance.quote(symbol.toUpperCase());

    // Determine the "True" live price based on whether the market is open or in pre/post sessions
    if (state === "PRE-MARKET"){livePrice = quote.preMarketPrice}
    else if (state === "MARKET OPEN") {livePrice = quote.regularMarketPrice}
    else {livePrice = quote.regularMarketPrice}

    console.log(quote.preMarketPrice);

    const summary = await yahooFinance.quoteSummary(symbol, { 
      modules: [ "defaultKeyStatistics" ] 
    });
    const float = summary.defaultKeyStatistics?.floatShares;

    res.json({
      symbol: symbol.toUpperCase(),
      fullName: quote.longName,
      currentPrice: livePrice, 
      lastClose: quote.regularMarketPreviousClose,
      currentVolume: quote.regularMarketVolume,
      averageVolume: quote.averageDailyVolume3Month,
      float: float
    });

    console.log(`${symbol.toUpperCase()} 
    fullName: ${quote.longName},
    currentPrice: ${livePrice}, 
    lastClose: ${quote.regularMarketPreviousClose},
    currentVolume: ${quote.regularMarketVolume},
    averageVolume: ${quote.averageDailyVolume3Month},
    float: ${float}`);

  } catch (err) {
    console.error("Yahoo Finance Error:", err);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

// Recent news about a stock, ranked for relevance and recency (also what Legend reads)
app.get("/news", async (req, res) => {
  const symbol = String(req.query.symbol || "").trim();
  if (!symbol) return res.status(400).json({ error: "Symbol required" });
  res.json(await getNews(symbol, String(req.query.company || "")));
});

// Website icons for the news sources (the loading screen's source carousel), fetched once and
// cached in memory so the page only ever talks to this server
const favicons = new Map();
app.get("/favicon", async (req, res) => {
  const domain = String(req.query.domain || "").toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) || domain.length > 100) return res.status(400).end();
  try {
    let icon = favicons.get(domain);
    if (!icon) {
      const upstream = await fetch(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`, { signal: AbortSignal.timeout(4000) });
      if (!upstream.ok) return res.status(404).end();
      icon = { type: upstream.headers.get("content-type") || "image/png", body: Buffer.from(await upstream.arrayBuffer()) };
      if (favicons.size > 500) favicons.clear();
      favicons.set(domain, icon);
    }
    res.set("Content-Type", icon.type).set("Cache-Control", "public, max-age=604800").send(icon.body);
  } catch {
    res.status(404).end();
  }
});

// Legend analysis of a stock's momentum setup, informed by its recent news
app.post("/legend", async (req, res) => {
  const { stockData, marketState } = req.body;
  if (!stockData) return res.status(400).json({ error: "Stock data required" });

  try {
    const news = Array.isArray(req.body.news) ? req.body.news : (await getNews(stockData.symbol, stockData.fullName)).items;
    const result = await legend.analyze(stockData, marketState, news);
    console.log(`Legend ${String(stockData.symbol).toUpperCase()}: ${result.score} ${result.rating} (${result.model})`);
    res.json(result);
  } catch (err) {
    console.error("Legend Error:", err.message);
    res.status(502).json({ error: "Legend is not available", detail: err.message });
  }
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// AI DRY RUN: a canned Legend reply after a short delay, without calling the model
app.post("/legend/example", async (req, res) => {
  const { stockData } = req.body;
  if (!stockData) return res.status(400).json({ error: "Stock data required" });
  await sleep(2500);
  res.json(legend.example(stockData, req.body.marketState, Array.isArray(req.body.news) ? req.body.news : []));
});

// Token usage ("A-tokens"): today, this week, this month and lifetime
app.get("/legend/usage", (req, res) => {
  res.json(legend.usageSummary());
});

// Connection check for the Settings screen
app.get("/legend/status", async (req, res) => {
  res.json(await legend.status());
});

// Serve the built React site (npm run build) from the same origin as the API
app.use(express.static(path.join(__dirname, "..", "dist")));

// Listen on PORT (default 3000), falling back to FALLBACK_PORT (default 3001) if it is taken
const PORT = Number(process.env.PORT) || 3000;
const FALLBACK_PORT = Number(process.env.FALLBACK_PORT) || 3001;

function listen(port, fallback) {
  // Express 5 also calls this callback on errors, which are handled below
  const server = app.listen(port, (err) => {
    if (!err) console.log(`Server running on port ${port}`);
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE" && fallback) {
      console.warn(`Port ${port} is in use, trying ${fallback}`);
      listen(fallback, null);
    } else {
      throw err;
    }
  });
}

listen(PORT, FALLBACK_PORT);

