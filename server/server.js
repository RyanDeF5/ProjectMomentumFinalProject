require('dotenv').config();  
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

// Market data, Legend AI (LM Studio) with its news retrieval, and the watchlist
const { getQuote } = require("./quotes");
const legend = require("./legend");
const { getNews } = require("./news");
const watchlist = require("./watchlist");
const screener = require("./screener");
const marketNews = require("./marketnews");
const schedule = require("./schedule");

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
marketNews.setScanCheck(() => scansInProgress > 0);

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
    marketNews.poke();
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

// Token usage ("A-tokens"): today, this week, this month and lifetime. The daily limit is the Update
// Schedule's (or the LEGEND_DAILY_TOKENS fallback); none is null.
function usageSnapshot() {
  const summary = legend.usageSummary();
  return { ...summary, dailyLimit: schedule.settings().dailyTokenLimit || summary.dailyLimit };
}
app.get("/legend/usage", (req, res) => {
  res.json(usageSnapshot());
});

// The same, live: a fresh summary after every Legend call, whatever made it (scans, the watchlist,
// the screener, news reads and briefings, story briefs) and when the daily limit changes, so the
// top bar's counter never lags what was spent
const usageClients = new Set();
let usagePending = null;
function pushUsage() {
  if (usagePending) return;
  usagePending = setTimeout(() => {
    usagePending = null;
    const data = `event: usage\ndata: ${JSON.stringify(usageSnapshot())}\n\n`;
    for (const res of usageClients) res.write(data);
  }, 250);
}
legend.onUsage(pushUsage);
schedule.onChange(pushUsage);
app.get("/legend/usage/stream", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  res.write("retry: 3000\n\n");
  res.write(`event: usage\ndata: ${JSON.stringify(usageSnapshot())}\n\n`);
  usageClients.add(res);
  const ping = setInterval(() => res.write(`event: ping\ndata: ${Date.now()}\n\n`), 15_000);
  req.on("close", () => {
    clearInterval(ping);
    usageClients.delete(res);
  });
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

// Market news: the day's headlines read by Legend, with a briefing on the market
app.get("/market-news", (req, res) => res.json(marketNews.snapshot()));
app.get("/market-news/stream", (req, res) => marketNews.connect(req, res));
app.post("/market-news/update", (req, res) => {
  res.status(marketNews.updateNow() ? 202 : 409).end();
});
// The in-app reader: Legend's brief of one story (written once and kept; { again: true } rewrites it)
app.post("/market-news/story/:id/read", async (req, res) => {
  try {
    res.json(await marketNews.storyRead(String(req.params.id), Boolean(req.body?.again)));
  } catch (err) {
    console.error("Market news: story read failed:", err.message);
    res.status(err.status || 502).json({ error: err.message });
  }
});
app.put("/market-news/settings", (req, res) => {
  try {
    res.json(marketNews.updateSettings(req.body || {}));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// The update schedule for all three AI jobs. How often each runs lives with the job itself; the
// sessions, hours, daily token limit and background running live in schedule.js.
const JOBS = {
  watchlist: { module: watchlist, defaultInterval: watchlist.DEFAULT_INTERVAL },
  screener: { module: screener, defaultInterval: 300 },
  news: { module: marketNews, defaultInterval: marketNews.DEFAULT_INTERVAL },
};

function scheduleSnapshot() {
  return {
    ...schedule.settings(),
    sessions: schedule.SESSIONS,
    tokenLimits: schedule.TOKEN_LIMITS,
    info: Object.fromEntries(Object.entries(JOBS).map(([key, job]) => [key, { ...job.module.scheduleInfo(), resume: schedule.resumeOf(key) || job.defaultInterval }])),
    today: legend.usageSummary().today.tokens,
    now: Date.now(),
  };
}

// Any schedule change can free (or hold) a job
schedule.onChange(() => {
  watchlist.poke();
  screener.poke();
  marketNews.poke();
});

app.get("/schedule", (req, res) => res.json(scheduleSnapshot()));

/**
 * PUT /schedule: { paused, dailyTokenLimit, background, jobs: { [job]: { sessions, hours, enabled,
 * interval, boardSize, storyCount } } }. `enabled: false` remembers the interval and switches the
 * job off; `enabled: true` brings that interval back.
 */
app.put("/schedule", (req, res) => {
  try {
    const body = req.body || {};
    const jobs = body.jobs || {};
    for (const [key, patch] of Object.entries(jobs)) {
      const job = JOBS[key];
      if (!job || !patch) continue;
      const current = job.module.scheduleInfo().interval;
      const change = {};
      if (patch.enabled === false && current) {
        schedule.setResume(key, current);
        change.interval = 0;
      } else if (patch.enabled === true && !current) {
        change.interval = schedule.resumeOf(key) || job.defaultInterval;
      }
      if (patch.interval !== undefined) change.interval = Number(patch.interval);
      if (key === "screener" && patch.boardSize !== undefined) change.boardSize = patch.boardSize;
      if (key === "news" && patch.storyCount !== undefined) change.storyCount = patch.storyCount;
      if (Object.keys(change).length) job.module.updateSettings(change);
    }
    schedule.update({ ...body, jobs });
    res.json(scheduleSnapshot());
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ---------- Soundtrack ----------
// The menu music: every audio file in the app's Soundtrack folder (SOUNDTRACK_DIR overrides it).
// New files show up on the next page load, nothing to register.
const SOUNDTRACK_DIR = process.env.SOUNDTRACK_DIR || path.join(__dirname, "..", "Soundtrack");
const AUDIO_FILE = /\.(mp3|m4a|aac|ogg|oga|wav|flac)$/i;

/** "[Asphalt 9： Legends Soundtrack] Lemaitre - Higher (ft. Maty Noyes).mp3" -> Higher, by Lemaitre ft. Maty Noyes */
function trackFromFile(file) {
  const name = file.replace(AUDIO_FILE, "").replace(/^\[[^\]]*\]\s*/, "").trim();
  const dash = name.indexOf(" - ");
  let artist = dash > 0 ? name.slice(0, dash).trim() : "Asphalt 9: Legends";
  let title = dash > 0 ? name.slice(dash + 3).trim() : name;
  const feat = title.match(/\s*[([](?:ft\.?|feat\.?|featuring)\s+([^)\]]+)[)\]]/i);
  if (feat) {
    title = title.replace(feat[0], "").trim();
    artist = `${artist} ft. ${feat[1].trim()}`;
  }
  return { id: file, title, artist, url: `/soundtrack/${encodeURIComponent(file)}` };
}

app.get("/music/tracks", (req, res) => {
  let files = [];
  try {
    files = fs.readdirSync(SOUNDTRACK_DIR).filter((f) => AUDIO_FILE.test(f) && !f.startsWith("."));
  } catch (err) {
    if (err.code !== "ENOENT") console.error("Soundtrack folder unreadable:", err.message);
  }
  res.json({ tracks: files.sort((a, b) => a.localeCompare(b)).map(trackFromFile) });
});
// Range requests are supported, so the island's scrubber can seek
app.use("/soundtrack", express.static(SOUNDTRACK_DIR, { maxAge: "7d" }));

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

// With KEEP RUNNING on, the jobs start without waiting for a page to connect
if (schedule.background()) {
  watchlist.poke();
  screener.poke();
  marketNews.poke();
}

