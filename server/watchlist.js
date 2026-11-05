// The watchlist: stocks saved on the server and kept fresh while the site is open. Each update is
// a full pass: a live quote and intraday price line, a fresh news search (the RAG) and a new Legend
// analysis and score. Updates run one at a time, oldest first, so no stock waits longer than the
// others and LM Studio is never flooded; they also wait while someone runs a scan by hand. Pages
// follow along through a server-sent event stream.

const fs = require("fs");
const path = require("path");
const { getQuote, getSparkline, marketState } = require("./quotes");
const { getNews } = require("./news");
const legend = require("./legend");
const { Progress } = require("./progress");
const { tickers: FORTUNE_500 } = require("./fortune500.json");

const FILE = process.env.WATCHLIST_FILE || path.join(__dirname, "data", "watchlist.json");
const MAX_ITEMS = 30;
const INTERVALS = [0, 10, 30, 60]; // seconds between a stock's updates; 0 pauses updates
const DEFAULT_INTERVAL = 30;
const NEWS_MAX_AGE_MS = 60_000; // re-run the news search at most once a minute per stock
const RETRY_MS = 30_000; // wait at least this long before retrying a failed update
const HISTORY = 24;
const SYMBOL = /^[A-Z0-9][A-Z0-9.\-=^]{0,11}$/;
// The steps of one update as the loading bar shows them, with first-guess timings (ms) that are
// replaced by measured ones
const PHASES = [
  { key: "quote", label: "PRICE" },
  { key: "news", label: "NEWS" },
  { key: "legend", label: "LEGEND" },
];
const DEFAULT_TIMING = { quote: 1200, news: 2500, legend: 7000 };

let store = load();
const clients = new Set();
const progress = new Progress(PHASES, store.timing);
let engine = { state: "offline", symbol: null, nextAt: null, progress: null, queue: 0 };
let running = false;
let current = null; // symbol being updated
let wakeUp = null;
let scanInProgress = () => false;

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (parsed && Array.isArray(parsed.items)) {
      return {
        version: 1,
        settings: { interval: DEFAULT_INTERVAL, dryRun: false, ...parsed.settings },
        items: parsed.items,
        timing: { ...DEFAULT_TIMING, ...parsed.timing },
      };
    }
  } catch (err) {
    if (err.code !== "ENOENT") console.error("Watchlist file unreadable, starting fresh:", err.message);
  }
  return { version: 1, settings: { interval: DEFAULT_INTERVAL, dryRun: false }, items: [], timing: { ...DEFAULT_TIMING } };
}

function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const temp = `${FILE}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(store));
    fs.renameSync(temp, FILE);
  } catch (err) {
    console.error("Could not save the watchlist:", err.message);
  }
}

const find = (symbol) => store.items.find((item) => item.symbol === symbol);
// ---------- Alerts ----------

const CLASSES = ["D", "C", "B", "A", "S"];
/** Same thresholds as scoreToClass in src/lib/numbers.ts. */
function scoreClass(score) {
  const v = Number(score);
  if (v > 1750) return "S";
  if (v > 1450) return "A";
  if (v > 1250) return "B";
  if (v > 1100) return "C";
  return "D";
}

const storyKey = (title) => String(title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Stories Legend marked bullish in an analysis, matched to their headlines. */
function bullishStories(analysis, stories) {
  return (analysis?.keyNews || [])
    .filter((k) => k.sentiment === "bullish")
    .map((k) => ({ flag: k, story: stories.find((s) => s.id === k.id) }))
    .filter((x) => x.story);
}

let alertSeq = 0;
function alert(kind, item, data) {
  broadcast("alert", { id: `${Date.now()}-${++alertSeq}`, kind, symbol: item.symbol, name: item.name, at: Date.now(), ...data });
}

/**
 * Tell connected pages about what this update changed: newly bullish news (each story once per
 * stock), and the stock moving up into a higher class.
 */
function announce(item, before, analysis, stories) {
  // Stocks saved before alerts existed have no history yet: record what's out there first
  const tracked = Array.isArray(item.bullishSeen);
  const seen = new Set(item.bullishSeen || []);
  const fresh = bullishStories(analysis, stories).filter(({ story }) => !seen.has(storyKey(story.title)));
  fresh.forEach(({ story }) => seen.add(storyKey(story.title)));
  item.bullishSeen = [...seen].slice(-60);
  // The first analysis of a stock only records what was already out there
  if (before.legend && tracked && fresh.length) {
    const top = fresh[0];
    alert("bullish", item, { title: top.story.title, publisher: top.story.publisher, impact: top.flag.impact, more: fresh.length - 1 });
  }
  if (before.legend) {
    const from = scoreClass(before.legend.score);
    const to = scoreClass(analysis.score);
    if (CLASSES.indexOf(to) > CLASSES.indexOf(from)) {
      alert("class-up", item, { from, to, score: Math.round(analysis.score), delta: Math.round(analysis.score - before.legend.score) });
    }
  }
}

/** Fortune 500 rank and name for a ticker, or null. These stocks get the gold (maxed) cards. */
function fortune500(symbol) {
  const entry = FORTUNE_500[symbol];
  return entry ? { rank: entry[0], company: entry[1] } : null;
}

const publicItem = ({ forced: _forced, bullishSeen: _seen, ...item }) => ({ ...item, fortune500: fortune500(item.symbol), updating: item.symbol === current });

// ---------- Event stream ----------

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(event, data) {
  for (const res of clients) send(res, event, data);
}

function snapshot() {
  return { items: store.items.map(publicItem), settings: store.settings, engine, limit: MAX_ITEMS, intervals: INTERVALS, now: Date.now() };
}

/** `progress` places the loading bar during an update; `queue` counts the other stocks due now. */
function setEngine(state, symbol = null, nextAt = null, progressNow = null) {
  const queue = dueNow(symbol);
  if (!progressNow && engine.state === state && engine.symbol === symbol && engine.nextAt === nextAt && engine.queue === queue) return;
  engine = { state, symbol, nextAt, progress: progressNow, queue };
  broadcast("engine", { ...engine, now: Date.now() });
}

function dueNow(except) {
  const interval = store.settings.interval * 1000;
  const now = Date.now();
  return store.items.filter((item) => item.symbol !== except && dueAt(item, interval) <= now).length;
}

/** GET /watchlist/stream: the current list, then every change as it happens. */
function connect(req, res) {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  res.write("retry: 3000\n\n");
  send(res, "snapshot", snapshot());
  clients.add(res);
  // Pages reopen the stream if they hear nothing for a while, so it pings regularly
  const ping = setInterval(() => send(res, "ping", Date.now()), 15_000);
  req.on("close", () => {
    clearInterval(ping);
    clients.delete(res);
  });
  poke();
}

// ---------- Update loop ----------

/** Wake the loop (or start it) after anything that changes what's due. */
function poke() {
  if (wakeUp) wakeUp();
  else if (!running) void loop();
}

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    wakeUp = () => {
      clearTimeout(timer);
      done();
    };
    function done() {
      wakeUp = null;
      resolve();
    }
  });
}

function dueAt(item, interval) {
  if (item.forced || !item.updatedAt) return 0;
  if (!interval) return Infinity; // paused
  if (item.error && item.failedAt) return item.failedAt + Math.max(interval, RETRY_MS);
  return item.updatedAt + interval;
}

// Updates only run while someone has the site open
async function loop() {
  if (running) return;
  running = true;
  try {
    while (clients.size) {
      const interval = store.settings.interval * 1000;
      if (!store.items.length) {
        setEngine("idle");
        await sleep(60_000);
        continue;
      }
      const next = store.items.map((item) => ({ item, at: dueAt(item, interval) })).sort((a, b) => a.at - b.at)[0];
      // Paused: only stocks asked for by hand (or never analyzed) are updated
      if (!interval && next.at !== 0) {
        setEngine("paused");
        await sleep(60_000);
        continue;
      }
      if (next.at > Date.now()) {
        setEngine("idle", next.item.symbol, next.at);
        await sleep(next.at - Date.now());
        continue;
      }
      if (scanInProgress()) {
        setEngine("waiting", next.item.symbol);
        await sleep(1000);
        continue;
      }
      await update(next.item);
    }
  } finally {
    running = false;
    engine = { state: "offline", symbol: null, nextAt: null, progress: null, queue: 0 };
  }
}

async function update(item) {
  const { symbol } = item;
  item.forced = false;
  current = symbol;
  progress.start();
  setEngine("updating", symbol, null, progress.step("quote"));
  broadcast("item", publicItem(item));
  try {
    const state = marketState();
    const quote = await getQuote(symbol, state);
    setEngine("updating", symbol, null, progress.step("news"));
    const stock = {
      symbol,
      fullName: quote.fullName,
      currentPrice: quote.currentPrice,
      lastClose: quote.lastClose,
      volume: quote.currentVolume,
      averageVolume: quote.averageVolume,
      float: quote.float,
    };
    const [news, spark] = await Promise.all([
      getNews(symbol, quote.fullName, { maxAgeMs: NEWS_MAX_AGE_MS }),
      getSparkline(symbol).catch(() => item.spark || []),
    ]);
    const stories = news.items.map(({ excerpt: _excerpt, ...story }) => story);
    setEngine("updating", symbol, null, progress.step("legend"));
    const analysis = store.settings.dryRun ? legend.example(stock, state, news.items) : await legend.analyze(stock, state, news.items);
    if (store.settings.dryRun) progress.hold(); // instant, so not a timing to learn from
    else progress.end();
    if (!find(symbol)) return; // removed while updating

    const now = Date.now();
    const before = { legend: item.legend };
    item.prevScore = item.legend ? item.legend.score : null;
    Object.assign(item, {
      name: quote.fullName,
      domain: quote.domain || item.domain || null,
      stock,
      legend: analysis,
      news: stories,
      spark,
      marketState: state,
      updatedAt: now,
      updates: (item.updates || 0) + 1,
      error: null,
      failedAt: null,
    });
    item.history = [...(item.history || []), { t: now, score: analysis.score, price: stock.currentPrice }].slice(-HISTORY);
    announce(item, before, analysis, stories);
    console.log(`Watchlist ${symbol}: ${analysis.score} ${analysis.rating}${store.settings.dryRun ? " (dry run)" : ""}`);
  } catch (err) {
    progress.hold();
    item.error = /LM Studio|fetch failed|ECONNREFUSED|timeout/i.test(err.message) ? "LEGEND OFFLINE" : "UPDATE FAILED";
    item.failedAt = Date.now();
    console.error(`Watchlist ${symbol} update failed:`, err.message);
  } finally {
    current = null;
    if (find(symbol)) {
      save();
      broadcast("item", publicItem(item));
    }
  }
}

/** Quote details (logo, price line) for a stock added from a scan, without a new analysis. */
async function prime(item) {
  try {
    const [quote, spark] = await Promise.all([getQuote(item.symbol), getSparkline(item.symbol)]);
    if (!find(item.symbol)) return;
    item.domain = quote.domain || item.domain || null;
    item.spark = spark;
    save();
    broadcast("item", publicItem(item));
  } catch {
    // The first scheduled update fills these in
  }
}

// ---------- Changes ----------

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

/**
 * Add a stock. A scan's results can come along as `snapshot` ({ stock, legend, news }) so the
 * card is complete at once; otherwise it is analyzed straight away.
 */
function add(rawSymbol, snapshot) {
  const symbol = String(rawSymbol || "").toUpperCase().trim();
  if (!SYMBOL.test(symbol)) throw httpError(400, "Invalid symbol");
  const existing = find(symbol);
  if (existing) return publicItem(existing);
  if (store.items.length >= MAX_ITEMS) throw httpError(409, `The watchlist holds up to ${MAX_ITEMS} stocks`);

  const now = Date.now();
  const item = { symbol, name: symbol, domain: null, addedAt: now, updatedAt: null, updates: 0, stock: null, legend: null, news: [], spark: [], prevScore: null, history: [], error: null, failedAt: null };
  const scanned = snapshot && snapshot.stock && snapshot.legend && Number.isFinite(Number(snapshot.legend.score));
  if (scanned && String(snapshot.stock.symbol).toUpperCase() === symbol) {
    Object.assign(item, {
      name: snapshot.stock.fullName || symbol,
      stock: snapshot.stock,
      legend: snapshot.legend,
      news: Array.isArray(snapshot.news) ? snapshot.news.slice(0, 12) : [],
      updatedAt: now,
      updates: 1,
      history: [{ t: now, score: Number(snapshot.legend.score), price: Number(snapshot.stock.currentPrice) }],
    });
    // The scan already showed these stories, so only later ones raise an alert
    item.bullishSeen = bullishStories(snapshot.legend, item.news).map(({ story }) => storyKey(story.title));
  }
  store.items.push(item);
  save();
  broadcast("item", publicItem(item));
  if (item.updatedAt) void prime(item);
  poke();
  return publicItem(item);
}

function remove(rawSymbol) {
  const symbol = String(rawSymbol || "").toUpperCase();
  const before = store.items.length;
  store.items = store.items.filter((item) => item.symbol !== symbol);
  if (store.items.length === before) return false;
  save();
  broadcast("remove", { symbol });
  poke();
  return true;
}

/** Update a stock next, ahead of the schedule. */
function refresh(rawSymbol) {
  const item = find(String(rawSymbol || "").toUpperCase());
  if (!item) return false;
  item.forced = true;
  poke();
  return true;
}

function updateSettings({ interval, dryRun }) {
  if (interval !== undefined) {
    if (!INTERVALS.includes(Number(interval))) throw httpError(400, `Interval must be one of ${INTERVALS.join(", ")}`);
    store.settings.interval = Number(interval);
  }
  if (dryRun !== undefined) store.settings.dryRun = Boolean(dryRun);
  save();
  broadcast("settings", store.settings);
  poke();
  return store.settings;
}

/** The server tells the loop when a hand-run scan is using Legend, so it can step aside. */
function setScanCheck(check) {
  scanInProgress = check;
}

module.exports = { connect, snapshot, add, remove, refresh, updateSettings, setScanCheck, poke };
