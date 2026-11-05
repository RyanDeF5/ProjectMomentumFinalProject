require('dotenv').config();  
const express = require("express");
const cors = require("cors");
const path = require("path");

// Market data, Legend AI (LM Studio) with its news retrieval, and the watchlist
const { getQuote } = require("./quotes");
const legend = require("./legend");
const { getNews } = require("./news");
const watchlist = require("./watchlist");
const screener = require("./screener");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Connection check for the page's signal icon: answering at all shows the page can reach this
// server; `internet` shows whether this server can reach the web (market data, news). The probe
// is cached so pages polling often don't add traffic.
const PROBE_URL = "https://www.gstatic.com/generate_204";
const PROBE_EVERY_MS = 15_000;
const SLOW_PROBE_MS = 1500;
let internet = { state: "unknown", ms: null, checkedAt: 0 };
let probing = null;

function probeInternet() {
  if (!probing) {
    const started = Date.now();
    probing = fetch(PROBE_URL, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(5000) })
      .then(() => {
        const ms = Date.now() - started;
        internet = { state: ms > SLOW_PROBE_MS ? "slow" : "ok", ms, checkedAt: Date.now() };
      })
      .catch(() => {
        internet = { state: "down", ms: null, checkedAt: Date.now() };
      })
      .finally(() => {
        probing = null;
      });
  }
  return probing;
}

app.get("/health", async (req, res) => {
  if (Date.now() - internet.checkedAt > PROBE_EVERY_MS) {
    // Answer straight away with the last result unless there isn't one yet
    const probe = probeInternet();
    if (!internet.checkedAt) await probe;
  }
  res.set("Cache-Control", "no-store").json({ ok: true, internet, now: Date.now() });
});

app.post("/analyze", async (req, res) => {
  const { symbol, state } = req.body;
  if (!symbol) return res.status(400).json({ error: "Symbol required" });

  try {
    // The price follows the session: pre-market price before the open, the regular price otherwise
    const { domain: _domain, ...quote } = await getQuote(symbol, state);
    res.json(quote);
    console.log(`${quote.symbol} ${quote.fullName}: $${quote.currentPrice} (close ${quote.lastClose}), volume ${quote.currentVolume} / avg ${quote.averageVolume}, float ${quote.float}`);
  } catch (err) {
    console.error("Yahoo Finance Error:", err.message);
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

// Scans run by hand take priority: the watchlist waits while one is using Legend
let scansInProgress = 0;
watchlist.setScanCheck(() => scansInProgress > 0);
screener.setScanCheck(() => scansInProgress > 0);

// Legend analysis of a stock's momentum setup, informed by its recent news
app.post("/legend", async (req, res) => {
  const { stockData, marketState } = req.body;
  if (!stockData) return res.status(400).json({ error: "Stock data required" });

  scansInProgress++;
  try {
    const news = Array.isArray(req.body.news) ? req.body.news : (await getNews(stockData.symbol, stockData.fullName)).items;
    const result = await legend.analyze(stockData, marketState, news);
    console.log(`Legend ${String(stockData.symbol).toUpperCase()}: ${result.score} ${result.rating} (${result.model})`);
    res.json(result);
  } catch (err) {
    console.error("Legend Error:", err.message);
    res.status(502).json({ error: "Legend is not available", detail: err.message });
  } finally {
    scansInProgress--;
    watchlist.poke();
    screener.poke();
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

// Watchlist: saved stocks, kept fresh (quote, news, Legend) while the site is open
app.get("/watchlist", (req, res) => res.json(watchlist.snapshot()));
app.get("/watchlist/stream", (req, res) => watchlist.connect(req, res));

app.post("/watchlist", async (req, res) => {
  try {
    const { symbol, snapshot } = req.body || {};
    // A ticker typed on the watchlist screen (no scan behind it) must exist before it's added
    if (!snapshot) {
      try {
        await getQuote(symbol);
      } catch {
        return res.status(404).json({ error: `${String(symbol || "").toUpperCase()} WAS NOT FOUND` });
      }
    }
    res.status(201).json(watchlist.add(symbol, snapshot));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete("/watchlist/:symbol", (req, res) => {
  res.status(watchlist.remove(req.params.symbol) ? 204 : 404).end();
});

app.post("/watchlist/:symbol/refresh", (req, res) => {
  res.status(watchlist.refresh(req.params.symbol) ? 202 : 404).end();
});

app.put("/watchlist/settings", (req, res) => {
  try {
    res.json(watchlist.updateSettings(req.body || {}));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Stock screener: Legend's continuous hunt for momentum setups (paused by default)
app.get("/screener", (req, res) => res.json(screener.snapshot()));
app.get("/screener/stream", (req, res) => screener.connect(req, res));
app.post("/screener/scan", (req, res) => {
  res.status(screener.scanNow() ? 202 : 409).end();
});
app.put("/screener/settings", (req, res) => {
  try {
    res.json(screener.updateSettings(req.body || {}));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
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

