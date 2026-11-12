const { waitForActivity } = require("./activity");
// Market news: the day's headlines, read by Legend.
//
// Each update (on the schedule, or by hand):
//   1. Sources: CNBC, MarketWatch, Seeking Alpha and Nasdaq feeds, Google News (business section
//      and market searches) and Yahoo Finance. Stories older than a day are dropped (three days when
//      the news is thin, e.g. at the weekend), and the same story from several outlets becomes one
//      story with its coverage counted. The hottest by recency, coverage and wording go to Legend
//      (the STORIES setting: 10 to 50).
//   2. Prices: one batched quote for the stocks named and the market's indexes (futures outside
//      market hours), so each story shows how its stocks are moving now.
//   3. Legend reads the stories a few at a time: real news or not, impact today, sentiment, which
//      stocks it is about and why it matters. Promos, clickbait, old news and off-topic stories are
//      left off the feed (and counted).
//   4. Legend writes a short briefing on the market from the stories it kept.
// The feed and progress stream to pages over server-sent events.

const fs = require("fs");
const path = require("path");
const YahooFinance = require("yahoo-finance2").default;
const { marketState } = require("./quotes");
const { similar, decodeEntities, stripTags, publisherDomain } = require("./news");
const { tickersIn } = require("./screener");
const legend = require("./legend");
const schedule = require("./schedule");
const { Progress } = require("./progress");

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const FILE = process.env.MARKET_NEWS_FILE || path.join(__dirname, "data", "market-news.json");
const INTERVALS = [0, 120, 300, 600, 900, 1800, 3600]; // seconds from one update's end to the next; 0 is off
const DEFAULT_INTERVAL = 600;
const STORY_COUNTS = [10, 20, 30, 50]; // stories Legend reads per update
const DEFAULT_STORY_COUNT = 20;
const BATCH = 5; // stories per Legend call
const MAX_AGE_HOURS = 24;
const THIN_AGE_HOURS = 72; // when there's too little news in the last day
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Alpha9Legends/1.0";
// The daily edition: the news is updated and the newsflash written with no page open, so it's ready
// the moment the app is first opened that day (see "Daily edition" below)
const EDITION_TIMES = [240, 300, 360, 420, 480, 540]; // minutes after midnight it may start: 4:00 to 9:00 AM
const DEFAULT_EDITION = { enabled: true, minute: 360 };
const DEFAULT_TOKENS_PER_STORY = 450;
const DEFAULT_TOKENS_PER_BRIEFING = 1800;
const PHASES = [
  { key: "gather", label: "SOURCES" },
  { key: "price", label: "PRICES" },
  { key: "read", label: "LEGEND" },
  { key: "brief", label: "BRIEFING" },
  { key: "stories", label: "STORY BRIEFS" },
];
const DEFAULT_TIMING = { gather: 5000, price: 1500, read: 9000, brief: 7000, stories: 9000 };
const VERDICT_KEEP_MS = 48 * 3600_000; // Legend's read of a story is remembered this long, on the feed or off it

const GOOGLE = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:1d`)}&hl=en-US&gl=US&ceid=US:en`;
const FEEDS = [
  { id: "cnbc", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", publisher: "CNBC", domain: "cnbc.com" },
  { id: "cnbc", url: "https://www.cnbc.com/id/15839069/device/rss/rss.html", publisher: "CNBC", domain: "cnbc.com" },
  { id: "cnbc", url: "https://www.cnbc.com/id/10000664/device/rss/rss.html", publisher: "CNBC", domain: "cnbc.com" },
  { id: "cnbc", url: "https://www.cnbc.com/id/15839135/device/rss/rss.html", publisher: "CNBC", domain: "cnbc.com" },
  { id: "marketwatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", publisher: "MarketWatch", domain: "marketwatch.com" },
  { id: "marketwatch", url: "https://feeds.content.dowjones.io/public/rss/mw_bulletins", publisher: "MarketWatch", domain: "marketwatch.com" },
  { id: "seekingalpha", url: "https://seekingalpha.com/market_currents.xml", publisher: "Seeking Alpha", domain: "seekingalpha.com" },
  { id: "nasdaq", url: "https://www.nasdaq.com/feed/rssoutbound?category=Markets", publisher: "Nasdaq", domain: "nasdaq.com" },
  { id: "google", google: true, url: "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en" },
  ...[
    "stock market today",
    "stocks making the biggest moves",
    "premarket movers stocks",
    "after hours movers stocks",
    "shares surge after",
    "shares plunge after",
    "FDA approval shares",
    "merger acquisition deal shares",
  ].map((q) => ({ id: "google", google: true, url: GOOGLE(q) })),
];
const YAHOO_QUERIES = ["stock market", "stocks moving"];

// The market's own moves: indexes in market hours, futures around them, plus the usual gauges
const OPEN_PULSE = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "NASDAQ" },
  { symbol: "^DJI", label: "DOW" },
  { symbol: "^RUT", label: "RUSSELL 2K" },
];
const FUTURES_PULSE = [
  { symbol: "ES=F", label: "S&P FUT" },
  { symbol: "NQ=F", label: "NASDAQ FUT" },
  { symbol: "YM=F", label: "DOW FUT" },
  { symbol: "RTY=F", label: "RUSSELL FUT" },
];
const GAUGES = [
  { symbol: "^VIX", label: "VIX" },
  { symbol: "^TNX", label: "10Y YIELD", yield: true },
  { symbol: "CL=F", label: "OIL" },
  { symbol: "GC=F", label: "GOLD" },
  { symbol: "BTC-USD", label: "BITCOIN" },
];

// Not news: quote pages, price predictions, horoscope-style "should you buy" filler
const JUNK_TITLE = /stock price,? news|quote (?:&|and) history|price prediction|price today|live price|\bhoroscope\b|^\s*(?:watch|video|podcast)\s*:/i;
const MOVE_WORDS = /\b(?:surge|soar|jump|plunge|tumble|sink|slump|rall(?:y|ies)|crash|spike|skyrocket|record|beat|miss|approv|acquir|buyout|merger|halt|offering|bankrupt|guidance|downgrade|upgrade)/i;
const MACRO_WORDS = /\b(?:fed|powell|inflation|cpi|ppi|jobs report|payrolls|rate cut|rate hike|interest rates|tariff|treasury|recession|gdp|opec)\b/i;
const IMPACT_POINTS = { high: 6, medium: 3, low: 1, none: 0 };

let store = load();
const clients = new Set();
// An edition's update runs with nobody connected
let unattended = false;
const waitForApp = () => waitForActivity(() => clients.size > 0 || schedule.background() || unattended);
const progress = new Progress(PHASES, store.timing);
let engine = { state: "offline", step: null, nextAt: null, progress: null, reason: null };
let running = false;
let forced = false;
let wakeUp = null;
let scanInProgress = () => false;
let updating = false; // an update is under way (it may be waiting for the app before it shows a step)

function load() {
  const base = {
    version: 1,
    settings: { interval: DEFAULT_INTERVAL, dryRun: false, storyCount: DEFAULT_STORY_COUNT, edition: { ...DEFAULT_EDITION } },
    stories: [],
    briefing: null,
    pulse: [],
    stats: null,
    timing: { ...DEFAULT_TIMING },
    tokensPerStory: null,
    tokensPerBriefing: null,
    reads: {},
    verdicts: {},
  };
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (parsed && Array.isArray(parsed.stories)) {
      return { ...base, ...parsed, settings: { ...base.settings, ...parsed.settings, edition: { ...DEFAULT_EDITION, ...parsed.settings?.edition } }, timing: { ...DEFAULT_TIMING, ...parsed.timing }, reads: parsed.reads || {}, verdicts: parsed.verdicts || {} };
    }
  } catch (err) {
    if (err.code !== "ENOENT") console.error("Market news file unreadable, starting fresh:", err.message);
  }
  return base;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const temp = `${FILE}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(store));
    fs.renameSync(temp, FILE);
  } catch (err) {
    console.error("Could not save the market news:", err.message);
  }
}

// ---------- Event stream ----------

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
function broadcast(event, data) {
  for (const res of clients) send(res, event, data);
}

/** What one update costs, for the page's estimate. */
function estimate() {
  const t = store.timing;
  return {
    tokensPerStory: store.tokensPerStory || DEFAULT_TOKENS_PER_STORY,
    tokensPerBriefing: store.tokensPerBriefing || DEFAULT_TOKENS_PER_BRIEFING,
    measured: Boolean(store.tokensPerStory),
    batch: BATCH,
    batchMs: t.read,
    baseMs: t.gather + t.price,
    briefMs: t.brief,
    // What whole updates have really spent and taken, now that only new stories are read
    tokensPerUpdate: store.tokensPerUpdate ?? null,
    updateMs: store.updateMs ?? null,
  };
}

// The other outlets' headlines stay on the server; they're only for Legend's story briefs
const forPage = ({ notes, feedTickers, heat, ...story }) => ({ ...story, briefed: Boolean(store.reads[story.id]) });

function feedPayload() {
  return { stories: store.stories.map(forPage), briefing: store.briefing, pulse: store.pulse, stats: store.stats, estimate: estimate() };
}

function snapshot() {
  return { ...feedPayload(), settings: store.settings, engine, intervals: INTERVALS, storyCounts: STORY_COUNTS, now: Date.now() };
}

function setEngine(state, extra = {}) {
  engine = { state, step: null, nextAt: null, progress: null, reason: null, ...extra };
  broadcast("engine", { ...engine, now: Date.now() });
}

function newsStep(state, step, key, unit = 0) {
  setEngine(state, { step, progress: progress.step(key, unit) });
}

/** GET /market-news/stream */
function connect(req, res) {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  res.write("retry: 3000\n\n");
  send(res, "snapshot", snapshot());
  clients.add(res);
  seen();
  const ping = setInterval(() => {
    send(res, "ping", Date.now());
    seen();
  }, 15_000);
  req.on("close", () => {
    clearInterval(ping);
    clients.delete(res);
    seen(true);
    if (wakeUp) wakeUp();
  });
  poke();
}

// When the app was last open (a page holds this stream only while it's in front). The daily edition
// covers the news since then, and stops refreshing once the app has been opened for the day.
const SEEN_SAVE_MS = 5 * 60_000;
let seenSavedAt = 0;
function seen(leaving = false) {
  const now = Date.now();
  store.lastSeenAt = now;
  if (leaving || now - seenSavedAt > SEEN_SAVE_MS) {
    seenSavedAt = now;
    save();
  }
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

// Updates run while someone has the site open (or always, if the schedule says to keep running)
async function loop() {
  if (running) return;
  running = true;
  try {
    // An UPDATE NOW runs even with nobody connected
    while (clients.size || schedule.background() || forced) {
      const interval = store.settings.interval * 1000;
      if (!interval && !forced) {
        setEngine("paused");
        await sleep(60_000);
        continue;
      }
      if (!forced) {
        const blocked = schedule.gate("news");
        if (blocked) {
          setEngine(blocked.state, { nextAt: blocked.resumeAt, reason: blocked.reason });
          await sleep(blocked.wait);
          continue;
        }
      }
      const due = forced ? 0 : (store.stats?.finishedAt || 0) + interval;
      if (due > Date.now()) {
        setEngine("idle", { nextAt: due });
        await sleep(Math.min(due - Date.now(), 60_000));
        continue;
      }
      forced = false;
      await update();
    }
  } finally {
    running = false;
    engine = { state: "offline", step: null, nextAt: null, progress: null, reason: null };
  }
}

// ---------- Sources ----------

const tagOf = (block, name) => block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? "";

async function fromFeed(feed) {
  const res = await fetch(feed.url, { signal: AbortSignal.timeout(7000), headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml, text/xml" } });
  if (!res.ok) throw new Error(`${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)].slice(0, 40).map((m) => {
    const block = m[1];
    let publisher = feed.publisher;
    let domain = feed.domain;
    let title = stripTags(tagOf(block, "title"));
    if (feed.google) {
      publisher = decodeEntities(tagOf(block, "source")).trim() || "Google News";
      const sourceUrl = block.match(/<source[^>]*url="([^"]+)"/)?.[1];
      domain = publisherDomain(publisher);
      try {
        if (sourceUrl) domain = new URL(sourceUrl).hostname.replace(/^www\./, "");
      } catch {
        // keep the name-based guess
      }
      title = title.replace(/\s+-\s+[^-]+$/, "");
    }
    const creator = stripTags(tagOf(block, "dc:creator"));
    // Nasdaq republishes other outlets' stories and tags their tickers
    if (feed.id === "nasdaq" && creator && !/nasdaq/i.test(creator)) publisher = `${creator} via Nasdaq`;
    const tagged = stripTags(tagOf(block, "nasdaq:tickers"))
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    return {
      title,
      url: decodeEntities(tagOf(block, "link")).trim(),
      publisher,
      domain,
      publishedAt: Date.parse(tagOf(block, "pubDate")),
      summary: feed.google ? "" : stripTags(tagOf(block, "description")).slice(0, 400),
      tickers: [...new Set(tagged)],
      source: feed.id,
    };
  });
}

async function fromYahoo(query) {
  const r = await yahooFinance.search(query, { newsCount: 20, quotesCount: 0 }, { validateResult: false });
  return (r.news || []).map((n) => ({
    title: decodeEntities(n.title),
    url: n.link,
    publisher: n.publisher || "Yahoo Finance",
    domain: publisherDomain(n.publisher) || "finance.yahoo.com",
    publishedAt: new Date(n.providerPublishTime).getTime(),
    summary: "",
    // Yahoo's related tickers can be long lists; only the first few are the story's subject
    tickers: (n.relatedTickers || []).slice(0, 1).filter((t) => /^[A-Z][A-Z.\-]{0,5}$/.test(t)),
    source: "yahoo",
  }));
}

/** Every story from every source, with how many each source gave (or its error). */
async function gather() {
  const sources = {};
  const tally = (id, n) => (sources[id] = (typeof sources[id] === "number" ? sources[id] : 0) + n);
  const batches = await Promise.all([
    ...FEEDS.map((f) =>
      fromFeed(f)
        .then((items) => (tally(f.id, items.length), items))
        .catch((err) => {
          if (typeof sources[f.id] !== "number") sources[f.id] = `error: ${err.message}`;
          return [];
        }),
    ),
    ...YAHOO_QUERIES.map((q) =>
      fromYahoo(q)
        .then((items) => (tally("yahoo", items.length), items))
        .catch((err) => {
          if (typeof sources.yahoo !== "number") sources.yahoo = `error: ${err.message}`;
          return [];
        }),
    ),
  ]);
  return { items: batches.flat(), sources };
}

function hash(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `n${(h >>> 0).toString(36)}`;
}

/**
 * One story per event: the same news from several outlets is merged, its coverage counted.
 * The story shown is the newest version that has a description and a direct link.
 */
function cluster(items, now) {
  const recent = (maxHours) =>
    items.filter((i) => Number.isFinite(i.publishedAt) && i.title.length > 15 && !JUNK_TITLE.test(i.title) && now - i.publishedAt <= maxHours * 3600_000 && i.publishedAt <= now + 600_000);
  let pool = recent(MAX_AGE_HOURS);
  if (pool.length < 40) pool = recent(THIN_AGE_HOURS);
  pool.sort((a, b) => b.publishedAt - a.publishedAt);

  const clusters = [];
  for (const item of pool) {
    const match = clusters.find((c) => similar(c.title, item.title));
    if (!match) {
      clusters.push({ title: item.title, items: [item] });
    } else {
      match.items.push(item);
    }
  }
  return clusters.map((c) => {
    const rep = c.items.find((i) => i.source !== "google" && i.summary) || c.items.find((i) => i.source !== "google") || c.items[0];
    const outlets = [...new Set(c.items.map((i) => i.publisher))];
    // One link per outlet (the story's own first), for the reader's ALSO REPORTED BY list
    const links = [];
    for (const i of [rep, ...c.items]) {
      if (links.length < 6 && !links.some((l) => l.publisher === i.publisher)) links.push({ publisher: i.publisher, url: i.url, domain: i.domain || null });
    }
    // What the other outlets said, for Legend's brief when the article itself can't be opened
    const notes = [...new Set(c.items.filter((i) => i !== rep).flatMap((i) => [i.title, i.summary]).filter((t) => t && t !== rep.title))].slice(0, 6).map((t) => t.slice(0, 300));
    const tickers = new Set([...tickersIn(rep.title)]);
    c.items.forEach((i) => i.tickers.forEach((t) => tickers.add(t)));
    const ageHours = Math.max(0, (now - rep.publishedAt) / 3600_000);
    const heat = 5 * Math.exp(-ageHours / 8) + 1.3 * Math.min(4, outlets.length - 1) + (tickers.size ? 1 : 0) + (MOVE_WORDS.test(rep.title) ? 1.5 : 0) + (MACRO_WORDS.test(rep.title) ? 1 : 0);
    return {
      id: hash(rep.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()),
      title: rep.title,
      url: rep.url,
      publisher: rep.publisher,
      domain: rep.domain || null,
      publishedAt: new Date(rep.publishedAt).toISOString(),
      ageHours,
      summary: rep.summary || c.items.find((i) => i.summary)?.summary || "",
      coverage: outlets.length,
      outlets: outlets.slice(0, 6),
      links,
      notes,
      feedTickers: [...tickers].slice(0, 6),
      heat,
    };
  });
}

// ---------- Prices ----------

/** The move that matters now: pre-market before the open, the day's move otherwise (plus after hours). */
function moveOf(q, state) {
  const pre = state === "PRE-MARKET" && Number.isFinite(q.preMarketChangePercent);
  const move = pre
    ? { price: q.preMarketPrice, change: q.preMarketChangePercent, session: "PRE" }
    : { price: q.regularMarketPrice, change: q.regularMarketChangePercent, session: "DAY" };
  const after = (state === "AFTER HOURS" || state === "MARKET CLOSED") && Number.isFinite(q.postMarketChangePercent) && Math.abs(q.postMarketChangePercent) >= 0.05;
  return { ...move, after: after ? Math.round(q.postMarketChangePercent * 100) / 100 : null };
}

async function quotes(symbols) {
  const out = new Map();
  const list = [...new Set(symbols)];
  for (let i = 0; i < list.length; i += 50) {
    try {
      await waitForApp();
      const batch = await yahooFinance.quote(list.slice(i, i + 50), {}, { validateResult: false });
      for (const q of Array.isArray(batch) ? batch : [batch]) if (q?.symbol) out.set(q.symbol, q);
    } catch (err) {
      console.error("Market news: quote batch failed:", err.message);
    }
  }
  return out;
}

const stockQuote = (q) => q && ["EQUITY", "ETF"].includes(q.quoteType) && q.market === "us_market" && Number.isFinite(q.regularMarketPrice);

function tickerInfo(symbol, q, state) {
  const m = moveOf(q, state);
  return { symbol, name: q.shortName || q.longName || symbol, price: m.price, change: Number.isFinite(m.change) ? Math.round(m.change * 100) / 100 : null, session: m.session, after: m.after };
}

function pulseFrom(map, state) {
  const list = [...(state === "MARKET OPEN" ? OPEN_PULSE : FUTURES_PULSE), ...GAUGES];
  return list
    .map((p) => {
      const q = map.get(p.symbol);
      if (!q || !Number.isFinite(q.regularMarketPrice)) return null;
      return { symbol: p.symbol, label: p.label, price: q.regularMarketPrice, change: Math.round((q.regularMarketChangePercent || 0) * 100) / 100, yield: Boolean(p.yield) };
    })
    .filter(Boolean);
}

// ---------- One update ----------

const isKept = (s) => s.ai && (s.ai.quality === "solid" || s.ai.quality === "speculative") && s.ai.impact !== "none";

/** How hot a story is now: Legend's impact first, then how new, how widely covered and how far its stocks moved. */
function hotness(s, now) {
  const ageHours = Math.max(0, (now - Date.parse(s.publishedAt)) / 3600_000);
  const move = Math.max(0, ...s.tickers.map((t) => Math.abs(t.change || 0)));
  return (
    (s.ai ? IMPACT_POINTS[s.ai.impact] ?? 0 : 0) +
    4 * Math.exp(-ageHours / 8) +
    1.2 * Math.min(4, s.coverage - 1) +
    Math.min(3, move / 5) -
    (s.ai?.quality === "speculative" ? 1 : 0)
  );
}

async function waitForScans() {
  if (!scanInProgress()) return;
  const held = progress.hold();
  while (scanInProgress()) {
    setEngine("waiting", { step: "WAITING FOR YOUR SCAN", progress: held });
    await sleep(1000);
  }
}

// One update at a time: a second caller (the loop and the daily edition can both ask) joins the one running
let updateJob = null;
function update() {
  if (!updateJob) {
    updating = true;
    updateJob = runUpdate().finally(() => {
      updating = false;
      updateJob = null;
    });
  }
  return updateJob;
}

async function runUpdate() {
  const started = Date.now();
  // A reset during the update abandons it (its results would bring back what was cleared)
  const gen = generation;
  const live = () => {
    if (gen !== generation) throw Object.assign(new Error("Reset"), { reset: true });
  };
  const state = marketState();
  const count = store.settings.storyCount;
  const dry = store.settings.dryRun;
  progress.start();
  progress.plan("read", Math.ceil(count / BATCH));
  try {
    await waitForApp();
    newsStep("gathering", "CHECKING THE NEWS SOURCES", "gather");
    const { items, sources } = await gather();
    live();
    const clustered = cluster(items, Date.now());
    clustered.sort((a, b) => b.heat - a.heat);
    const top = clustered.slice(0, count);

    // Legend's earlier reads: from the last update, or remembered from one before (a story can drop
    // out of the top and come back). Only stories without one are read in this update.
    const now0 = Date.now();
    for (const [id, v] of Object.entries(store.verdicts)) if (now0 - v.readAt > VERDICT_KEEP_MS) delete store.verdicts[id];
    const previous = new Map(store.stories.map((s) => [s.id, s]));
    const earlier = (id) => store.verdicts[id] || (previous.get(id)?.ai ? previous.get(id) : null);
    progress.plan("read", Math.ceil(top.filter((s) => !earlier(s.id)).length / BATCH));

    await waitForApp();
    newsStep("gathering", `PRICING THE STOCKS IN ${top.length} STORIES`, "price");
    const pulseSymbols = [...OPEN_PULSE, ...FUTURES_PULSE, ...GAUGES].map((p) => p.symbol);
    const quoted = await quotes([...pulseSymbols, ...top.flatMap((s) => [...s.feedTickers, ...(earlier(s.id)?.ai?.tickers || [])])]);
    live();
    store.pulse = pulseFrom(quoted, state);

    const stories = top.map((s) => {
      const before = earlier(s.id);
      const out = { ...s, tickers: [], ai: before?.ai || null, readAt: before?.readAt || null, firstSeen: before?.firstSeen || previous.get(s.id)?.firstSeen || Date.now() };
      out.tickers = tickersFor(out, quoted, state);
      return out;
    });

    const publish = (final, readNow) => {
      const now = Date.now();
      for (const s of stories) s.hot = Math.round(hotness(s, now) * 100) / 100;
      store.stories = [...stories].sort((a, b) => b.hot - a.hot);
      const read = stories.filter((s) => s.ai);
      const hidden = { promo: 0, stale: 0, offtopic: 0, minor: 0 };
      for (const s of read) {
        if (isKept(s)) continue;
        if (s.ai.quality === "promo") hidden.promo++;
        else if (s.ai.quality === "stale") hidden.stale++;
        else if (s.ai.quality === "offtopic") hidden.offtopic++;
        else hidden.minor++;
      }
      store.stats = {
        reused: stories.length - unread.length,
        briefed: stories.filter((s) => isKept(s) && store.reads[s.id]).length,
        startedAt: started,
        finishedAt: final ? now : store.stats?.finishedAt || 0,
        lastStartedAt: final ? started : store.stats?.lastStartedAt || 0,
        gathered: items.length,
        clustered: clustered.length,
        read: read.length,
        readNow,
        kept: read.filter(isKept).length,
        hidden,
        sources,
        storyCount: count,
        session: state,
        error: null,
      };
      if (final) {
        // Briefs are kept as long as Legend's read of the story is
        const ids = new Set([...stories.map((s) => s.id), ...Object.keys(store.verdicts)]);
        for (const id of Object.keys(store.reads)) if (!ids.has(id)) delete store.reads[id];
        save();
      }
      broadcast("feed", feedPayload());
    };
    const unread = stories.filter((s) => !s.ai);
    publish(false, 0);

    // Legend reads only the new stories, hottest first, a few per call
    let readNow = 0;
    let spentNow = 0;
    const batches = [];
    for (let i = 0; i < unread.length; i += BATCH) batches.push(unread.slice(i, i + BATCH));
    for (const [b, batch] of batches.entries()) {
      await waitForApp();
      await waitForScans();
      await waitForApp();
      live();
      newsStep("reading", `LEGEND IS READING NEW ${batch.length === 1 ? `STORY ${b * BATCH + 1}` : `STORIES ${b * BATCH + 1}-${b * BATCH + batch.length}`} OF ${unread.length}`, "read", b);
      try {
        // Each story goes with the stocks the feed tagged, as verified listings with their move now
        const asked = batch.map((s) => ({
          ...s,
          stocks: s.tickers.map((t) => `${t.symbol} ${t.name}${Number.isFinite(t.change) ? ` ${t.change >= 0 ? "+" : ""}${t.change.toFixed(1)}%` : ""}`),
        }));
        const reply = dry ? legend.exampleNews(asked.map((s) => ({ ...s, tickers: s.tickers.map((t) => t.symbol) }))) : await legend.readNews(asked, state);
        if (dry) progress.hold();
        else {
          const spent = Number(reply.tokens?.total);
          if (spent > 0) spentNow += spent;
          if (spent > 0) {
            const perStory = spent / batch.length;
            store.tokensPerStory = Math.round(store.tokensPerStory ? store.tokensPerStory * 0.8 + perStory * 0.2 : perStory);
          }
        }
        live();
        // Stocks Legend named that the feed didn't tag get priced too
        const named = reply.verdicts.flatMap((v) => v?.tickers || []).filter((t) => !quoted.has(t));
        if (named.length) for (const [k, v] of await quotes(named)) quoted.set(k, v);
        batch.forEach((s, i) => {
          const verdict = reply.verdicts[i];
          if (!verdict) return;
          s.ai = verdict;
          s.readAt = Date.now();
          store.verdicts[s.id] = { ai: verdict, readAt: s.readAt, firstSeen: s.firstSeen };
          s.tickers = tickersFor(s, quoted, state);
          readNow++;
        });
        publish(false, readNow);
      } catch (err) {
        if (err.reset) throw err;
        progress.hold();
        console.error(`Market news: Legend failed on batch ${b + 1}:`, err.message);
        if (/LM Studio|fetch failed|ECONNREFUSED|timeout/i.test(err.message)) break;
      }
    }

    // The briefing, from the stories Legend kept: written again only when a new story has joined the
    // ones it's written from, or the market session changed
    const kept = [...stories].filter(isKept).sort((a, b) => b.hot - a.hot);
    const briefIds = kept.slice(0, 15).map((s) => s.id);
    const written = new Set(store.briefing?.ids || []);
    const briefingDue = !store.briefing || store.briefing.session !== state || briefIds.some((id) => !written.has(id));
    if (kept.length && briefingDue) {
      await waitForApp();
      await waitForScans();
      await waitForApp();
      live();
      newsStep("reading", "LEGEND IS WRITING THE BRIEFING", "brief");
      try {
        const briefing = dry ? legend.exampleBriefing() : await legend.briefNews(kept.slice(0, 15), store.pulse, state);
        if (dry) progress.hold();
        else {
          const spent = Number(briefing.tokens?.total);
          if (spent > 0) spentNow += spent;
          if (spent > 0) store.tokensPerBriefing = Math.round(store.tokensPerBriefing ? store.tokensPerBriefing * 0.8 + spent * 0.2 : spent);
        }
        live();
        store.briefing = { ...briefing, at: Date.now(), session: state, ids: briefIds };
      } catch (err) {
        if (err.reset) throw err;
        progress.hold();
        console.error("Market news: briefing failed:", err.message);
      }
    }

    // Every story on the page gets its reader's brief written ahead of time (hottest first), so
    // opening one is instant; stories that already have one keep it
    const unbriefed = kept.filter((s) => !store.reads[s.id]);
    progress.plan("stories", unbriefed.length);
    publish(false, readNow);
    for (const [i, s] of unbriefed.entries()) {
      await waitForApp();
      await waitForScans();
      await waitForApp();
      live();
      newsStep("reading", `LEGEND IS WRITING STORY BRIEFS ${i + 1} OF ${unbriefed.length}`, "stories", i);
      try {
        const read = await storyRead(s.id);
        if (dry) progress.hold();
        else spentNow += Number(read?.tokens?.total) || 0;
      } catch (err) {
        progress.hold();
        if (err.status === 404) continue; // left the feed in a reset
        console.error(`Market news: brief failed for ${s.id}:`, err.message);
        if (/LM Studio|fetch failed|ECONNREFUSED|timeout/i.test(err.message)) break;
      }
    }

    live();
    progress.end();
    if (!dry) {
      const ema = (old, v) => Math.round(old == null ? v : old * 0.7 + v * 0.3);
      store.tokensPerUpdate = ema(store.tokensPerUpdate, spentNow);
      store.updateMs = ema(store.updateMs, Date.now() - started);
    }
    publish(true, readNow);
    console.log(`Market news: ${items.length} items, ${clustered.length} stories, ${readNow} new read (${stories.length - unread.length} kept from before), ${store.stats.kept} shown, ${unbriefed.length} briefs written, briefing ${briefingDue ? "rewritten" : "kept"}, ${spentNow} tokens in ${Math.round((Date.now() - started) / 1000)}s`);
  } catch (err) {
    progress.hold();
    if (err.reset) {
      console.log("Market news: update abandoned for a reset");
      return;
    }
    console.error("Market news update failed:", err.message);
    store.stats = { ...(store.stats || {}), finishedAt: Date.now(), error: err.message };
    save();
    broadcast("feed", feedPayload());
  }
}

/**
 * A story's stocks with their moves, priced only: once Legend has read it, the ones it picked (and
 * any written in the headline); before that, the ones the feed tagged.
 */
function tickersFor(s, quoted, state) {
  const wanted = s.ai ? [...s.ai.tickers, ...tickersIn(s.title)] : s.feedTickers;
  const out = [];
  for (const symbol of wanted) {
    if (out.length >= 4 || out.some((t) => t.symbol === symbol)) continue;
    const q = quoted.get(symbol);
    if (stockQuote(q)) out.push(tickerInfo(symbol, q, state));
  }
  return out;
}

// ---------- Story reader ----------
// Tapping a story opens it in the app: the server fetches the article, and Legend writes a brief
// of it (from the outlet's text when the page can be read, from the feed's headlines otherwise).

const ARTICLE_MAX_CHARS = 6000;
const ARTICLE_MIN_CHARS = 400; // less than this and the page was a paywall, a consent wall or a video
const BOILERPLATE = /cookie|subscribe|newsletter|sign up|sign in|log in|all rights reserved|advertis|terms of (?:use|service)|privacy policy|download the app|follow us|getty images|reporting by|editing by/i;
const readsInProgress = new Map();

function metaContent(html, name) {
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const t = tag[0];
    if (new RegExp(`(?:property|name)=["']${name}["']`, "i").test(t)) return decodeEntities(t.match(/content=["']([^"']*)["']/i)?.[1] || "").trim();
  }
  return "";
}

/** The article body in a page's structured data (most news sites publish it for search engines). */
function articleBodyIn(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 6) return "";
  if (Array.isArray(node)) {
    for (const n of node) {
      const body = articleBodyIn(n, depth + 1);
      if (body) return body;
    }
    return "";
  }
  if (typeof node.articleBody === "string" && node.articleBody.length > ARTICLE_MIN_CHARS) return node.articleBody;
  for (const value of Object.values(node)) {
    const body = articleBodyIn(value, depth + 1);
    if (body) return body;
  }
  return "";
}

/**
 * Google News links are redirects that need a script to follow; Google's own page hands back the
 * outlet's address for the article id. Resolves to the outlet's link, or the same link on failure.
 */
async function outletLink(url) {
  if (!/news\.google\.com\/rss\/articles\//.test(url || "")) return url;
  try {
    const id = new URL(url).pathname.split("/").pop();
    const headers = { "User-Agent": USER_AGENT };
    const page = await (await fetch(`https://news.google.com/rss/articles/${id}`, { headers, signal: AbortSignal.timeout(6000) })).text();
    const sig = page.match(/data-n-a-sg="([^"]+)"/)?.[1];
    const ts = page.match(/data-n-a-ts="([^"]+)"/)?.[1];
    if (!sig || !ts) return url;
    const req = [[["Fbv4je", JSON.stringify(["garturlreq", [["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1], "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0], id, Number(ts), sig]), null, "generic"]]];
    const res = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: `f.req=${encodeURIComponent(JSON.stringify(req))}`,
      signal: AbortSignal.timeout(6000),
    });
    const found = (await res.text()).match(/\[\\"garturlres\\",\\"(https?:[^\\"]+)\\"/)?.[1];
    return found || url;
  } catch {
    return url;
  }
}

/** The readable text of a news page and its lead image, or null if it can't be opened. */
async function fetchArticle(url) {
  if (!/^https?:\/\//.test(url || "") || /news\.google\.com/.test(url)) return null;
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(9000), headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" } });
    if (!res.ok || !/html/i.test(res.headers.get("content-type") || "")) return null;
    let html = (await res.text()).slice(0, 1_500_000);
    let image = metaContent(html, "og:image") || metaContent(html, "twitter:image");
    try {
      image = image ? new URL(image, res.url).href : "";
    } catch {
      image = "";
    }

    let body = "";
    for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        body = articleBodyIn(JSON.parse(m[1].trim()));
      } catch {
        // malformed structured data; try the next block
      }
      if (body) break;
    }
    body = stripTags(body);

    if (body.length < ARTICLE_MIN_CHARS) {
      html = html.replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|figure|button)\b[\s\S]*?<\/\1>/gi, " ");
      const scope = html.match(/<article\b[\s\S]*<\/article>/i)?.[0] || html;
      const seen = new Set();
      const paragraphs = [...scope.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
        .map((m) => stripTags(m[1]))
        .filter((p) => p.length >= 60 && !BOILERPLATE.test(p) && !seen.has(p) && seen.add(p));
      body = paragraphs.join("\n\n");
    }
    const description = metaContent(html, "og:description") || metaContent(html, "description");
    return { text: body.slice(0, ARTICLE_MAX_CHARS), description, image: /^https:\/\//.test(image) ? image : null, finalUrl: res.url };
  } catch {
    return null;
  }
}

async function readStory(story, again) {
  const cached = store.reads[story.id];
  if (cached && !again) return cached;

  const url = await outletLink(story.url);
  const article = await fetchArticle(url);
  const full = article && article.text.length >= ARTICLE_MIN_CHARS;
  const state = marketState();
  const stocks = story.tickers.map((t) => `${t.symbol} ${t.name}${Number.isFinite(t.change) ? ` ${t.change >= 0 ? "+" : ""}${t.change.toFixed(1)}%` : ""}`);
  const input = {
    title: story.title,
    publisher: story.publisher,
    ageHours: Math.max(0, (Date.now() - Date.parse(story.publishedAt)) / 3600_000),
    stocks,
    text: full ? article.text : [...new Set([article?.description, story.summary, ...(story.notes || [])].filter(Boolean))].join("\n"),
    basis: full ? "article" : "feed",
  };
  const reply = store.settings.dryRun ? legend.exampleStory(input) : await legend.readStory(input, state);
  const read = {
    ...reply,
    basis: input.basis,
    chars: full ? article.text.length : 0,
    image: article?.image || null,
    // Where READ ON <OUTLET> goes: the article itself, not Google's redirect
    url: article?.finalUrl || (url !== story.url ? url : story.url),
    at: Date.now(),
  };
  store.reads[story.id] = read;
  save();
  broadcast("feed", feedPayload());
  return read;
}

/** POST /market-news/story/:id/read: Legend's brief of a story, written once and kept. */
function storyRead(id, again = false) {
  const story = store.stories.find((s) => s.id === id);
  if (!story) return Promise.reject(httpError(404, "That story is no longer on the feed"));
  if (readsInProgress.has(id)) return readsInProgress.get(id);
  const job = readStory(story, again).finally(() => readsInProgress.delete(id));
  readsInProgress.set(id, job);
  return job;
}

// ---------- Newsflash ----------
// The first time the app is opened each day it greets the trader with the big news since they were
// last on (like the game's event banner). Only news worth it: high impact, or a confirmed (solid)
// medium-impact story. Nothing that big, no newsflash.

const FLASH_MAX_STORIES = 6;
const FLASH_MAX_BACK_MS = 72 * 3600_000; // a long weekend away
const FLASH_FALLBACK_MS = 24 * 3600_000; // no big news since the last visit: any from the last day
const FLASH_FRESH_MS = 45 * 60_000; // news older than this (and from before the visit) is updated first
const FLASH_STALE_MS = 3 * 3600_000; // news older than this is updated first whatever it covers: a newsflash isn't old news
const isBig = (s) => isKept(s) && (s.ai.impact === "high" || (s.ai.impact === "medium" && s.ai.quality === "solid"));
let flashJob = null;

function awayLabel(since, now) {
  const hours = Math.round((now - since) / 3600_000);
  const when = new Date(since).toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" });
  return `${when} (${hours < 1 ? "under an hour" : `${hours} hours`} ago)`;
}

function flashPayload(flash) {
  const byId = new Map(store.stories.map((s) => [s.id, s]));
  const stories = flash.order
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((s) => {
      const read = store.reads[s.id];
      // Legend's short brief, for the story's summary inside the pop-up (most are pre-written)
      const brief = read ? { summary: read.summary, points: read.points || [], stocks: read.stocks || [], context: read.context || "" } : null;
      return { ...forPage(s), image: read?.image || null, brief };
    });
  if (!stories.length) return null;
  const { ids: _ids, order: _order, window: _window, ...rest } = flash;
  return { ...rest, stories };
}

/**
 * GET /market-news/newsflash?since=<ms of the last visit>. Resolves to { status: "ready", flash },
 * { status: "none" } (nothing big), or { status: "pending" } while the news is brought up to date
 * (an update is started if one isn't running; ask again when it finishes).
 */
async function newsflash(sinceRaw) {
  const now = Date.now();
  let since = Number(sinceRaw);
  if (!Number.isFinite(since) || since <= 0 || since > now) since = now - FLASH_FALLBACK_MS;
  since = Math.max(since, now - FLASH_MAX_BACK_MS);

  // The news should cover the time away: from before the visit and over 45 minutes old, update first.
  // So should news over 3 hours old (the daily edition keeps it newer than that until the app is opened).
  const finished = store.stats?.finishedAt || 0;
  const busy = updating || ["gathering", "reading", "waiting"].includes(engine.state);
  if ((finished < since && now - finished > FLASH_FRESH_MS) || now - finished > FLASH_STALE_MS) {
    if (!busy) updateNow();
    return { status: "pending" };
  }

  // The newsflash written ahead of time (the daily edition): nothing has been read since it was
  // written and it's from after the last visit, so it is the answer. No recount, no wait.
  const ready = store.flash;
  if (ready && ready.at >= finished && ready.at >= since) {
    const payload = flashPayload(ready);
    if (payload) return { status: "ready", flash: { ...payload, since, window: ready.window || "recent" } };
  }

  const ageOf = (s) => now - Date.parse(s.publishedAt);
  const big = store.stories.filter(isBig).sort((a, b) => b.hot - a.hot);
  let pool = big.filter((s) => Date.parse(s.publishedAt) >= since);
  let window = "since";
  if (!pool.length) {
    pool = big.filter((s) => ageOf(s) <= FLASH_FALLBACK_MS);
    window = "recent";
  }
  if (!pool.length) return { status: "none" };
  const picked = pool.slice(0, FLASH_MAX_STORIES);
  const ids = picked.map((s) => s.id);

  // The same stories as the last newsflash: show that one again, no new tokens
  const last = store.flash;
  if (last && last.ids.length === ids.length && ids.every((id) => last.ids.includes(id))) {
    const payload = flashPayload(last);
    if (payload) {
      // Still the same stories after a later update: it stands as the newsflash for this news too
      if (last.at < finished) {
        last.at = now;
        last.window = window;
        save();
      }
      return { status: "ready", flash: { ...payload, since, window } };
    }
  }

  if (!flashJob) {
    flashJob = (async () => {
      const state = marketState();
      const asked = picked.map((s) => ({ ...s, ageHours: ageOf(s) / 3600_000 }));
      let written;
      try {
        written = store.settings.dryRun ? legend.exampleNewsflash(asked) : await legend.writeNewsflash(asked, awayLabel(since, now), state);
      } catch (err) {
        // Legend unreachable: the newsflash still shows, headed by the biggest story
        console.error("Newsflash: Legend failed:", err.message);
        written = { title: picked[0].title, summary: picked[0].ai.why, picks: picked.map((_, i) => i), model: null, tokens: null };
      }
      const flash = {
        title: written.title || picked[0].title,
        summary: written.summary || picked[0].ai.why,
        mood: store.briefing?.mood || null,
        ids,
        order: written.picks.map((i) => ids[i]),
        window,
        at: Date.now(),
        model: written.model,
        tokens: written.tokens || null,
      };
      if (written.model && written.model !== "dry-run") {
        store.flash = flash;
        save();
      }
      console.log(`Newsflash: "${flash.title}" from ${ids.length} stories${flash.tokens?.total ? `, ${flash.tokens.total} tokens` : ""}`);
      return flash;
    })().finally(() => {
      flashJob = null;
    });
  }
  const flash = await flashJob;
  const payload = flashPayload(flash);
  return payload ? { status: "ready", flash: { ...payload, since, window } } : { status: "none" };
}

// ---------- Daily edition ----------
// The newsflash should be waiting when the app is first opened each day, not start being made then.
// So from the edition's time each morning (6:00 AM unless changed), with no page open, the server
// updates the news and writes the newsflash, then keeps it current with another update every two
// hours until the app is opened or the evening session ends. A computer that was asleep at that time
// catches up as soon as it wakes. It runs even while the news job's own auto update is off; the
// pause-everything switch and the daily token limit still hold it.

const EDITION_REFRESH_MS = 2 * 3600_000;
const EDITION_LAST_MINUTE = 20 * 60; // no refreshes after 8:00 PM
const EDITION_RETRY_MS = 15 * 60_000; // after a failed attempt (Legend or the network down)
const EDITION_CHECK_MS = 60_000;
let editionRunning = false;

/** Whether an edition (the day's first, or a refresh) should run now. */
function editionDue(now = Date.now()) {
  const cfg = store.settings.edition;
  if (!cfg.enabled || editionRunning || clients.size) return false;
  const d = new Date(now);
  const minute = d.getHours() * 60 + d.getMinutes();
  if (minute < cfg.minute || minute >= EDITION_LAST_MINUTE) return false;
  const startAt = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() + cfg.minute * 60_000;
  // Opened since this morning's edition time: the day's newsflash has been seen
  if ((store.lastSeenAt || 0) >= startAt) return false;
  const blocked = schedule.gate("news", now);
  if (blocked && blocked.reason !== "OUTSIDE ITS SCHEDULE") return false;
  const ed = store.edition || {};
  if (ed.triedAt && (ed.at || 0) < ed.triedAt && now - ed.triedAt < EDITION_RETRY_MS) return false;
  if ((ed.at || 0) < startAt) return true;
  return now - ed.at >= EDITION_REFRESH_MS;
}

async function runEdition() {
  if (editionRunning) return;
  editionRunning = true;
  unattended = true;
  const started = Date.now();
  // The news since the app was last open; no page is open now, so that's the end of the last visit
  const since = store.lastSeenAt || null;
  const first = (store.edition?.at || 0) < new Date(new Date(started).setHours(0, 0, 0, 0)).getTime();
  store.edition = { ...(store.edition || {}), triedAt: started };
  try {
    console.log(`Daily edition: ${first ? "updating" : "refreshing"} the news with no page open`);
    await update();
    const stats = store.stats;
    if (!stats || stats.error || (stats.finishedAt || 0) < started) throw new Error(stats?.error || "the update didn't finish");
    const result = await newsflash(since);
    store.edition = { triedAt: started, at: Date.now(), status: result.status, title: result.status === "ready" ? result.flash.title : null, error: null };
    save();
    console.log(`Daily edition: ${result.status === "ready" ? `ready, "${result.flash.title}"` : result.status === "none" ? "no big news, no newsflash" : "the newsflash is still pending"}`);
  } catch (err) {
    store.edition = { ...(store.edition || {}), triedAt: started, error: err.message };
    save();
    console.error(`Daily edition failed (trying again in ${EDITION_RETRY_MS / 60_000} minutes):`, err.message);
  } finally {
    unattended = false;
    editionRunning = false;
    // The engine's last word was the update's; with nobody connected it goes back to offline
    if (!clients.size && !running) setEngine("offline");
  }
}

function checkEdition() {
  if (editionDue()) void runEdition();
}
// Checked every minute rather than timed to the hour, so a sleeping computer catches up on waking
setInterval(checkEdition, EDITION_CHECK_MS).unref();
setTimeout(checkEdition, 5000).unref();

// ---------- Changes ----------

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function updateSettings({ interval, dryRun, storyCount, edition }) {
  if (edition !== undefined) {
    const next = { ...store.settings.edition };
    if (edition?.enabled !== undefined) next.enabled = Boolean(edition.enabled);
    if (edition?.minute !== undefined) {
      if (!EDITION_TIMES.includes(Number(edition.minute))) throw httpError(400, `The edition time must be one of ${EDITION_TIMES.join(", ")}`);
      next.minute = Number(edition.minute);
    }
    store.settings.edition = next;
  }
  if (interval !== undefined) {
    if (!INTERVALS.includes(Number(interval))) throw httpError(400, `Interval must be one of ${INTERVALS.join(", ")}`);
    store.settings.interval = Number(interval);
  }
  if (storyCount !== undefined) {
    if (!STORY_COUNTS.includes(Number(storyCount))) throw httpError(400, `Story count must be one of ${STORY_COUNTS.join(", ")}`);
    store.settings.storyCount = Number(storyCount);
  }
  if (dryRun !== undefined) store.settings.dryRun = Boolean(dryRun);
  save();
  broadcast("settings", store.settings);
  poke();
  return store.settings;
}

// ---------- Reset (developer option) ----------

let generation = 0;

/** Start over: stories, Legend's reads, the briefing and every story brief are cleared, and a fresh update runs. */
function reset() {
  generation++;
  Object.assign(store, { stories: [], briefing: null, stats: null, reads: {}, verdicts: {}, flash: null });
  save();
  broadcast("feed", feedPayload());
  forced = true;
  poke();
  return true;
}

/** Update now, whatever the schedule says. */
function updateNow() {
  if (engine.state === "gathering" || engine.state === "reading") return false;
  forced = true;
  poke();
  return true;
}

function setScanCheck(check) {
  scanInProgress = check;
}

/** For the schedule screen. */
function scheduleInfo() {
  const ed = store.edition || {};
  return {
    interval: store.settings.interval,
    intervals: INTERVALS,
    storyCount: store.settings.storyCount,
    storyCounts: STORY_COUNTS,
    engine,
    estimate: estimate(),
    lastFinishedAt: store.stats?.finishedAt || 0,
    edition: { ...store.settings.edition, times: EDITION_TIMES, refreshMs: EDITION_REFRESH_MS, lastAt: ed.at || 0, status: ed.status || null, title: ed.title || null, error: ed.error || null, running: editionRunning },
  };
}

module.exports = { connect, snapshot, updateSettings, updateNow, setScanCheck, poke, scheduleInfo, storyRead, newsflash, reset, DEFAULT_INTERVAL, _test: { outletLink, fetchArticle, editionDue, runEdition, store: () => store } };
