// The stock screener: Legend's continuous hunt for the day's best momentum setups.
//
// Each update (while a page is connected and the screener isn't paused):
//   1. Discovery: candidates from Yahoo's gainer / most-active screens, trending tickers (Yahoo and
//      StockTwits) and momentum headlines on Google News ("stock soars premarket", "FDA approval"...).
//   2. One batched quote checks them all, session-aware (pre-market prices before the open).
//   3. The movers get their float looked up and a first ranking from the numbers; the top ones (the
//      board size the user picks: 10 to 100) get fresh news and are checked against the five
//      pillars: price, float, % up, relative volume, fresh news.
//   4. Legend grades every stock on the board in screener mode (setup grade, catalyst, red flags),
//      one at a time, and the board re-ranks as each grade lands. New A/A+ setups raise a notification.
// The board and the scanner's progress stream to pages over server-sent events.

const fs = require("fs");
const path = require("path");
const YahooFinance = require("yahoo-finance2").default;
const { marketState } = require("./quotes");
const { getNews } = require("./news");
const { quantScore } = require("./scoring");
const legend = require("./legend");
const { Progress } = require("./progress");

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const FILE = process.env.SCREENER_FILE || path.join(__dirname, "data", "screener.json");
const INTERVALS = [0, 60, 120, 300, 600, 900, 1800, 3600]; // seconds from one update's end to the next; 0 pauses (the default)
const BOARD_SIZES = [10, 20, 50, 100]; // how many stocks are shown, and graded by Legend, per update
const DEFAULT_BOARD_SIZE = 20;
const YAHOO_SCREENS = ["small_cap_gainers", "day_gainers", "most_actives", "aggressive_small_caps"];
const NEWS_QUERIES = [
  "stock soars premarket",
  "stock jumps premarket",
  "shares surge after",
  "stock skyrockets",
  "FDA approval shares jump",
  "stock rallies on news",
  "why is stock moving today",
  "shares spike after announcement",
];
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Alpha9Legends/1.0";
const NEWS_MAX_AGE_MS = 60_000; // news searches are at most a minute old
const DEFAULT_TOKENS_PER_GRADE = 3500; // until real grades have been measured
const FLOAT_CACHE_MS = 12 * 3600_000;
const FRESH_NEWS_HOURS = 24;
// The steps of a scan as the page's loading bar shows them, with first-guess timings (ms; GRADE is
// per stock) that are replaced by measured ones as scans run
const PHASES = [
  { key: "find", label: "SEARCH" },
  { key: "quote", label: "PRICES" },
  { key: "float", label: "FLOAT" },
  { key: "news", label: "NEWS" },
  { key: "grade", label: "LEGEND" },
];
const DEFAULT_TIMING = { find: 6000, quote: 3000, float: 8000, news: 6000, grade: 6500 };
const COUNT_EVERY_MS = 250; // send "12 / 34" counts at most this often

// The five pillars of a momentum setup (defaults from the trader's checklist)
const DEFAULT_CRITERIA = { minPrice: 1, maxPrice: 10, maxFloat: 10_000_000, minChange: 25, minRvol: 10, requireNews: true };
// A mover worth a closer look, before the pillars: up 10%+ in a tradeable price range with real volume
const MOVER = { minChange: 10, minPrice: 0.5, maxPrice: 30, minVolume: 100_000 };

// Capitalized words in headlines that aren't tickers
const NOT_TICKERS = new Set(
  "A AN AND AT AI API AR ARE AS BE BIG BY CEO CFO COO CTO DOW EPS ETF ETFS EU EV EVS FDA FED FOR FROM GDP HOW IN IPO IS IT ITS NEW NO NYSE NASDAQ OF ON OR Q1 Q2 Q3 Q4 SEC S&P THE TO TOP UK UP US USA USD VS WHY WITH YOU YOUR AMEX OTC ATM PR IR TV".split(" "),
);

let store = load();
const clients = new Set();
const progress = new Progress(PHASES, store.timing);
let engine = { state: "offline", step: null, symbol: null, nextAt: null, progress: null };
let countSentAt = 0;
let running = false;
let forced = false;
let wakeUp = null;
let scanInProgress = () => false;
const floatCache = new Map();

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (parsed && Array.isArray(parsed.board)) {
      return {
        version: 1,
        settings: {
          interval: 0,
          dryRun: false,
          boardSize: DEFAULT_BOARD_SIZE,
          ...parsed.settings,
          criteria: { ...DEFAULT_CRITERIA, ...parsed.settings?.criteria },
        },
        board: parsed.board,
        stats: parsed.stats || null,
        alerted: parsed.alerted || {},
        timing: { ...DEFAULT_TIMING, ...parsed.timing },
        ranks: parsed.ranks || {},
        tokensPerGrade: parsed.tokensPerGrade || null,
      };
    }
  } catch (err) {
    if (err.code !== "ENOENT") console.error("Screener file unreadable, starting fresh:", err.message);
  }
  return {
    version: 1,
    settings: { interval: 0, dryRun: false, boardSize: DEFAULT_BOARD_SIZE, criteria: DEFAULT_CRITERIA },
    board: [],
    stats: null,
    alerted: {},
    timing: { ...DEFAULT_TIMING },
    ranks: {},
    tokensPerGrade: null,
  };
}

function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const temp = `${FILE}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(store));
    fs.renameSync(temp, FILE);
  } catch (err) {
    console.error("Could not save the screener:", err.message);
  }
}

// ---------- Event stream ----------

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
function broadcast(event, data) {
  for (const res of clients) send(res, event, data);
}

function snapshot() {
  return { board: store.board, settings: store.settings, stats: store.stats, engine, intervals: INTERVALS, boardSizes: BOARD_SIZES, estimate: estimate(), now: Date.now() };
}

/** What one update costs, for the page's estimate: tokens per Legend grade and the time per step. */
function estimate() {
  const t = store.timing;
  return {
    tokensPerGrade: store.tokensPerGrade || DEFAULT_TOKENS_PER_GRADE,
    measured: Boolean(store.tokensPerGrade),
    gradeMs: t.grade,
    baseMs: t.find + t.quote + t.float + t.news,
  };
}

function setEngine(state, extra = {}) {
  engine = { state, step: null, symbol: null, nextAt: null, progress: null, ...extra };
  broadcast("engine", { ...engine, now: Date.now() });
}

/** A scan step: what the page says, plus where the loading bar is. */
function scanStep(state, step, key, unit = 0, extra = {}) {
  setEngine(state, { step, progress: progress.step(key, unit), ...extra });
}

/** "12 / 34" within a step, sent at most every COUNT_EVERY_MS. */
function scanCount(done, total) {
  const now = Date.now();
  if (done < total && now - countSentAt < COUNT_EVERY_MS) {
    progress.count(done, total);
    return;
  }
  countSentAt = now;
  engine = { ...engine, progress: progress.count(done, total) };
  broadcast("engine", { ...engine, now });
}

/** GET /screener/stream */
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

// ---------- Loop ----------

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

// Scans only run while someone has the site open; paused unless asked for by hand
async function loop() {
  if (running) return;
  running = true;
  try {
    while (clients.size) {
      const interval = store.settings.interval * 1000;
      if (!interval && !forced) {
        setEngine("paused");
        await sleep(60_000);
        continue;
      }
      const last = store.stats?.finishedAt || 0;
      const due = forced ? 0 : last + interval;
      if (due > Date.now()) {
        setEngine("idle", { nextAt: due });
        await sleep(due - Date.now());
        continue;
      }
      forced = false;
      await scan();
    }
  } finally {
    running = false;
    engine = { state: "offline", step: null, symbol: null, nextAt: null, progress: null };
  }
}

// ---------- Discovery ----------

async function fromYahooScreens() {
  const found = [];
  await Promise.all(
    YAHOO_SCREENS.map(async (scrIds) => {
      try {
        const r = await yahooFinance.screener({ scrIds, count: 100 }, undefined, { validateResult: false });
        for (const q of r.quotes || []) found.push({ symbol: q.symbol, source: "YAHOO" });
      } catch (err) {
        console.error(`Screener: Yahoo ${scrIds} failed:`, err.message);
      }
    }),
  );
  try {
    const t = await yahooFinance.trendingSymbols("US", { count: 25 }, { validateResult: false });
    for (const q of t.quotes || []) found.push({ symbol: q.symbol, source: "TRENDING" });
  } catch (err) {
    console.error("Screener: Yahoo trending failed:", err.message);
  }
  return found;
}

async function fromStockTwits() {
  try {
    const res = await fetch("https://api.stocktwits.com/api/2/trending/symbols.json", { signal: AbortSignal.timeout(6000), headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return [];
    const body = await res.json();
    return (body.symbols || [])
      .filter((s) => /stock/i.test(s.instrument_class || "") && /NASDAQ|NYSE|AMEX|ARCA|BATS/i.test(s.exchange || ""))
      .map((s) => ({ symbol: s.symbol, source: "STOCKTWITS" }));
  } catch (err) {
    console.error("Screener: StockTwits failed:", err.message);
    return [];
  }
}

const decode = (t) =>
  String(t || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"');

/** Tickers named in a headline: "IOVA Stock", "(NASDAQ: ABCD)", "$ABCD", "ONDS, AVAV, KTOS Stocks". */
function tickersIn(title) {
  const out = new Set();
  for (const m of title.matchAll(/\((?:NASDAQ|NYSE(?:\s+American)?|AMEX|NYSEAMERICAN|OTC\w*)\s*:\s*([A-Z]{1,5})\)/gi)) out.add(m[1].toUpperCase());
  for (const m of title.matchAll(/\$([A-Z]{1,5})\b/g)) out.add(m[1]);
  for (const m of title.matchAll(/((?:\b[A-Z]{1,5}\b,\s*)*\b[A-Z]{1,5}\b)\s+(?:Stocks?|Shares)\b/g)) {
    for (const t of m[1].split(/,\s*/)) out.add(t);
  }
  return [...out].filter((t) => !NOT_TICKERS.has(t));
}

async function fromHeadlines() {
  const found = [];
  await Promise.all(
    NEWS_QUERIES.map(async (q) => {
      try {
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:1d`)}&hl=en-US&gl=US&ceid=US:en`;
        const res = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { "User-Agent": USER_AGENT } });
        if (!res.ok) return;
        const xml = await res.text();
        for (const m of xml.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<\/item>/g)) {
          const title = decode(m[1]);
          for (const symbol of tickersIn(title)) found.push({ symbol, source: "NEWS", headline: title.replace(/\s+-\s+[^-]+$/, "") });
        }
      } catch {
        // one query failing doesn't matter
      }
    }),
  );
  return found;
}

// ---------- Quotes, float, pillars ----------

function sessionMove(q, state) {
  if (state === "PRE-MARKET" && Number.isFinite(q.preMarketPrice) && Number.isFinite(q.preMarketChangePercent)) {
    return { price: q.preMarketPrice, change: q.preMarketChangePercent, prevClose: q.regularMarketPrice };
  }
  return { price: q.regularMarketPrice, change: q.regularMarketChangePercent, prevClose: q.regularMarketPreviousClose };
}

async function quotes(symbols) {
  const out = [];
  for (let i = 0; i < symbols.length; i += 50) {
    try {
      const batch = await yahooFinance.quote(symbols.slice(i, i + 50), {}, { validateResult: false });
      out.push(...(Array.isArray(batch) ? batch : [batch]).filter(Boolean));
    } catch (err) {
      console.error("Screener: quote batch failed:", err.message);
    }
  }
  return out;
}

/** Float (or shares outstanding) and company website, cached for half a day. */
async function profileOf(symbol, fallbackFloat) {
  const cached = floatCache.get(symbol);
  if (cached && Date.now() - cached.at < FLOAT_CACHE_MS) return cached.value;
  const value = { float: fallbackFloat || 0, domain: null };
  try {
    const s = await yahooFinance.quoteSummary(symbol, { modules: ["defaultKeyStatistics", "assetProfile"] }, { validateResult: false });
    value.float = s.defaultKeyStatistics?.floatShares || s.defaultKeyStatistics?.sharesOutstanding || value.float;
    const site = s.assetProfile?.website;
    if (site) value.domain = new URL(site).hostname.replace(/^www\./, "");
  } catch {
    // keep the fallback
  }
  floatCache.set(symbol, { at: Date.now(), value });
  if (floatCache.size > 2000) floatCache.clear();
  return value;
}

/** Run `fn` over items, `limit` at a time, reporting each one finished to `onDone(done, total)`. */
async function pool(items, limit, fn, onDone) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
        if (onDone) onDone(++done, items.length);
      }
    }),
  );
  return results;
}

const compact = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n)));

function pillarsFor(c, criteria) {
  const freshNews = c.news.filter((n) => n.ageHours <= FRESH_NEWS_HOURS).length;
  return [
    { key: "price", label: "PRICE", value: `$${c.price.toFixed(2)}`, pass: c.price >= criteria.minPrice && c.price <= criteria.maxPrice },
    { key: "float", label: "FLOAT", value: c.float ? compact(c.float) : "?", pass: c.float > 0 && c.float <= criteria.maxFloat },
    { key: "change", label: "% UP", value: `${c.change >= 0 ? "+" : ""}${c.change.toFixed(1)}%`, pass: c.change >= criteria.minChange },
    { key: "rvol", label: "REL VOL", value: `${c.rvol.toFixed(1)}X`, pass: c.rvol >= criteria.minRvol },
    { key: "news", label: "NEWS", value: freshNews ? `${freshNews} NEW` : c.news.length ? "OLD" : "NONE", pass: criteria.requireNews ? freshNews > 0 : true },
  ];
}

function metricsFor(c, state) {
  return {
    ticker: c.symbol,
    company: c.name,
    marketSession: state,
    price: c.price,
    previousClose: c.prevClose,
    changePercent: Math.round(c.change * 10) / 10,
    volume: c.volume,
    averageVolume3Month: c.avgVolume,
    relativeVolume: Math.round(c.rvol * 100) / 100,
    floatShares: c.float || 0,
    floatTurnoverPercent: c.float ? Math.round((c.volume / c.float) * 1000) / 10 : null,
    dollarVolume: Math.round(c.price * c.volume),
  };
}

// ---------- One update ----------

async function scan() {
  const started = Date.now();
  const state = marketState();
  const criteria = store.settings.criteria;
  const boardSize = store.settings.boardSize;
  progress.start();
  progress.plan("grade", boardSize);
  try {
    scanStep("scanning", "SEARCHING THE MARKET", "find");
    const [screens, twits, headlines] = await Promise.all([fromYahooScreens(), fromStockTwits(), fromHeadlines()]);
    const sources = new Map();
    for (const f of [...screens, ...twits, ...headlines]) {
      const symbol = String(f.symbol || "").toUpperCase();
      if (!/^[A-Z][A-Z.\-]{0,5}$/.test(symbol)) continue;
      const entry = sources.get(symbol) || { sources: new Set(), headline: null };
      entry.sources.add(f.source);
      if (f.headline && !entry.headline) entry.headline = f.headline;
      sources.set(symbol, entry);
    }

    scanStep("scanning", `PRICING ${sources.size} STOCKS`, "quote");
    const quoted = await quotes([...sources.keys()]);
    const movers = quoted
      .filter((q) => q.quoteType === "EQUITY" && q.market === "us_market")
      .map((q) => {
        const move = sessionMove(q, state);
        const volume = q.regularMarketVolume || 0;
        const avgVolume = q.averageDailyVolume3Month || q.averageDailyVolume10Day || 0;
        return {
          symbol: q.symbol,
          name: q.longName || q.shortName || q.symbol,
          exchange: q.fullExchangeName || q.exchange || null,
          price: move.price,
          change: move.change,
          prevClose: move.prevClose,
          open: q.regularMarketOpen ?? null,
          dayHigh: q.regularMarketDayHigh ?? null,
          dayLow: q.regularMarketDayLow ?? null,
          volume,
          avgVolume,
          rvol: avgVolume ? volume / avgVolume : 0,
          sharesOutstanding: q.sharesOutstanding || 0,
          marketCap: q.marketCap || null,
          found: [...sources.get(q.symbol).sources],
          headline: sources.get(q.symbol).headline,
        };
      })
      .filter((c) => Number.isFinite(c.price) && Number.isFinite(c.change))
      .filter((c) => c.change >= MOVER.minChange && c.price >= MOVER.minPrice && c.price <= MOVER.maxPrice && c.volume >= MOVER.minVolume);

    scanStep("scanning", `${movers.length} MOVERS · CHECKING FLOAT`, "float");
    // Float for every mover, then a first ranking from the numbers alone; the board takes the top ones
    await pool(
      movers,
      6,
      async (c) => {
        Object.assign(c, await profileOf(c.symbol, c.sharesOutstanding));
      },
      scanCount,
    );
    for (const c of movers) c.quant = quantScore(metricsFor({ ...c, news: [] }, state)).total;
    movers.sort((a, b) => b.quant - a.quant);
    const top = movers.slice(0, boardSize);
    progress.plan("grade", top.length);

    // Fresh news for every stock on the board, then the pillars
    scanStep("scanning", `READING THE NEWS FOR ${top.length} STOCKS`, "news");
    await pool(
      top,
      6,
      async (c) => {
        c.news = (await getNews(c.symbol, c.name, { maxAgeMs: NEWS_MAX_AGE_MS })).items.map(({ excerpt: _e, ...n }) => n);
      },
      scanCount,
    );
    const previous = new Map(store.board.map((e) => [e.symbol, e]));
    for (const c of top) {
      c.pillars = pillarsFor(c, criteria);
      c.passed = c.pillars.filter((p) => p.pass).length;
      const before = previous.get(c.symbol);
      c.firstSeen = before?.firstSeen || Date.now();
      // Last update's grade stands until Legend re-grades it in this one
      if (before?.ai) Object.assign(c, { ai: before.ai, analyzedAt: before.analyzedAt, analyzedChange: before.analyzedChange });
    }
    // Board as it stands now: new prices and news, last grades
    publish(top, started, quoted.length, movers.length, false);

    // Legend re-grades every stock on the board: last update's best first, then new arrivals
    const order = [...top].sort((a, b) => (store.ranks[a.symbol] ?? 1e9) - (store.ranks[b.symbol] ?? 1e9) || b.passed - a.passed || b.quant - a.quant);
    let graded = 0;
    for (const [i, c] of order.entries()) {
      if (scanInProgress()) {
        const held = progress.hold();
        while (scanInProgress()) {
          setEngine("waiting", { step: "WAITING FOR YOUR SCAN", progress: held });
          await sleep(1000);
        }
      }
      scanStep("analyzing", `LEGEND IS GRADING ${c.symbol}`, "grade", i, { symbol: c.symbol });
      const stock = { symbol: c.symbol, fullName: c.name, currentPrice: c.price, lastClose: c.prevClose, volume: c.volume, averageVolume: c.avgVolume, float: c.float };
      const checks = {
        pillars: c.pillars.map(({ label, value, pass }) => ({ label, value, pass })),
        pillarsPassed: `${c.passed}/5`,
        levels: { previousClose: c.prevClose, open: c.open, dayHigh: c.dayHigh, dayLow: c.dayLow },
        foundBy: c.found,
        foundHeadline: c.headline,
      };
      try {
        c.ai = store.settings.dryRun ? legend.exampleScreen(stock, state, c.news, checks) : await legend.screen(stock, state, c.news, checks);
        c.analyzedAt = Date.now();
        c.analyzedChange = c.change;
        graded++;
        if (store.settings.dryRun) progress.hold(); // instant, so not a timing to learn from
        else {
          const spent = Number(c.ai.tokens?.total);
          if (spent > 0) store.tokensPerGrade = Math.round(store.tokensPerGrade ? store.tokensPerGrade * 0.8 + spent * 0.2 : spent);
        }
        publish(top, started, quoted.length, movers.length, false, graded);
      } catch (err) {
        progress.hold();
        console.error(`Screener: Legend failed on ${c.symbol}:`, err.message);
        if (/LM Studio|fetch failed|ECONNREFUSED|timeout/i.test(err.message)) break;
      }
    }

    progress.end();
    publish(top, started, quoted.length, movers.length, true, graded);
    announce();
    console.log(`Screener: ${sources.size} found, ${quoted.length} quoted, ${movers.length} movers, ${graded}/${top.length} graded in ${Math.round((Date.now() - started) / 1000)}s`);
  } catch (err) {
    progress.hold();
    console.error("Screener scan failed:", err.message);
    store.stats = { ...(store.stats || {}), finishedAt: Date.now(), error: err.message };
    save();
  }
}

// Board order: Legend's setup grade first, then score. Stocks Legend hasn't graded yet wait between
// the C setups and the F (avoid) grades. Only A+ to C setups get a rank number.
const GRADE_RANK = { "A+": 6, A: 5, B: 4, C: 3, F: 0 };
const gradeRank = (e) => (e.grade ? GRADE_RANK[e.grade] ?? 1 : 2);

/**
 * Rank the board and send it out. Scores are Legend's where graded, the quant score otherwise.
 * Rank changes compare with the end of the last update; the final publish makes this the new base.
 */
function publish(top, started, quotedCount, moverCount, final, gradedNow = 0) {
  const entries = top.map((c) => ({
    symbol: c.symbol,
    name: c.name,
    exchange: c.exchange,
    domain: c.domain || null,
    price: c.price,
    change: c.change,
    prevClose: c.prevClose,
    open: c.open,
    dayHigh: c.dayHigh,
    dayLow: c.dayLow,
    volume: c.volume,
    avgVolume: c.avgVolume,
    rvol: c.rvol,
    float: c.float,
    marketCap: c.marketCap,
    found: c.found,
    headline: c.headline,
    news: c.news || [],
    pillars: c.pillars,
    passed: c.passed,
    quant: c.quant,
    score: c.ai ? Math.round(c.ai.score) : c.quant,
    grade: c.ai?.screener?.setupGrade || null,
    ai: c.ai || null,
    analyzedAt: c.analyzedAt || null,
    analyzedChange: c.analyzedChange ?? null,
    firstSeen: c.firstSeen,
  }));
  entries.sort((a, b) => gradeRank(b) - gradeRank(a) || b.score - a.score || b.passed - a.passed || b.quant - a.quant);
  const hadRanks = Object.keys(store.ranks).length > 0;
  let rank = 0;
  for (const e of entries) {
    e.rank = e.grade && e.grade !== "F" ? ++rank : null;
    e.prevRank = store.ranks[e.symbol] ?? null;
    e.isNew = hadRanks && e.firstSeen >= started; // joined the board in this update
  }
  store.board = entries;
  store.stats = {
    startedAt: started,
    finishedAt: final ? Date.now() : store.stats?.finishedAt || 0,
    lastStartedAt: final ? started : store.stats?.lastStartedAt || 0,
    candidates: quotedCount,
    movers: moverCount,
    shown: entries.length,
    graded: entries.filter((e) => e.ai).length,
    gradedNow,
    boardSize: store.settings.boardSize,
    session: marketState(),
    error: null,
  };
  if (final) {
    store.ranks = Object.fromEntries(entries.filter((e) => e.rank).map((e) => [e.symbol, e.rank]));
    save();
  }
  broadcast("board", { board: store.board, stats: store.stats, estimate: estimate() });
}

/** A new A or A+ setup on the board raises a notification (once per stock per day). */
function announce() {
  const today = new Date().toDateString();
  for (const e of store.board) {
    const grade = e.ai?.screener?.setupGrade;
    if (grade !== "A+" && grade !== "A") continue;
    const key = `${e.symbol}|${today}`;
    if (store.alerted[key]) continue;
    store.alerted[key] = Date.now();
    broadcast("alert", {
      id: `screener-${e.symbol}-${Date.now()}`,
      kind: "setup",
      symbol: e.symbol,
      name: e.name,
      at: Date.now(),
      grade,
      score: e.score,
      change: Math.round(e.change * 10) / 10,
      whyNow: e.ai.screener.whyNow,
    });
  }
  // Forget alerts from earlier days
  for (const key of Object.keys(store.alerted)) if (!key.endsWith(today)) delete store.alerted[key];
  save();
}

// ---------- Changes ----------

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function updateSettings({ interval, dryRun, boardSize }) {
  if (interval !== undefined) {
    if (!INTERVALS.includes(Number(interval))) throw httpError(400, `Interval must be one of ${INTERVALS.join(", ")}`);
    store.settings.interval = Number(interval);
  }
  if (boardSize !== undefined) {
    if (!BOARD_SIZES.includes(Number(boardSize))) throw httpError(400, `Board size must be one of ${BOARD_SIZES.join(", ")}`);
    store.settings.boardSize = Number(boardSize);
    // A smaller board takes effect at once (it's ranked best first); a bigger one fills on the next update
    if (store.board.length > store.settings.boardSize) {
      store.board = store.board.slice(0, store.settings.boardSize);
      broadcast("board", { board: store.board, stats: { ...store.stats, shown: store.board.length }, estimate: estimate() });
    }
  }
  if (dryRun !== undefined) store.settings.dryRun = Boolean(dryRun);
  save();
  broadcast("settings", store.settings);
  poke();
  return store.settings;
}

/** Run a scan now, even while paused. */
function scanNow() {
  if (engine.state === "scanning" || engine.state === "analyzing") return false;
  forced = true;
  poke();
  return true;
}

function setScanCheck(check) {
  scanInProgress = check;
}

module.exports = { connect, snapshot, updateSettings, scanNow, setScanCheck, poke, tickersIn };
