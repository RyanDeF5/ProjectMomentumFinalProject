import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const server = createRequire(import.meta.url)('../server/marketCalendar.js');
// The browser's copy, with its types stripped for Node's test runner
const { stripTypeScriptTypes } = await import('node:module');
const source = await readFile(new URL('../src/lib/marketCalendar.ts', import.meta.url), 'utf8');
const browser = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);

// The exchange's published schedule (rule-based days only; one-off closures aren't predicted)
const PUBLISHED = {
  2025: { closed: ['1-1', '1-20', '2-17', '4-18', '5-26', '6-19', '7-4', '9-1', '11-27', '12-25'], early: ['7-3', '11-28', '12-24'] },
  2026: { closed: ['1-1', '1-19', '2-16', '4-3', '5-25', '6-19', '7-3', '9-7', '11-26', '12-25'], early: ['11-27', '12-24'] },
  2027: { closed: ['1-1', '1-18', '2-15', '3-26', '5-31', '6-18', '7-5', '9-6', '11-25', '12-24'], early: ['11-26'] },
  2028: { closed: ['1-17', '2-21', '4-14', '5-29', '6-19', '7-4', '9-4', '11-23', '12-25'], early: ['7-3', '11-24'] },
};

for (const [name, cal] of [['server', server], ['browser', browser]]) {
  test(`${name}: holidays and early closes match the published schedule`, () => {
    for (const [year, want] of Object.entries(PUBLISHED)) {
      const y = Number(year);
      const closed = [];
      const early = [];
      for (let m = 1; m <= 12; m++) {
        for (let d = 1; d <= new Date(Date.UTC(y, m, 0)).getUTCDate(); d++) {
          const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
          const kind = cal.dayKind(y, m, d);
          if (kind === 'closed' && dow !== 0 && dow !== 6) closed.push(`${m}-${d}`);
          if (kind === 'early') early.push(`${m}-${d}`);
        }
      }
      assert.deepEqual(closed, want.closed, `${year} holidays`);
      assert.deepEqual(early, want.early, `${year} early closes`);
    }
  });

  test(`${name}: sessions follow New York time, whatever the computer's zone`, () => {
    const at = (iso) => cal.marketStateAt(new Date(iso));
    // Thursday Nov 19 2026 (EST, UTC-5)
    assert.equal(at('2026-11-19T08:59:00Z'), 'MARKET CLOSED'); // 3:59 AM
    assert.equal(at('2026-11-19T09:00:00Z'), 'PRE-MARKET'); // 4:00 AM
    assert.equal(at('2026-11-19T14:30:00Z'), 'MARKET OPEN'); // 9:30 AM
    assert.equal(at('2026-11-19T21:00:00Z'), 'MARKET OPEN'); // 4:00 PM
    assert.equal(at('2026-11-19T21:01:00Z'), 'AFTER HOURS');
    assert.equal(at('2026-11-20T01:01:00Z'), 'MARKET CLOSED'); // 8:01 PM
    // A summer day (EDT, UTC-4): the open is an hour earlier in UTC
    assert.equal(at('2026-07-15T13:30:00Z'), 'MARKET OPEN');
    assert.equal(at('2026-07-15T13:29:00Z'), 'PRE-MARKET');
  });

  test(`${name}: Thanksgiving is closed and the day after closes at 1:00 PM`, () => {
    const at = (iso) => cal.marketStateAt(new Date(iso));
    assert.equal(at('2026-11-26T15:00:00Z'), 'MARKET CLOSED'); // Thanksgiving, 10 AM
    assert.equal(cal.closedDayReason(new Date('2026-11-26T15:00:00Z')), 'THANKSGIVING');
    assert.equal(cal.sessionKeyAt(new Date('2026-11-26T15:00:00Z')), 'weekend');
    assert.equal(at('2026-11-27T18:00:00Z'), 'MARKET OPEN'); // Friday 1:00 PM
    assert.equal(at('2026-11-27T18:01:00Z'), 'AFTER HOURS'); // 1:01 PM
    assert.equal(at('2026-11-27T22:01:00Z'), 'MARKET CLOSED'); // 5:01 PM
    assert.equal(cal.closedDayReason(new Date('2026-11-21T15:00:00Z')), 'THE WEEKEND');
    assert.equal(cal.closedDayReason(new Date('2026-11-19T15:00:00Z')), null);
  });

  test(`${name}: the next session and the last trading day skip holidays`, () => {
    // Wednesday Nov 25 2026, 9:00 PM: next is Friday's pre-market, not Thursday's
    const next = cal.nextSessionStart(new Date('2026-11-26T02:00:00Z'));
    assert.equal(next.state, 'PRE-MARKET');
    assert.equal(new Date(next.at).toISOString(), '2026-11-27T09:00:00.000Z');
    // Friday's early close: after hours start at 1:01 PM
    const early = cal.nextSessionStart(new Date('2026-11-27T17:00:00Z'));
    assert.deepEqual([early.state, new Date(early.at).toISOString()], ['AFTER HOURS', '2026-11-27T18:01:00.000Z']);
    // Thanksgiving morning: the last trading day is Wednesday
    assert.deepEqual(cal.lastTradingDate(new Date('2026-11-26T15:00:00Z')), { y: 2026, m: 11, d: 25 });
    // Monday 3:00 AM: still Friday
    assert.deepEqual(cal.lastTradingDate(new Date('2026-11-23T08:00:00Z')), { y: 2026, m: 11, d: 20 });
  });
}

test('the server and the browser agree on every hour of four years', () => {
  for (let t = Date.UTC(2025, 0, 1); t < Date.UTC(2029, 0, 1); t += 3_600_000 + 60_000) {
    const d = new Date(t);
    assert.equal(server.marketStateAt(d), browser.marketStateAt(d), d.toISOString());
    assert.equal(server.sessionKeyAt(d), browser.sessionKeyAt(d), d.toISOString());
  }
});
