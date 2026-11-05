// The update schedule: when the three AI jobs (watchlist, stock screener, market news) may refresh
// on their own. Each job's own module keeps how often it runs (its interval); this keeps the rest:
// which market sessions it runs in, an optional window of hours, a pause for everything, a daily
// token limit, and whether jobs keep running while no page is open. Refreshes asked for by hand
// (UPDATE NOW, a single stock's refresh) ignore the schedule.
//
// Times are the server's local time, like the market session everywhere else in the app.

const fs = require("fs");
const path = require("path");
const usage = require("./usage");

const FILE = process.env.SCHEDULE_FILE || path.join(__dirname, "data", "schedule.json");
const JOBS = ["watchlist", "screener", "news"];
// Weekday sessions match marketState() in quotes.js; weekends are their own
const SESSIONS = ["premarket", "open", "afterhours", "overnight", "weekend"];
const TOKEN_LIMITS = [0, 100_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000]; // 0: no limit
const CHECK_MS = 60_000; // a blocked job looks again at least this often (limits and settings change)

let store = load();
const listeners = new Set();

function defaultJob() {
  return { sessions: [...SESSIONS], hours: null, resume: null };
}

function load() {
  const base = { version: 1, paused: false, dailyTokenLimit: 0, background: false, jobs: Object.fromEntries(JOBS.map((j) => [j, defaultJob()])) };
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (parsed && typeof parsed.jobs === "object") {
      return {
        ...base,
        paused: Boolean(parsed.paused),
        dailyTokenLimit: TOKEN_LIMITS.includes(parsed.dailyTokenLimit) ? parsed.dailyTokenLimit : 0,
        background: Boolean(parsed.background),
        jobs: Object.fromEntries(JOBS.map((j) => [j, { ...defaultJob(), ...parsed.jobs[j] }])),
      };
    }
  } catch (err) {
    if (err.code !== "ENOENT") console.error("Schedule file unreadable, starting fresh:", err.message);
  }
  return base;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const temp = `${FILE}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(store, null, 2));
    fs.renameSync(temp, FILE);
  } catch (err) {
    console.error("Could not save the schedule:", err.message);
  }
}

// ---------- Time ----------

/** The session a moment falls in (minutes: 4:00 to 9:30 pre-market, to 16:00 open, to 20:00 after hours). */
function sessionAt(date) {
  const day = date.getDay();
  if (day === 0 || day === 6) return "weekend";
  const m = date.getHours() * 60 + date.getMinutes();
  if (m >= 240 && m < 570) return "premarket";
  if (m >= 570 && m <= 960) return "open";
  if (m > 960 && m <= 1200) return "afterhours";
  return "overnight";
}

/** Whether a minute of the day (0-1439) is inside a window of hours; windows may run past midnight. */
function inWindow(minute, hours) {
  if (!hours) return true;
  const { from, to } = hours;
  if (from === to) return true;
  return from < to ? minute >= from && minute < to : minute >= from || minute < to;
}

function allowedAt(job, date) {
  const j = store.jobs[job];
  if (!j.sessions.includes(sessionAt(date))) return false;
  return inWindow(date.getHours() * 60 + date.getMinutes(), j.hours);
}

/** The next minute the job may run, or null if its schedule never allows it. */
function nextAllowed(job, from = Date.now()) {
  const d = new Date(from);
  d.setSeconds(0, 0);
  for (let i = 0; i < 8 * 1440; i++) {
    d.setTime(d.getTime() + 60_000);
    if (allowedAt(job, d)) return d.getTime();
  }
  return null;
}

function nextMidnight(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
}

// ---------- Checks ----------

/**
 * Whether a job may refresh on its own right now. Null when it may; otherwise what's stopping it:
 * { state: "offhours" | "limit", reason, resumeAt, wait } (wait: how long to sleep before looking again).
 */
function gate(job, now = Date.now()) {
  if (store.paused) return { state: "offhours", reason: "ALL AUTO UPDATES PAUSED", resumeAt: null, wait: CHECK_MS };
  if (store.dailyTokenLimit && usage.summary().today.tokens >= store.dailyTokenLimit) {
    const resumeAt = nextAllowed(job, nextMidnight() - 60_000);
    return { state: "limit", reason: "DAILY TOKEN LIMIT REACHED", resumeAt, wait: CHECK_MS };
  }
  if (allowedAt(job, new Date(now))) return null;
  const resumeAt = nextAllowed(job, now);
  return { state: "offhours", reason: "OUTSIDE ITS SCHEDULE", resumeAt, wait: resumeAt ? Math.min(CHECK_MS, Math.max(1000, resumeAt - now)) : CHECK_MS };
}

/** Jobs keep running with no page open. */
function background() {
  return store.background;
}

// ---------- Changes ----------

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function validHours(hours) {
  if (hours === null) return null;
  const from = Number(hours?.from);
  const to = Number(hours?.to);
  const ok = (m) => Number.isInteger(m) && m >= 0 && m < 1440;
  if (!ok(from) || !ok(to)) throw httpError(400, "Hours must be minutes of the day (0-1439)");
  return { from, to };
}

/** Change the schedule. `jobs` may carry { sessions, hours } per job. */
function update({ paused, dailyTokenLimit, background: bg, jobs } = {}) {
  if (paused !== undefined) store.paused = Boolean(paused);
  if (bg !== undefined) store.background = Boolean(bg);
  if (dailyTokenLimit !== undefined) {
    if (!TOKEN_LIMITS.includes(Number(dailyTokenLimit))) throw httpError(400, `Daily token limit must be one of ${TOKEN_LIMITS.join(", ")}`);
    store.dailyTokenLimit = Number(dailyTokenLimit);
  }
  for (const [job, patch] of Object.entries(jobs || {})) {
    if (!JOBS.includes(job) || !patch) continue;
    const j = store.jobs[job];
    if (patch.sessions !== undefined) {
      if (!Array.isArray(patch.sessions)) throw httpError(400, "Sessions must be a list");
      j.sessions = SESSIONS.filter((s) => patch.sessions.includes(s));
    }
    if (patch.hours !== undefined) j.hours = validHours(patch.hours);
  }
  save();
  listeners.forEach((fn) => fn());
  return settings();
}

/** Remember a job's interval while it is switched off, so switching it on brings it back. */
function setResume(job, interval) {
  if (!JOBS.includes(job)) return;
  store.jobs[job].resume = interval || null;
  save();
}

function resumeOf(job) {
  return store.jobs[job]?.resume || null;
}

function settings() {
  return { paused: store.paused, dailyTokenLimit: store.dailyTokenLimit, background: store.background, jobs: store.jobs };
}

/** Run `fn` whenever the schedule changes. */
function onChange(fn) {
  listeners.add(fn);
}

module.exports = { gate, background, update, settings, onChange, setResume, resumeOf, sessionAt, nextAllowed, JOBS, SESSIONS, TOKEN_LIMITS };
