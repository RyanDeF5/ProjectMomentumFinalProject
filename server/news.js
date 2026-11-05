// News retrieval for Legend (the "R" in RAG): gathers recent stories about a stock from Yahoo
// Finance and Google News, ranks them by relevance and recency, drops duplicates, and fetches short
// summaries for the top stories so Legend can weigh what the news actually says.

const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const SOURCES = (process.env.NEWS_SOURCES || "yahoo,google").split(",").map((s) => s.trim().toLowerCase());
const MAX_AGE_DAYS = Number(process.env.NEWS_MAX_AGE_DAYS) || 7;
const MAX_ITEMS = 8;
const ENRICH_COUNT = 5; // stories that get a summary fetched from the article page
const CACHE_MS = 5 * 60_000;
const TEST_TICKERS = new Set(["STCK", "TEST"]);
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Alpha9Legends/1.0";

const cache = new Map();

// Publisher websites, for the source icons shown while Legend reads (Yahoo only gives names)
const PUBLISHER_DOMAINS = {
  "yahoo finance": "finance.yahoo.com",
  reuters: "reuters.com",
  bloomberg: "bloomberg.com",
  "the wall street journal": "wsj.com",
  "wall street journal": "wsj.com",
  "barron's": "barrons.com",
  "investor's business daily": "investors.com",
  "motley fool": "fool.com",
  "the motley fool": "fool.com",
  zacks: "zacks.com",
  "simply wall st.": "simplywall.st",
  "insider monkey": "insidermonkey.com",
  benzinga: "benzinga.com",
  marketwatch: "marketwatch.com",
  thestreet: "thestreet.com",
  "gurufocus.com": "gurufocus.com",
  trefis: "trefis.com",
  stocktwits: "stocktwits.com",
  cnbc: "cnbc.com",
  "business insider": "businessinsider.com",
  forbes: "forbes.com",
  fortune: "fortune.com",
  investopedia: "investopedia.com",
  "seeking alpha": "seekingalpha.com",
  "associated press": "apnews.com",
  "associated press finance": "apnews.com",
  barchart: "barchart.com",
  "the new york times": "nytimes.com",
  "financial times": "ft.com",
  "the verge": "theverge.com",
  techcrunch: "techcrunch.com",
  "globe newswire": "globenewswire.com",
  globenewswire: "globenewswire.com",
  "pr newswire": "prnewswire.com",
  "business wire": "businesswire.com",
  "accesswire": "accesswire.com",
  "tipranks": "tipranks.com",
  "investing.com": "investing.com",
  "fx empire": "fxempire.com",
  "quartz": "qz.com",
};

/** Best guess at a publisher's website, from a known list or a name that is itself a domain. */
function publisherDomain(name) {
  const key = String(name || "").trim().toLowerCase();
  if (PUBLISHER_DOMAINS[key]) return PUBLISHER_DOMAINS[key];
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(key)) return key.replace(/^www\./, "");
  return null;
}

// Quote pages and price tickers that aren't news
const JUNK_TITLE = /stock price,? news|quote (?:&|and) history|stock quote|price today|live price|last trades at/i;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", hellip: "…" };
function decodeEntities(text) {
  return String(text || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

const stripTags = (html) => decodeEntities(String(html || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** "Apple Inc." -> "Apple", "NVIDIA Corporation" -> "NVIDIA" */
function shortCompanyName(name) {
  return String(name || "")
    .replace(/[,.]/g, " ")
    .replace(/\b(incorporated|inc|corporation|corp|company|co|ltd|limited|plc|holdings?|group|sa|nv|ag|class [a-z])\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fromYahoo(symbol) {
  const result = await yahooFinance.search(symbol, { newsCount: 20, quotesCount: 0 }, { validateResult: false });
  return (result.news || []).map((n) => ({
    id: `y-${n.uuid}`,
    title: decodeEntities(n.title),
    publisher: n.publisher || "Yahoo Finance",
    url: n.link,
    publishedAt: new Date(n.providerPublishTime).toISOString(),
    thumbnail: n.thumbnail?.resolutions?.find((r) => r.width >= 140 && r.width <= 400)?.url || n.thumbnail?.resolutions?.[0]?.url || null,
    relatedTickers: n.relatedTickers || [],
    domain: publisherDomain(n.publisher),
    source: "yahoo",
  }));
}

async function fromGoogle(symbol, company) {
  const terms = [`"${symbol}"`];
  if (company && company.toUpperCase() !== symbol) terms.push(`"${company}"`);
  const query = `${terms.join(" OR ")} stock when:${MAX_AGE_DAYS}d`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Google News returned ${res.status}`);
  const xml = await res.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 25);
  return items.map((match, i) => {
    const block = match[1];
    const tag = (name) => block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? "";
    const publisher = decodeEntities(tag("source")) || "Google News";
    const sourceUrl = block.match(/<source[^>]*url="([^"]+)"/)?.[1];
    let domain = publisherDomain(publisher);
    try {
      if (sourceUrl) domain = new URL(sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      // keep the name-based guess
    }
    // Google appends " - Publisher" to titles
    const title = decodeEntities(tag("title")).replace(new RegExp(`\\s+-\\s+${publisher.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "");
    return {
      id: `g-${i}-${title.slice(0, 40)}`,
      title,
      publisher,
      url: decodeEntities(tag("link")),
      publishedAt: new Date(tag("pubDate")).toISOString(),
      thumbnail: null,
      relatedTickers: [],
      domain,
      source: "google",
    };
  });
}

const words = (text) => new Set(text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2));
function similar(a, b) {
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return false;
  let shared = 0;
  wa.forEach((w) => wb.has(w) && shared++);
  return shared / Math.min(wa.size, wb.size) >= 0.6;
}

function rank(items, symbol, company, now) {
  const tickerWord = new RegExp(`(^|[^A-Z])\\$?${symbol.replace(/[.^]/g, "\\$&")}([^A-Z]|$)`);
  const companyWord = company ? new RegExp(`\\b${company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i") : null;
  return items
    .map((item) => {
      const ageHours = Math.max(0, (now - new Date(item.publishedAt).getTime()) / 3_600_000);
      let relevance = 0;
      if (tickerWord.test(item.title)) relevance += 3;
      if (companyWord?.test(item.title)) relevance += 3;
      if (item.relatedTickers[0] === symbol) relevance += 2;
      else if (item.relatedTickers.includes(symbol)) relevance += 1;
      if (item.source === "google") relevance += 1; // the query itself targets the stock
      const recency = Math.exp(-ageHours / 36);
      return { ...item, ageHours, relevance, rank: relevance + 4 * recency };
    })
    .filter((item) => Number.isFinite(item.ageHours) && item.ageHours <= MAX_AGE_DAYS * 24 && item.relevance >= 2)
    .filter((item) => !JUNK_TITLE.test(item.title))
    .sort((a, b) => b.rank - a.rank);
}

function dedupe(items) {
  const kept = [];
  for (const item of items) if (!kept.some((k) => similar(k.title, item.title))) kept.push(item);
  return kept;
}

/** Fetch a short summary (meta description, then the opening paragraphs) from an article page. */
async function summarize(item) {
  if (item.source !== "yahoo") return item; // Google News links are script redirects
  try {
    const res = await fetch(item.url, {
      signal: AbortSignal.timeout(4000),
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      redirect: "follow",
    });
    if (!res.ok) return item;
    const html = await res.text();
    const meta =
      html.match(/<meta[^>]+(?:property|name)="(?:og:description|description)"[^>]*content="([^"]*)"/i)?.[1] ||
      html.match(/<meta[^>]+content="([^"]*)"[^>]*(?:property|name)="(?:og:description|description)"/i)?.[1];
    const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => stripTags(m[1]))
      .filter((p) => p.length > 80 && !/cookie|subscribe|sign in|advertis/i.test(p))
      .slice(0, 3)
      .join(" ");
    const summary = stripTags(meta || "");
    const excerpt = paragraphs.slice(0, 700);
    return { ...item, summary: summary || undefined, excerpt: excerpt || undefined };
  } catch {
    return item;
  }
}

/**
 * Recent news for a stock, most relevant first. Resolves to
 * { items, fetchedAt, sources: { yahoo, google }, note? } and never throws.
 * `maxAgeMs` caps how old a cached result may be (watchlist updates ask for fresher news).
 */
async function getNews(symbol, companyName, { maxAgeMs = CACHE_MS } = {}) {
  const ticker = String(symbol || "").toUpperCase().trim();
  if (!ticker || TEST_TICKERS.has(ticker)) return { items: [], fetchedAt: new Date().toISOString(), sources: {}, note: "test ticker" };

  const cached = cache.get(ticker);
  if (cached && Date.now() - cached.at < Math.min(maxAgeMs, CACHE_MS)) return cached.value;

  const company = shortCompanyName(companyName);
  const sources = {};
  const batches = await Promise.all([
    SOURCES.includes("yahoo")
      ? fromYahoo(ticker).then((items) => ((sources.yahoo = items.length), items)).catch((err) => ((sources.yahoo = `error: ${err.message}`), []))
      : [],
    SOURCES.includes("google")
      ? fromGoogle(ticker, company).then((items) => ((sources.google = items.length), items)).catch((err) => ((sources.google = `error: ${err.message}`), []))
      : [],
  ]);

  const ranked = dedupe(rank(batches.flat(), ticker, company, Date.now())).slice(0, MAX_ITEMS);
  const enriched = await Promise.all(ranked.map((item, i) => (i < ENRICH_COUNT ? summarize(item) : item)));
  const items = enriched.map(({ rank: _rank, relevance, ageHours, relatedTickers: _t, ...item }) => ({
    ...item,
    relevance,
    ageHours: Math.round(ageHours * 10) / 10,
  }));

  const value = { items, fetchedAt: new Date().toISOString(), sources };
  cache.set(ticker, { at: Date.now(), value });
  return value;
}

module.exports = { getNews, shortCompanyName, similar, decodeEntities, stripTags, publisherDomain };
