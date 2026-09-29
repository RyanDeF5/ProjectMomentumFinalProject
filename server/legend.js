// Legend: Project Momentum's AI analyst, served by a local LM Studio instance through its
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

const SYSTEM_PROMPT = `You are LEGEND, the momentum analyst inside Project Momentum, a day-trading screener.
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

/**
 * Ask Legend to analyze a stock with its recent news.
 * Resolves to the analysis plus { model, metrics, tokens }.
 */
async function analyze(stock, marketState, news = []) {
  const model = await resolveModel();
  const metrics = buildMetrics(stock, marketState);
  const quant = quantScore(metrics);

  const userMessage = [
    `METRICS:\n${JSON.stringify(metrics, null, 2)}`,
    `QUANT SCORE (from the numbers alone): ${quant.total} / 1600  [${quant.components.map((c) => `${c.label} ${c.points}/${c.max}`).join(", ")}]`,
    `SUGGESTED RATING from price action: ${suggestedRating(metrics)}`,
    newsBlock(news),
  ].join("\n\n");

  const res = await fetch(`${LEGEND_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 1200,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "legend_analysis", strict: true, schema: RESPONSE_SCHEMA },
      },
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
  return { ...assemble(extractJson(content), metrics, quant, news), model, metrics, tokens };
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

module.exports = { analyze, status, example, usageSummary: usage.summary, LEGEND_URL };
