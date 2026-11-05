export interface StockData {
  symbol: string;
  fullName: string;
  currentPrice: number;
  lastClose: number;
  volume: number;
  averageVolume: number;
  float: number;
}

export type MarketState = "PRE-MARKET" | "MARKET OPEN" | "AFTER HOURS" | "MARKET CLOSED";

/** A news story retrieved for a stock (see server/news.js) */
export interface NewsItem {
  id: string;
  title: string;
  publisher: string;
  url: string;
  publishedAt: string;
  thumbnail: string | null;
  /** Publisher website, for its icon */
  domain: string | null;
  source: "yahoo" | "google";
  summary?: string;
  ageHours: number;
}

export interface NewsResult {
  items: NewsItem[];
  fetchedAt: string;
}

export type Sentiment = "bullish" | "bearish" | "mixed" | "neutral";

export interface ScoreComponent {
  key: string;
  label: string;
  points: number;
  max: number;
}

/** Legend's analysis of a stock (see server/legend.js) */
export interface LegendResponse {
  /** Final score from 0 to 2000: quant + catalyst bonus + risk penalty */
  score: number;
  rating: string;
  headline: string;
  newsRead: string;
  conviction: string;
  efficiency: string;
  risks: string;
  catalyst: "none" | "weak" | "moderate" | "strong" | "major";
  riskLevel: "none" | "minor" | "moderate" | "severe" | "critical";
  riskFlags: string[];
  newsSentiment: Sentiment | "none";
  /** The stories that mattered most, by NewsItem id */
  keyNews: { id: string; sentiment: Sentiment; impact: string }[];
  breakdown: {
    components: ScoreComponent[];
    liquidity: number;
    quant: number;
    catalyst: { level: string; points: number };
    risk: { level: string; points: number };
  };
  /** Model that produced the analysis ("dry-run" for the canned example) */
  model: string;
  /** Tokens this analysis used (absent for the dry run) */
  tokens?: { prompt: number; completion: number; total: number };
  /** Screener mode only: Legend's grade of the setup */
  screener?: ScreenerGrade;
}

export type SetupGrade = "A+" | "A" | "B" | "C" | "F";

export interface ScreenerGrade {
  setupGrade: SetupGrade;
  catalystType: string;
  /** Why it is moving today */
  whyNow: string;
  /** What would confirm or invalidate the setup */
  tradePlan: string;
}

export interface LegendStatus {
  online: boolean;
  model: string | null;
  url: string;
  latencyMs?: number;
  error?: string;
}

export type PageId = "startPage" | "summaryPage";

export interface TokenTally {
  tokens: number;
  prompt: number;
  completion: number;
  /** Number of Legend analyses */
  requests: number;
  /** Tokens by hour of the day (0 = midnight), summed over the period */
  hours: number[];
  /** Scans by hour of the day */
  hourScans: number[];
  /** Tokens recorded before hourly tracking began, so not in `hours` */
  untimed: number;
}

/** Legend's token usage ("A-tokens"), from the server's usage log */
export interface TokenUsage {
  /** Daily allowance; null means unlimited */
  dailyLimit: number | null;
  today: TokenTally;
  week: TokenTally;
  month: TokenTally;
  lifetime: TokenTally;
  /** First day with recorded usage (YYYY-MM-DD) */
  since: string | null;
  /** First day with an hour-by-hour split */
  hourlySince: string | null;
  /** The server's current hour (0-23) */
  hour: number;
}

/** A stock on the watchlist (see server/watchlist.js) */
export interface WatchItem {
  symbol: string;
  name: string;
  /** Company website, for its logo */
  domain: string | null;
  addedAt: number;
  /** When the last full update (quote, news, Legend) finished; null until the first */
  updatedAt: number | null;
  updates: number;
  stock: StockData | null;
  legend: LegendResponse | null;
  news: NewsItem[];
  /** The latest session's closing prices, for the card's chart */
  spark: number[];
  /** Score before the last update, to show which way it moved */
  prevScore: number | null;
  history: { t: number; score: number; price: number }[];
  /** LEGEND OFFLINE or UPDATE FAILED when the last update failed (the card keeps its old data) */
  error: string | null;
  /** Fortune 500 rank and company when the stock is on the list (these get the gold cards) */
  fortune500: { rank: number; company: string } | null;
  /** Being updated right now */
  updating: boolean;
}

export interface WatchSettings {
  /** Seconds between each stock's updates; 0 pauses updates */
  interval: number;
  dryRun: boolean;
}

/**
 * Where a background job (a screener scan, a watchlist update) has got to, for the loading bar
 * (see server/progress.js). Times are on the server's clock.
 */
export interface JobProgress {
  phases: { key: string; label: string }[];
  phase: string;
  /** For a counted phase (Legend grading several stocks): which one, of how many */
  unit: number;
  units: number;
  startedAt: number;
  stepStartedAt: number;
  /** Expected time for this step, and for everything after it */
  stepEstimateMs: number;
  afterMs: number;
  /** Share of the whole job done when this step started, and when it should end */
  from: number;
  to: number;
  /** Items done within the step, e.g. 12 of 34 floats looked up (0 of 0 when not counted) */
  done: number;
  total: number;
  /** The step is on hold (waiting for a scan run by hand) */
  held?: boolean;
}

/** What the update loop is doing */
export interface WatchEngine {
  /** offhours: outside the update schedule; limit: the daily token limit is used up */
  state: "offline" | "idle" | "updating" | "waiting" | "paused" | "offhours" | "limit";
  /** Why updates are held (offhours, limit) */
  reason?: string | null;
  symbol: string | null;
  nextAt: number | null;
  progress?: JobProgress | null;
  /** Other stocks due for an update now */
  queue?: number;
  /** Server clock when this was sent, to line countdowns up with this device's clock */
  now?: number;
}

export interface WatchSnapshot {
  items: WatchItem[];
  settings: WatchSettings;
  engine: WatchEngine;
  limit: number;
  intervals: number[];
  now: number;
}

/** Something worth telling the user about, sent by the server as watchlist updates land */
export type WatchAlert =
  | {
      id: string;
      kind: "bullish";
      symbol: string;
      name: string;
      at: number;
      /** Headline of the newly bullish story (the first, if several) */
      title: string;
      publisher: string;
      /** Legend's one-line read on why it matters */
      impact: string;
      /** How many more new bullish stories came with it */
      more: number;
    }
  | {
      id: string;
      kind: "setup";
      symbol: string;
      name: string;
      at: number;
      grade: SetupGrade;
      score: number;
      /** % change on the day */
      change: number;
      whyNow: string;
    }
  | {
      id: string;
      kind: "class-up";
      symbol: string;
      name: string;
      at: number;
      from: string;
      to: string;
      score: number;
      delta: number;
    };

/** One of the five momentum pillars, checked by the screener */
export interface Pillar {
  key: "price" | "float" | "change" | "rvol" | "news";
  label: string;
  value: string;
  pass: boolean;
}

/** A stock on the screener's board (see server/screener.js) */
export interface ScreenerEntry {
  symbol: string;
  name: string;
  exchange: string | null;
  /** Company website, for its logo */
  domain: string | null;
  price: number;
  /** % change on the day (pre-market change before the open) */
  change: number;
  prevClose: number;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number;
  avgVolume: number;
  rvol: number;
  float: number;
  marketCap: number | null;
  /** Where the scanner found it: YAHOO, TRENDING, STOCKTWITS, NEWS */
  found: string[];
  /** The headline that surfaced it, when found in the news */
  headline: string | null;
  news: NewsItem[];
  pillars: Pillar[];
  passed: number;
  /** Score from the numbers alone */
  quant: number;
  /** Legend's score once graded, the quant score until then */
  score: number;
  grade: SetupGrade | null;
  ai: LegendResponse | null;
  analyzedAt: number | null;
  firstSeen: number;
  /** Place among the A+ to C setups (null while not graded, or graded F) */
  rank: number | null;
  /** Rank at the end of the last update, for the ▲▼ arrows */
  prevRank: number | null;
  /** Joined the board in this update */
  isNew: boolean;
}

/** What one screener update costs, for the page's estimate */
export interface ScreenerEstimate {
  tokensPerGrade: number;
  /** False until real grades have been measured */
  measured: boolean;
  /** Time per Legend grade, and for the steps before grading */
  gradeMs: number;
  baseMs: number;
}

export interface ScreenerSettings {
  /** Seconds between scans; 0 pauses (the default) */
  interval: number;
  dryRun: boolean;
  /** How many stocks the board shows, and Legend grades, per update */
  boardSize: number;
  criteria: { minPrice: number; maxPrice: number; maxFloat: number; minChange: number; minRvol: number; requireNews: boolean };
}

export interface ScreenerStats {
  /** Start of the current (or last) update; lastStartedAt is the last finished one's */
  startedAt: number;
  finishedAt: number;
  lastStartedAt?: number;
  candidates: number;
  movers: number;
  shown?: number;
  graded: number;
  /** Grades done in the update running now */
  gradedNow?: number;
  boardSize?: number;
  session: MarketState;
  error: string | null;
}

export interface ScreenerEngine {
  state: "offline" | "paused" | "idle" | "scanning" | "analyzing" | "waiting" | "offhours" | "limit";
  reason?: string | null;
  /** What the scan is doing, e.g. LEGEND IS GRADING ABCD */
  step: string | null;
  symbol: string | null;
  nextAt: number | null;
  progress?: JobProgress | null;
  now?: number;
}

export interface ScreenerSnapshot {
  board: ScreenerEntry[];
  settings: ScreenerSettings;
  stats: ScreenerStats | null;
  engine: ScreenerEngine;
  intervals: number[];
  boardSizes: number[];
  estimate: ScreenerEstimate;
  now: number;
}

// ---------- Market news ----------

export type NewsQuality = "solid" | "speculative" | "promo" | "stale" | "offtopic";
export type NewsImpact = "high" | "medium" | "low" | "none";
export type NewsSentiment = "bullish" | "bearish" | "mixed" | "neutral";

/** A stock a story is about, with its move now */
export interface NewsTicker {
  symbol: string;
  name: string;
  price: number;
  change: number | null;
  /** PRE: the change is the pre-market move; DAY: the day's move */
  session: "PRE" | "DAY";
  /** After-hours move, when there is one */
  after: number | null;
}

/** One story in the market news feed (the same news from several outlets is one story) */
export interface MarketStory {
  id: string;
  title: string;
  url: string;
  publisher: string;
  domain: string | null;
  publishedAt: string;
  summary: string;
  /** How many outlets ran it */
  coverage: number;
  outlets: string[];
  tickers: NewsTicker[];
  /** Legend's read; null until read */
  ai: {
    quality: NewsQuality;
    impact: NewsImpact;
    sentiment: NewsSentiment;
    category: string;
    tickers: string[];
    why: string;
  } | null;
  readAt: number | null;
  firstSeen: number;
  /** How hot the story is now (impact, recency, coverage, moves) */
  hot: number;
  /** One link per outlet that ran it, the story's own first (missing on stories from older updates) */
  links?: { publisher: string; url: string; domain: string | null }[];
  /** Legend has already written the reader's brief */
  briefed?: boolean;
}

/** Legend's brief of one story, for the in-app reader */
export interface StoryRead {
  summary: string;
  points: string[];
  stocks: { symbol: string; note: string }[];
  context: string;
  /** "article": Legend read the outlet's page; "feed": the page couldn't be opened, so the headlines */
  basis: "article" | "feed";
  /** Characters of the article Legend read */
  chars: number;
  image: string | null;
  /** The outlet's page (Google News redirects resolved) */
  url: string;
  at: number;
  model: string;
  tokens: { total?: number } | null;
}

export interface NewsBriefing {
  mood: "risk_on" | "risk_off" | "mixed" | "quiet";
  headline: string;
  summary: string;
  themes: { title: string; sentiment: NewsSentiment; tickers: string[] }[];
  watch: string;
  at: number;
  session: MarketState;
}

/** An index, future or gauge on the market pulse strip */
export interface PulseQuote {
  symbol: string;
  label: string;
  price: number;
  change: number;
  yield: boolean;
}

export interface NewsSettings {
  /** Seconds from one update's end to the next; 0 is off */
  interval: number;
  dryRun: boolean;
  /** Stories Legend reads per update */
  storyCount: number;
}

export interface NewsStats {
  startedAt: number;
  finishedAt: number;
  lastStartedAt?: number;
  /** Items from all sources, stories after merging duplicates, stories Legend has read and kept */
  gathered: number;
  clustered: number;
  read: number;
  readNow?: number;
  kept: number;
  hidden: { promo: number; stale: number; offtopic: number; minor: number };
  sources: Record<string, number | string>;
  storyCount?: number;
  session: MarketState;
  error: string | null;
}

export interface NewsEstimate {
  tokensPerStory: number;
  tokensPerBriefing: number;
  measured: boolean;
  /** Stories per Legend call, and the time each call takes */
  batch: number;
  batchMs: number;
  baseMs: number;
  briefMs: number;
}

export interface NewsEngine {
  state: "offline" | "paused" | "idle" | "gathering" | "reading" | "waiting" | "offhours" | "limit";
  step: string | null;
  nextAt: number | null;
  progress?: JobProgress | null;
  reason?: string | null;
  now?: number;
}

export interface NewsSnapshot {
  stories: MarketStory[];
  briefing: NewsBriefing | null;
  pulse: PulseQuote[];
  stats: NewsStats | null;
  estimate: NewsEstimate;
  settings: NewsSettings;
  engine: NewsEngine;
  intervals: number[];
  storyCounts: number[];
  now: number;
}

// ---------- Update schedule ----------

export type JobKey = "watchlist" | "screener" | "news";
export type SessionKey = "premarket" | "open" | "afterhours" | "overnight" | "weekend";

/** A window of hours in minutes after midnight; may run past midnight */
export interface HoursWindow {
  from: number;
  to: number;
}

export interface JobSchedule {
  sessions: SessionKey[];
  hours: HoursWindow | null;
  resume: number | null;
}

export interface ScheduleSnapshot {
  paused: boolean;
  dailyTokenLimit: number;
  background: boolean;
  jobs: Record<JobKey, JobSchedule>;
  sessions: SessionKey[];
  tokenLimits: number[];
  info: {
    watchlist: { interval: number; intervals: number[]; count: number; limit: number; engine: WatchEngine; estimate: { tokensPerUpdate: number; measured: boolean; updateMs: number }; resume: number };
    screener: { interval: number; intervals: number[]; boardSize: number; boardSizes: number[]; movers: number | null; engine: ScreenerEngine; estimate: ScreenerEstimate; lastFinishedAt: number; resume: number };
    news: { interval: number; intervals: number[]; storyCount: number; storyCounts: number[]; engine: NewsEngine; estimate: NewsEstimate; lastFinishedAt: number; resume: number };
  };
  /** Tokens used today */
  today: number;
  now: number;
}

export interface JobSchedulePatch {
  sessions?: SessionKey[];
  hours?: HoursWindow | null;
  enabled?: boolean;
  interval?: number;
  boardSize?: number;
  storyCount?: number;
}

export interface SchedulePatch {
  paused?: boolean;
  dailyTokenLimit?: number;
  background?: boolean;
  jobs?: Partial<Record<JobKey, JobSchedulePatch>>;
}
