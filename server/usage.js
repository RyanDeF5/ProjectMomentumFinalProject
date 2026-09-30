// Legend token usage ("A-tokens"): every analysis adds the tokens LM Studio reports to a per-day
// tally (split by hour of the day, for the Tokens screen's graph), saved to a JSON file so the counts
// survive restarts. Days use the server's local time; weeks start on Monday. Days recorded before
// hourly tracking have no hour split; their tokens are reported as "untimed".

const fs = require("fs");
const path = require("path");

const USAGE_FILE = process.env.LEGEND_USAGE_FILE || path.join(__dirname, "data", "token-usage.json");

/** Daily allowance in tokens; null means unlimited. */
const DAILY_LIMIT = process.env.LEGEND_DAILY_TOKENS ? Number(process.env.LEGEND_DAILY_TOKENS) : null;

let store = load();

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8"));
    if (parsed && typeof parsed.days === "object") return parsed;
  } catch (err) {
    if (err.code !== "ENOENT") console.error("Token usage file unreadable, starting fresh:", err.message);
  }
  return { version: 1, days: {} };
}

function save() {
  fs.mkdirSync(path.dirname(USAGE_FILE), { recursive: true });
  const temp = `${USAGE_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2));
  fs.renameSync(temp, USAGE_FILE);
}

function dayKey(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Add one analysis's token usage (OpenAI-style usage object) to today's tally. */
function record(usage, now = new Date()) {
  const prompt = Number(usage?.prompt_tokens) || 0;
  const completion = Number(usage?.completion_tokens) || 0;
  const total = Number(usage?.total_tokens) || prompt + completion;
  const key = dayKey(now);
  const day = store.days[key] || { prompt: 0, completion: 0, total: 0, requests: 0 };
  day.prompt += prompt;
  day.completion += completion;
  day.total += total;
  day.requests += 1;
  const hour = now.getHours();
  day.hours = day.hours || Array(24).fill(0);
  day.hourScans = day.hourScans || Array(24).fill(0);
  day.hours[hour] += total;
  day.hourScans[hour] += 1;
  store.days[key] = day;
  try {
    save();
  } catch (err) {
    console.error("Could not save token usage:", err.message);
  }
  return { prompt, completion, total };
}

function sum(keys) {
  return keys.reduce(
    (acc, key) => {
      const day = store.days[key];
      if (!day) return acc;
      acc.tokens += day.total;
      acc.prompt += day.prompt;
      acc.completion += day.completion;
      acc.requests += day.requests;
      if (Array.isArray(day.hours)) {
        day.hours.forEach((tokens, h) => (acc.hours[h] += tokens));
        (day.hourScans || []).forEach((scans, h) => (acc.hourScans[h] += scans));
        // Scans from before the hour split was added on this day
        acc.untimed += day.total - day.hours.reduce((a, b) => a + b, 0);
      } else {
        acc.untimed += day.total;
      }
      return acc;
    },
    { tokens: 0, prompt: 0, completion: 0, requests: 0, hours: Array(24).fill(0), hourScans: Array(24).fill(0), untimed: 0 },
  );
}

/** Totals for today, this week (from Monday), this month and lifetime. */
function summary(now = new Date()) {
  const today = dayKey(now);
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const weekStart = dayKey(monday);
  const monthPrefix = today.slice(0, 8);
  const keys = Object.keys(store.days).sort();
  return {
    dailyLimit: DAILY_LIMIT,
    today: sum([today]),
    week: sum(keys.filter((k) => k >= weekStart && k <= today)),
    month: sum(keys.filter((k) => k.startsWith(monthPrefix))),
    lifetime: sum(keys),
    since: keys[0] || null,
    hourlySince: keys.find((k) => Array.isArray(store.days[k].hours)) || null,
    hour: now.getHours(),
  };
}

module.exports = { record, summary };
