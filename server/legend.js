// Legend: Alpha 9: Legends' AI analyst, served by a local LM Studio instance through its
// OpenAI-compatible API.
//
// How an analysis works:
//   1. Metrics are computed here (change %, relative volume, float turnover, dollar volume...).
//   2. A quantitative momentum score (0-1600) comes straight from those numbers (scoring.js).
//   3. Recent news is retrieved and ranked (news.js) and handed to the model as numbered sources.
//   4. The model judges only what it is good at, into a strict JSON schema: how strong the news
//      catalyst is, how serious the risks are, the rating, and the written read.
//   5. The final score = quant + catalyst bonus + risk penalty, so it stays anchored in the data.

const usage = require("./usage");
const { quantScore, finalScore, reconcileRating, suggestedRating, CATALYST_POINTS, RISK_POINTS } = require("./scoring");

const LEGEND_URL = (process.env.LEGEND_URL || "http://quasar:1234/v1").replace(/\/+$/, "");
const LEGEND_MODEL = process.env.LEGEND_MODEL || ""; // empty: use the model LM Studio has loaded
const TIMEOUT_MS = Number(process.env.LEGEND_TIMEOUT_MS) || 90_000;

const RATINGS = ["Overheating", "Strong", "Stable", "Weak", "Crashing"];
const CATALYSTS = Object.keys(CATALYST_POINTS);
const RISK_LEVELS = Object.keys(RISK_POINTS);
const SENTIMENTS = ["bullish", "bearish", "mixed", "neutral"];
const RISK_FLAGS = [
  "dilution",
  "offering",
  "reverse_split",
  "bankruptcy",
  "delisting",
  "legal",
  "halt",
  "earnings_miss",
  "downgrade",
  "short_report",
  "other",
];

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    rating: { type: "string", enum: RATINGS },
    catalyst: { type: "string", enum: CATALYSTS },
    riskLevel: { type: "string", enum: RISK_LEVELS },
    riskFlags: { type: "array", items: { type: "string", enum: RISK_FLAGS }, maxItems: 4 },
    newsSentiment: { type: "string", enum: [...SENTIMENTS, "none"] },
    keyNews: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          source: { type: "integer", minimum: 1 },
          sentiment: { type: "string", enum: SENTIMENTS },
          impact: { type: "string" },
        },
        required: ["source", "sentiment", "impact"],
        additionalProperties: false,
      },
    },
    headline: { type: "string" },
    newsRead: { type: "string" },
    conviction: { type: "string" },
    efficiency: { type: "string" },
    risks: { type: "string" },
  },
  required: ["rating", "catalyst", "riskLevel", "riskFlags", "newsSentiment", "keyNews", "headline", "newsRead", "conviction", "efficiency", "risks"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You are LEGEND, the momentum analyst inside Alpha 9: Legends, a day-trading screener.
You receive a stock's pre-computed metrics, a QUANT SCORE already calculated from those numbers, and
recent NEWS SOURCES about the stock. Your job is to judge the setup like a disciplined, skeptical
momentum trader. Most stocks are NOT good setups; say so plainly when that is the case.

What makes a strong day-trading momentum setup:
- A real gap up (roughly +10% or more) on heavy relative volume (5x+), a low float (under ~20M
  shares), a price in the ~$2-$20 range, and a fresh, specific news catalyst from the last 1-2 days.
- Large, heavily traded companies moving a percent or two are not momentum setups, whatever the news.

YOU DECIDE (the server turns these into points; you do not produce a score):
catalyst: how strong a fresh, stock-specific catalyst the news provides for a move TODAY
  none     - no news, stale news (older than ~3 days), or only market-wide / generic coverage
  weak     - minor or speculative stock-specific news, opinion pieces, price-recap articles
  moderate - real company news: partnership, contract, guidance update, analyst upgrade
  strong   - material news: earnings beat with raised guidance, big contract, FDA/regulatory win
  major    - transformational: buyout/merger, breakthrough approval, massive surprise
  Recaps of the price move ("stock jumps", "shares surge") are not catalysts.
riskLevel: how serious the EVENT risks in the news are
  none, minor, moderate, severe (e.g. share offering/dilution, going-concern doubts, major lawsuit),
  critical (bankruptcy, delisting notice, fraud allegations, trading halt).
  An offering or dilution announced in the news is at least severe: it caps any run.
  Every risk must be backed by a specific source [n]. Never infer an offering or dilution from a big
  float or low price, and do not penalize float, price or volume here: the quant score covers them.
riskFlags: tags for the risks you found in the sources (empty if none).
newsSentiment: overall tone of the sources; use "none" only when there are no sources at all.
keyNews: up to 4 sources that matter most, by their [number], each with a sentiment and a short impact
  line (at most 14 words) saying how it moves the thesis. Skip irrelevant sources.
rating: the direction/speed of the setup:
  Overheating (up too fast, chase risk), Strong (up and healthy), Stable (sideways),
  Weak (drifting down), Crashing (down fast). The suggested rating from price action is given; keep
  it unless the news clearly changes the picture, and never call a falling stock Strong.

WRITE (plain, direct sentences; no hype; no disclaimers; cite news as [n] when you rely on it).
Keep it tight: the reader is scanning quickly between trades.
- headline: one verdict, at most 10 words, no trailing period.
- newsRead: what the news means for the stock right now; at most 30 words.
- conviction: are buyers aggressive (volume behind the move) or is this a weak bounce? At most 28 words.
- efficiency: is price moving easily on its volume, or struggling? At most 28 words.
- risks: the main risks, including anything in the news; at most 28 words.

RULES: use only the data and sources given; if floatShares is 0 the float is unknown; tickers STCK
and TEST are test stocks with no real news.`;

// ---------- Screener mode ----------
// The stock screener sends Legend the day's movers that its scanner flagged, with the five
// momentum pillars already checked. Legend grades each as a day-trade setup on top of the normal
// read (same score, so screener and scan results compare).

const SETUP_GRADES = ["A+", "A", "B", "C", "F"];
const CATALYST_TYPES = [
  "fda_clinical",
  "earnings",
  "contract_partnership",
  "merger_acquisition",
  "product_launch",
  "analyst_action",
  "uplisting_index",
  "sector_sympathy",
  "financing_offering",
  "theme_hype",
  "no_news",
  "other",
];

const SCREENER_PROMPT = `${SYSTEM_PROMPT}

SCREENER MODE: this stock was surfaced by the STOCK SCREENER, which scans the market for the day's
movers. You are the final filter for a day trader who wants only the best setups. Be demanding:
an A+ is rare and the trader acts on it.

The five pillars of a day-trading momentum setup (the scanner has checked them; see SCREENER CHECKS):
  1. Price between $1 and $10 (to about $20 is acceptable)
  2. Float under 10 million shares (under 20 million is acceptable)
  3. Up at least 25% on the day (or in pre-market)
  4. Relative volume of 10x or more (5x can be acceptable early in the session)
  5. A fresh, specific news catalyst from the last day

Judge the CATALYST QUALITY, which the scanner cannot:
  Strongest: FDA approval or strong trial data, earnings beat with raised guidance, a big contract
  or partnership with a known company, a buyout/merger at a premium, uplisting to a major exchange.
  Weak: recaps of the move ("shares jump"), sector sympathy only, AI/crypto buzzwords with no
  numbers, vague press releases, old news.
RED FLAGS that should sink the grade: an offering, ATM, registered direct or warrants (dilution),
  a recent reverse split, going-concern or delisting notices, no news at all on a huge move
  (pump risk), an exhausted run (already up several hundred percent with fading volume).

ALSO DECIDE:
setupGrade: A+ (all five pillars, a strong fresh catalyst, no red flags), A (strong, one pillar a
  little short), B (tradeable with caution), C (weak or late), F (avoid).
catalystType: the kind of catalyst in the news (no_news if there is none).
whyNow: why it is moving today, at most 14 words.
tradePlan: what would confirm the setup and what would invalidate it, using the levels given
  (previous close, open, day high, day low); at most 24 words. No buy/sell instructions, no price
  targets: describe what to watch.`;

const SCREENER_SCHEMA = {
  ...RESPONSE_SCHEMA,
  properties: {
    ...RESPONSE_SCHEMA.properties,
    setupGrade: { type: "string", enum: SETUP_GRADES },
    catalystType: { type: "string", enum: CATALYST_TYPES },
    whyNow: { type: "string" },
    tradePlan: { type: "string" },
  },
  required: [...RESPONSE_SCHEMA.required, "setupGrade", "catalystType", "whyNow", "tradePlan"],
};

const round = (value, digits = 2) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : null);

/** Derive the metrics Legend reasons about from the raw quote. */
function buildMetrics(stock, marketState) {
  const price = Number(stock.currentPrice);
  const lastClose = Number(stock.lastClose);
  const volume = Number(stock.volume);
  const averageVolume = Number(stock.averageVolume);
  const float = Number(stock.float);
  return {
    ticker: String(stock.symbol || "").toUpperCase(),
    company: stock.fullName || "Unknown",
    marketSession: marketState || "unknown",
    price: round(price),
    previousClose: round(lastClose),
    changePercent: round(((price - lastClose) / lastClose) * 100, 1),
    volume: Number.isFinite(volume) ? volume : null,
    averageVolume3Month: Number.isFinite(averageVolume) ? averageVolume : null,
    relativeVolume: round(volume / averageVolume, 2),
    floatShares: Number.isFinite(float) && float > 0 ? float : 0,
    floatTurnoverPercent: Number.isFinite(float) && float > 0 ? round((volume / float) * 100, 1) : null,
    dollarVolume: round(price * volume, 0),
  };
}

function ageLabel(hours) {
  if (!Number.isFinite(hours)) return "unknown age";
  if (hours < 1) return "under 1 hour ago";
  if (hours < 48) return `${Math.round(hours)} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** Numbered news block for the prompt. */
function newsBlock(news) {
  if (!news.length) return "NEWS SOURCES: none found in the last 7 days.";
  const lines = news.map((item, i) => {
    const detail = [item.summary, item.excerpt].filter(Boolean).join(" ").slice(0, 600);
    return `[${i + 1}] ${item.title} (${item.publisher}, ${ageLabel(item.ageHours)})${detail ? `\n    ${detail}` : ""}`;
  });
  return `NEWS SOURCES (most relevant first):\n${lines.join("\n")}`;
}

let cachedModel = { id: "", at: 0 };

/** The model to use: LEGEND_MODEL, or whichever model LM Studio reports (cached for a minute). */
async function resolveModel() {
  if (LEGEND_MODEL) return LEGEND_MODEL;
  if (cachedModel.id && Date.now() - cachedModel.at < 60_000) return cachedModel.id;
  const res = await fetch(`${LEGEND_URL}/models`, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`LM Studio /models returned ${res.status}`);
  const body = await res.json();
  const id = body?.data?.find((m) => !/embed/i.test(m.id))?.id;
  if (!id) throw new Error("LM Studio has no model loaded");
  cachedModel = { id, at: Date.now() };
  return id;
}

/** Pull the JSON object out of a model reply, tolerating think blocks and code fences. */
function extractJson(text) {
  const cleaned = String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:json)?/gi, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Legend reply contained no JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

const pick = (value, allowed, fallback) => {
  const match = allowed.find((a) => a.toLowerCase() === String(value || "").toLowerCase());
  return match ?? fallback;
};
const text = (value) => String(value || "").trim();

/** Validate the model's judgment and turn it into the final analysis. */
function assemble(raw, metrics, quant, news) {
  const rating = reconcileRating(pick(raw.rating, RATINGS, suggestedRating(metrics)), metrics);
  const catalyst = news.length ? pick(raw.catalyst, CATALYSTS, "none") : "none";
  const riskLevel = pick(raw.riskLevel, RISK_LEVELS, "none");
  const { score, catalystPoints, riskPoints } = finalScore(quant, catalyst, riskLevel);

  const keyNews = (Array.isArray(raw.keyNews) ? raw.keyNews : [])
    .map((k) => ({ index: Number(k.source) - 1, sentiment: pick(k.sentiment, SENTIMENTS, "neutral"), impact: text(k.impact) }))
    .filter((k) => Number.isInteger(k.index) && news[k.index])
    .slice(0, 4)
    .map((k) => ({ id: news[k.index].id, sentiment: k.sentiment, impact: k.impact }));

  return {
    score,
    rating,
    headline: text(raw.headline).replace(/\.$/, ""),
    newsRead: text(raw.newsRead),
    conviction: text(raw.conviction),
    efficiency: text(raw.efficiency),
    risks: text(raw.risks),
    catalyst,
    riskLevel,
    riskFlags: (Array.isArray(raw.riskFlags) ? raw.riskFlags : []).filter((f) => RISK_FLAGS.includes(f)),
    newsSentiment: news.length ? pick(raw.newsSentiment, [...SENTIMENTS, "none"], "neutral") : "none",
    keyNews,
    breakdown: {
      components: quant.components,
      liquidity: quant.liquidity,
      quant: quant.total,
      catalyst: { level: catalyst, points: catalystPoints },
      risk: { level: riskLevel, points: riskPoints },
    },
  };
}

/** Send one request to LM Studio with a strict JSON schema; returns the parsed reply and token usage. */
async function callModel(model, system, user, schema, name, maxTokens = 1400) {
  const res = await fetch(`${LEGEND_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`LM Studio returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const body = await res.json();
  const content = body?.choices?.[0]?.message?.content;
  // Tokens are spent even if the reply turns out unusable, so count them first
  const tokens = usage.record(body?.usage);
  return { raw: extractJson(content), tokens };
}

function baseMessage(metrics, quant, news) {
  return [
    `METRICS:\n${JSON.stringify(metrics, null, 2)}`,
    `QUANT SCORE (from the numbers alone): ${quant.total} / 1600  [${quant.components.map((c) => `${c.label} ${c.points}/${c.max}`).join(", ")}]`,
    `SUGGESTED RATING from price action: ${suggestedRating(metrics)}`,
    newsBlock(news),
  ];
}

/**
 * Ask Legend to analyze a stock with its recent news.
 * Resolves to the analysis plus { model, metrics, tokens }.
 */
async function analyze(stock, marketState, news = []) {
  const model = await resolveModel();
  const metrics = buildMetrics(stock, marketState);
  const quant = quantScore(metrics);
  const { raw, tokens } = await callModel(model, SYSTEM_PROMPT, baseMessage(metrics, quant, news).join("\n\n"), RESPONSE_SCHEMA, "legend_analysis");
  return { ...assemble(raw, metrics, quant, news), model, metrics, tokens };
}

/** The screener's grading fields, validated. */
function screenerExtras(raw) {
  return {
    setupGrade: pick(raw.setupGrade, SETUP_GRADES, "C"),
    catalystType: pick(raw.catalystType, CATALYST_TYPES, "other"),
    whyNow: text(raw.whyNow).replace(/\.$/, ""),
    tradePlan: text(raw.tradePlan),
  };
}

/**
 * Screener mode: grade a mover the scanner flagged. `checks` describes the five pillars, the
 * day's levels and how the stock was found. Resolves to the normal analysis plus `screener`.
 */
async function screen(stock, marketState, news = [], checks = {}) {
  const model = await resolveModel();
  const metrics = buildMetrics(stock, marketState);
  const quant = quantScore(metrics);
  const user = [...baseMessage(metrics, quant, news), `SCREENER CHECKS (from the scanner):\n${JSON.stringify(checks, null, 2)}`].join("\n\n");
  const { raw, tokens } = await callModel(model, SCREENER_PROMPT, user, SCREENER_SCHEMA, "legend_screener");
  return { ...assemble(raw, metrics, quant, news), screener: screenerExtras(raw), model, metrics, tokens };
}

/** Connection check for the Settings screen. */
async function status() {
  const started = Date.now();
  try {
    const model = await resolveModel();
    return { online: true, model, url: LEGEND_URL, latencyMs: Date.now() - started };
  } catch (err) {
    return { online: false, model: LEGEND_MODEL || null, url: LEGEND_URL, error: err.message };
  }
}

/** Canned reply for the LEGEND DRY RUN setting (no model call), with a real quant breakdown. */
function example(stock, marketState, news = []) {
  const ticker = String(stock?.symbol || "STCK").toUpperCase();
  const metrics = buildMetrics(stock || {}, marketState);
  const quant = quantScore(metrics);
  const raw = {
    rating: suggestedRating(metrics),
    catalyst: news.length ? "moderate" : "none",
    riskLevel: "minor",
    riskFlags: [],
    newsSentiment: news.length ? "mixed" : "none",
    keyNews: news.slice(0, 2).map((_, i) => ({ source: i + 1, sentiment: "neutral", impact: "Example: how this story would move the thesis" })),
    headline: `Example read for ${ticker}`,
    newsRead: news.length ? "Example: a summary of what the latest news means for the stock." : "Example: no recent news was found for this stock.",
    conviction: "Example: whether buyers are pressing the move or just catching a bounce.",
    efficiency: "Example: whether price moves easily on the volume it is getting.",
    risks: "Example: the main risks to keep in mind, including anything in the news.",
  };
  return { ...assemble(raw, metrics, quant, news), model: "dry-run", metrics };
}

/** LEGEND DRY RUN for the screener: the canned read plus a grade from the pillars alone. */
function exampleScreen(stock, marketState, news = [], checks = {}) {
  const base = example(stock, marketState, news);
  const passed = Array.isArray(checks.pillars) ? checks.pillars.filter((p) => p.pass).length : 0;
  const setupGrade = passed >= 5 ? "A+" : passed === 4 ? "A" : passed === 3 ? "B" : passed === 2 ? "C" : "F";
  return {
    ...base,
    screener: {
      setupGrade,
      catalystType: news.length ? "other" : "no_news",
      whyNow: "Example: why the stock is moving today",
      tradePlan: "Example: what would confirm the setup and what would invalidate it",
    },
  };
}

// ---------- Market news mode ----------
// The market news desk sends Legend the day's headlines a few at a time. Legend judges each one
// (is it real news, how much does it matter today, which stocks it is about), then writes a short
// briefing on the market from the stories it kept.

const NEWS_QUALITY = ["solid", "speculative", "promo", "stale", "offtopic"];
const NEWS_IMPACT = ["high", "medium", "low", "none"];
const NEWS_CATEGORIES = [
  "macro",
  "earnings",
  "fda_biotech",
  "deal_mna",
  "analyst",
  "ipo_listing",
  "tech_ai",
  "legal_regulatory",
  "company_news",
  "market_wrap",
  "commodities",
  "crypto",
  "other",
];
const MOODS = ["risk_on", "risk_off", "mixed", "quiet"];

const NEWS_PROMPT = `You are LEGEND, the market news desk inside Alpha 9: Legends, an app for active traders.
You receive a batch of the latest market headlines (title, publisher, age, a short description when
there is one) and judge each one for a trader who wants to know what is moving the market TODAY.
Be skeptical: much of what shows up in news feeds is not worth a trader's time.

For EVERY story decide:
quality:
  solid       - real reported news: earnings, deals, data releases, filings, approvals, official statements
  speculative - rumors, unconfirmed reports, opinion or analysis pieces, predictions
  promo       - paid promotion, clickbait, listicles ("3 stocks to buy now"), price-prediction pages
  stale       - news more than a day old resurfaced, or a recap of something from an earlier session
  offtopic    - not about markets, companies or the economy
  A same-day market wrap ("stocks rally as...") is solid: it says what moved; give it low or medium impact.
impact: how much it can move stocks or the market today
  high (moves the whole market or a stock 5%+), medium (moves a stock or sector), low (minor), none
sentiment: bullish, bearish, mixed or neutral for the stocks or market it is about
category: the kind of story
tickers: US-listed tickers of the companies the story is directly about, at most 4 (e.g. Nvidia ->
  NVDA). Skip companies listed only outside the US. The "stocks" given with a story are real, current
  US listings with their move right now (tickers change: trust these over memory), but a feed can tag
  the wrong company, so keep only the ones the story is really about. Empty for market-wide stories.
  Never guess.
why: what it means for traders today, at most 18 words, plain and direct, no hype. Describe what it
  means; never tell the reader to buy, sell, trade or avoid anything.

Return one entry per story, using the story's [number] as its id.`;

const NEWS_SCHEMA = {
  type: "object",
  properties: {
    stories: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer", minimum: 1 },
          quality: { type: "string", enum: NEWS_QUALITY },
          impact: { type: "string", enum: NEWS_IMPACT },
          sentiment: { type: "string", enum: SENTIMENTS },
          category: { type: "string", enum: NEWS_CATEGORIES },
          tickers: { type: "array", items: { type: "string" }, maxItems: 4 },
          why: { type: "string" },
        },
        required: ["id", "quality", "impact", "sentiment", "category", "tickers", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["stories"],
  additionalProperties: false,
};

const BRIEFING_PROMPT = `You are LEGEND, the market news desk inside Alpha 9: Legends. From the stories you
already judged and the market's moves right now, write a short briefing for a trader opening the app.
mood: risk_on (buyers in control, broad gains), risk_off (fear, broad selling), mixed, or quiet (little news).
headline: the one-line story of the market right now, at most 10 words, no trailing period.
summary: what is driving the market and which stocks are in play, at most 50 words.
themes: up to 4 themes running through the news (each a title of at most 4 words, a sentiment and
  the tickers involved from the stories).
watch: what to watch next (a data release, an earnings report, a level), at most 22 words.
Use only the stories and moves given. Plain, direct sentences; no hype; no disclaimers.`;

const BRIEFING_SCHEMA = {
  type: "object",
  properties: {
    mood: { type: "string", enum: MOODS },
    headline: { type: "string" },
    summary: { type: "string" },
    themes: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          sentiment: { type: "string", enum: SENTIMENTS },
          tickers: { type: "array", items: { type: "string" }, maxItems: 6 },
        },
        required: ["title", "sentiment", "tickers"],
        additionalProperties: false,
      },
    },
    watch: { type: "string" },
  },
  required: ["mood", "headline", "summary", "themes", "watch"],
  additionalProperties: false,
};

function storyBlock(stories) {
  return stories
    .map((s, i) => {
      const detail = String(s.summary || "").slice(0, 280);
      const named = s.stocks?.length ? ` [stocks: ${s.stocks.join("; ")}]` : "";
      return `[${i + 1}] ${s.title} (${s.publisher}${s.coverage > 1 ? ` + ${s.coverage - 1} more outlets` : ""}, ${ageLabel(s.ageHours)})${named}${detail ? `\n    ${detail}` : ""}`;
    })
    .join("\n");
}

const TICKER = /^[A-Z][A-Z.\-]{0,5}$/;

function newsVerdict(raw) {
  return {
    quality: pick(raw?.quality, NEWS_QUALITY, "speculative"),
    impact: pick(raw?.impact, NEWS_IMPACT, "low"),
    sentiment: pick(raw?.sentiment, SENTIMENTS, "neutral"),
    category: pick(raw?.category, NEWS_CATEGORIES, "other"),
    tickers: (Array.isArray(raw?.tickers) ? raw.tickers : []).map((t) => String(t).toUpperCase().replace(/^\$/, "").trim()).filter((t) => TICKER.test(t)).slice(0, 4),
    why: text(raw?.why).replace(/\.$/, ""),
  };
}

/**
 * Judge a batch of market stories. Resolves to { verdicts (one per story, in order; null where the
 * model skipped one), model, tokens }.
 */
async function readNews(stories, marketState) {
  const model = await resolveModel();
  const user = `MARKET SESSION: ${marketState}\n\nSTORIES:\n${storyBlock(stories)}`;
  const { raw, tokens } = await callModel(model, NEWS_PROMPT, user, NEWS_SCHEMA, "legend_news", 300 + stories.length * 160);
  const byId = new Map((Array.isArray(raw.stories) ? raw.stories : []).map((s) => [Number(s.id), s]));
  return { verdicts: stories.map((_, i) => (byId.has(i + 1) ? newsVerdict(byId.get(i + 1)) : null)), model, tokens };
}

function briefingFrom(raw) {
  return {
    mood: pick(raw?.mood, MOODS, "mixed"),
    headline: text(raw?.headline).replace(/\.$/, ""),
    summary: text(raw?.summary),
    themes: (Array.isArray(raw?.themes) ? raw.themes : []).slice(0, 4).map((t) => ({
      title: text(t.title).toUpperCase(),
      sentiment: pick(t.sentiment, SENTIMENTS, "neutral"),
      tickers: (Array.isArray(t.tickers) ? t.tickers : []).map((x) => String(x).toUpperCase()).filter((x) => TICKER.test(x)).slice(0, 6),
    })),
    watch: text(raw?.watch),
  };
}

/** The market briefing from the judged stories and the market's moves. */
async function briefNews(stories, pulse, marketState) {
  const model = await resolveModel();
  const moves = pulse.map((p) => `${p.label} ${p.change >= 0 ? "+" : ""}${p.change.toFixed(2)}%`).join(", ");
  const lines = stories
    .map((s, i) => {
      const t = s.tickers.map((x) => `${x.symbol}${Number.isFinite(x.change) ? ` ${x.change >= 0 ? "+" : ""}${x.change.toFixed(1)}%` : ""}`).join(", ");
      return `[${i + 1}] ${s.title} (${s.publisher}, ${ageLabel(s.ageHours)}) impact=${s.ai.impact} sentiment=${s.ai.sentiment}${t ? ` tickers: ${t}` : ""}\n    ${s.ai.why}`;
    })
    .join("\n");
  const user = `MARKET SESSION: ${marketState}\nMARKET MOVES NOW: ${moves || "unavailable"}\n\nSTORIES (most important first):\n${lines || "none"}`;
  const { raw, tokens } = await callModel(model, BRIEFING_PROMPT, user, BRIEFING_SCHEMA, "legend_briefing", 900);
  return { ...briefingFrom(raw), model, tokens };
}

/** LEGEND DRY RUN for the news desk: placeholder verdicts with no model call. */
function exampleNews(stories) {
  return {
    verdicts: stories.map((s, i) =>
      newsVerdict({
        quality: "solid",
        impact: ["high", "medium", "low"][i % 3],
        sentiment: ["bullish", "bearish", "mixed", "neutral"][i % 4],
        category: "other",
        tickers: s.tickers || [],
        why: "Example: what this story would mean for traders today",
      }),
    ),
    model: "dry-run",
  };
}

function exampleBriefing() {
  return {
    ...briefingFrom({
      mood: "mixed",
      headline: "Example briefing on the market right now",
      summary: "Example: what is driving the market and which stocks are in play, written by Legend from the stories it kept.",
      themes: [{ title: "EXAMPLE THEME", sentiment: "neutral", tickers: [] }],
      watch: "Example: what to watch next.",
    }),
    model: "dry-run",
  };
}

const STORY_PROMPT = `You are LEGEND, the news desk inside Alpha 9: Legends. A trader tapped a story to read it
in the app instead of on the outlet's site. Write a short reader's brief of it from the TEXT given.
summary: what happened, at most 60 words, plain and direct.
points: the 3 to 5 key facts (numbers, names, dates, guidance), at most 20 words each.
stocks: for each listed stock the story touches, how it touches it, at most 20 words. Only listed stocks.
context: why it matters for the market or those stocks today, at most 35 words.
Use only facts in the text; never invent numbers. When the TEXT is only headlines and short
descriptions from the feed, keep to what they say and give fewer points (even one). Never write
points about the outlet, the headline itself or when the story came out. Trust the listed stocks
over memory. No buy, sell, trade or avoid advice; no hype; no disclaimers.`;

const STORY_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    points: { type: "array", items: { type: "string" }, maxItems: 5 },
    stocks: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        properties: { symbol: { type: "string" }, note: { type: "string" } },
        required: ["symbol", "note"],
        additionalProperties: false,
      },
    },
    context: { type: "string" },
  },
  required: ["summary", "points", "stocks", "context"],
  additionalProperties: false,
};

function storyFrom(raw, listed) {
  return {
    summary: text(raw?.summary),
    points: (Array.isArray(raw?.points) ? raw.points : []).map(text).filter(Boolean).slice(0, 5),
    stocks: (Array.isArray(raw?.stocks) ? raw.stocks : [])
      .map((x) => ({ symbol: String(x?.symbol || "").toUpperCase().trim(), note: text(x?.note) }))
      .filter((x) => x.note && listed.includes(x.symbol))
      .slice(0, 4),
    context: text(raw?.context),
  };
}

/**
 * Legend's brief of one story for the in-app reader, from the article's text (or the feed's
 * headlines when the page couldn't be read). Resolves to the brief plus { model, tokens }.
 */
async function readStory(story, marketState) {
  const model = await resolveModel();
  const user = [
    `MARKET SESSION: ${marketState}`,
    `STORY: ${story.title} (${story.publisher}, ${ageLabel(story.ageHours)})`,
    `LISTED STOCKS: ${story.stocks.join(", ") || "none"}`,
    story.basis === "article" ? `TEXT (the article):\n${story.text}` : `TEXT (the article could not be opened; headlines and descriptions from the feed):\n${story.text || "none"}`,
  ].join("\n\n");
  const { raw, tokens } = await callModel(model, STORY_PROMPT, user, STORY_SCHEMA, "legend_story", 1000);
  return { ...storyFrom(raw, story.stocks.map((s) => s.split(" ")[0])), model, tokens };
}

/** LEGEND DRY RUN for the reader: a placeholder brief with no model call. */
function exampleStory(story) {
  const first = story.stocks[0]?.split(" ")[0];
  return {
    ...storyFrom(
      {
        summary: "Example: what happened in this story, in a few plain sentences written by Legend.",
        points: ["Example: the first key fact", "Example: the second key fact", "Example: the third key fact"],
        stocks: first ? [{ symbol: first, note: "Example: how the story touches this stock" }] : [],
        context: "Example: why it matters for the market today.",
      },
      first ? [first] : [],
    ),
    model: "dry-run",
    tokens: null,
  };
}

module.exports = {
  analyze,
  screen,
  readNews,
  briefNews,
  status,
  example,
  exampleScreen,
  exampleNews,
  exampleBriefing,
  readStory,
  exampleStory,
  usageSummary: usage.summary,
  LEGEND_URL,
};
