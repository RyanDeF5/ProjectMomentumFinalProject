// The US stock market's calendar: New York time, exchange holidays and early closes.
// The same logic is in server/marketCalendar.js for the server (tests/market-calendar.test.mjs
// checks the two agree). Rules, not a list of dates, so it doesn't run out:
//   Closed: weekends; New Year's Day, Martin Luther King Jr. Day, Presidents' Day, Good Friday,
//   Memorial Day, Juneteenth, Independence Day, Labor Day, Thanksgiving and Christmas. A holiday on
//   a Saturday is kept on the Friday before (except New Year's Day), one on a Sunday on the Monday.
//   Early close at 1:00 PM (after hours until 5:00): the day after Thanksgiving, Christmas Eve and
//   July 3rd, when those fall on a Monday to Thursday (the day after Thanksgiving is always Friday).

const NY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
const HOUR = 3_600_000;
const offsets = new Map<number, number>();

/** New York's offset from UTC (ms, negative) at an instant. Looked up once per hour: it only changes on the hour. */
function nyOffset(t: number): number {
  const key = Math.floor(t / HOUR);
  let off = offsets.get(key);
  if (off === undefined) {
    const p: Record<string, number> = {};
    for (const part of NY.formatToParts(new Date(key * HOUR))) p[part.type] = Number(part.value);
    off = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - key * HOUR;
    if (offsets.size > 2000) offsets.clear();
    offsets.set(key, off);
  }
  return off;
}

/** The New York wall clock at an instant: { y, m (1-12), d, dow (0 Sunday), minute (of the day) }. */
export interface NYParts {
  y: number;
  m: number;
  d: number;
  dow: number;
  minute: number;
}

export function nyParts(date = new Date()): NYParts {
  const t = date.getTime();
  const wall = new Date(t + nyOffset(t));
  return { y: wall.getUTCFullYear(), m: wall.getUTCMonth() + 1, d: wall.getUTCDate(), dow: wall.getUTCDay(), minute: wall.getUTCHours() * 60 + wall.getUTCMinutes() };
}

/** The instant of a New York wall-clock time. */
export function nyInstant(y: number, m: number, d: number, minute = 0): number {
  const wall = Date.UTC(y, m - 1, d, 0, minute);
  let t = wall - nyOffset(wall);
  t = wall - nyOffset(t);
  return t;
}

const dowOf = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
const nthWeekday = (y: number, m: number, dow: number, n: number) => 1 + ((dow - dowOf(y, m, 1) + 7) % 7) + (n - 1) * 7;
function lastWeekday(y: number, m: number, dow: number): number {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return last - ((dowOf(y, m, last) - dow + 7) % 7);
}
/** Easter Sunday (Gregorian), as [month, day]. */
function easter(y: number): [number, number] {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const mm = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * mm + 114) / 31);
  const day = ((h + l - 7 * mm + 114) % 31) + 1;
  return [month, day];
}

const years = new Map<number, { holidays: Map<string, string>; early: Set<string> }>();
/** A year's closed days and early closes: { holidays: Map("m-d" -> name), early: Set("m-d") }. */
function yearCalendar(y: number) {
  let cal = years.get(y);
  if (cal) return cal;
  const holidays = new Map<string, string>();
  const fixed = (m: number, d: number, name: string, saturdayToFriday = true) => {
    const dow = dowOf(y, m, d);
    if (dow === 6) {
      if (saturdayToFriday) holidays.set(`${m}-${d - 1}`, name);
    } else if (dow === 0) holidays.set(`${m}-${d + 1}`, name);
    else holidays.set(`${m}-${d}`, name);
  };
  fixed(1, 1, "NEW YEAR'S DAY", false);
  holidays.set(`1-${nthWeekday(y, 1, 1, 3)}`, "MARTIN LUTHER KING JR. DAY");
  holidays.set(`2-${nthWeekday(y, 2, 1, 3)}`, "PRESIDENTS' DAY");
  const [em, ed] = easter(y);
  const goodFriday = new Date(Date.UTC(y, em - 1, ed - 2));
  holidays.set(`${goodFriday.getUTCMonth() + 1}-${goodFriday.getUTCDate()}`, "GOOD FRIDAY");
  holidays.set(`5-${lastWeekday(y, 5, 1)}`, "MEMORIAL DAY");
  if (y >= 2022) fixed(6, 19, "JUNETEENTH");
  fixed(7, 4, "INDEPENDENCE DAY");
  holidays.set(`9-${nthWeekday(y, 9, 1, 1)}`, "LABOR DAY");
  const thanksgiving = nthWeekday(y, 11, 4, 4);
  holidays.set(`11-${thanksgiving}`, "THANKSGIVING");
  fixed(12, 25, "CHRISTMAS");

  const early = new Set([`11-${thanksgiving + 1}`]);
  const weekdayBeforeFriday = (m: number, d: number) => {
    const dow = dowOf(y, m, d);
    if (dow >= 1 && dow <= 4 && !holidays.has(`${m}-${d}`)) early.add(`${m}-${d}`);
  };
  weekdayBeforeFriday(7, 3);
  weekdayBeforeFriday(12, 24);
  cal = { holidays, early };
  years.set(y, cal);
  return cal;
}

/** The holiday the market is closed for on a New York date, or null. */
export const holidayName = (y: number, m: number, d: number): string | null => yearCalendar(y).holidays.get(`${m}-${d}`) || null;

/** A New York date: "closed" (weekend or holiday), "early" (1:00 PM close) or "full". */
export type DayKind = "closed" | "early" | "full";

export function dayKind(y: number, m: number, d: number): DayKind {
  const dow = dowOf(y, m, d);
  if (dow === 0 || dow === 6 || holidayName(y, m, d)) return "closed";
  return yearCalendar(y).early.has(`${m}-${d}`) ? "early" : "full";
}

// When each session starts (minutes after midnight, New York). Matches the app's long-standing
// boundaries: the open runs through 4:00 PM itself, after hours through 8:00 PM.
type State = "PRE-MARKET" | "MARKET OPEN" | "AFTER HOURS" | "MARKET CLOSED";
type SessionKey = "premarket" | "open" | "afterhours" | "overnight" | "weekend";

const STARTS: Record<"full" | "early", [number, State][]> = {
  full: [
    [240, "PRE-MARKET"],
    [570, "MARKET OPEN"],
    [961, "AFTER HOURS"],
    [1201, "MARKET CLOSED"],
  ],
  early: [
    [240, "PRE-MARKET"],
    [570, "MARKET OPEN"],
    [781, "AFTER HOURS"],
    [1021, "MARKET CLOSED"],
  ],
};

/** The market session at an instant: PRE-MARKET, MARKET OPEN, AFTER HOURS or MARKET CLOSED. */
export function marketStateAt(date = new Date()): State {
  const p = nyParts(date);
  const kind = dayKind(p.y, p.m, p.d);
  if (kind === "closed") return "MARKET CLOSED";
  let state: State = "MARKET CLOSED";
  for (const [minute, name] of STARTS[kind]) if (p.minute >= minute) state = name;
  return state;
}

const SESSION_KEYS: Record<State, SessionKey> = { "PRE-MARKET": "premarket", "MARKET OPEN": "open", "AFTER HOURS": "afterhours", "MARKET CLOSED": "overnight" };
/** The schedule's session at an instant: premarket, open, afterhours, overnight, or weekend (any closed day). */
export function sessionKeyAt(date = new Date()): SessionKey {
  const p = nyParts(date);
  if (dayKind(p.y, p.m, p.d) === "closed") return "weekend";
  return SESSION_KEYS[marketStateAt(date)];
}

/** Why the market is closed all day at an instant: the holiday's name, "THE WEEKEND", or null on a trading day. */
export function closedDayReason(date = new Date()): string | null {
  const p = nyParts(date);
  const holiday = holidayName(p.y, p.m, p.d);
  if (holiday) return holiday;
  return p.dow === 0 || p.dow === 6 ? "THE WEEKEND" : null;
}

/** The next session change after an instant: { at (ms), state (the session that starts then) }. */
export function nextSessionStart(date = new Date()): { at: number; state: State } | null {
  const now = date.getTime();
  const p = nyParts(date);
  for (let i = 0; i < 12; i++) {
    const day = new Date(Date.UTC(p.y, p.m - 1, p.d + i));
    const [y, m, d] = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()];
    const kind = dayKind(y, m, d);
    if (kind === "closed") continue;
    for (const [minute, state] of STARTS[kind]) {
      const at = nyInstant(y, m, d, minute);
      if (at > now) return { at, state };
    }
  }
  return null;
}

/**
 * The latest trading day as of an instant, as a New York date { y, m, d }: today from 4:00 AM on a
 * trading day, otherwise the trading day before (weekends and holidays skipped).
 */
export function lastTradingDate(date = new Date()): { y: number; m: number; d: number } {
  const p = nyParts(date);
  let back = p.minute < 240 ? 1 : 0;
  for (; back < 12; back++) {
    const day = new Date(Date.UTC(p.y, p.m - 1, p.d - back));
    const [y, m, d] = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()];
    if (dayKind(y, m, d) !== "closed") return { y, m, d };
  }
  return { y: p.y, m: p.m, d: p.d };
}
