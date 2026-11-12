import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NavigationHistory } from '../src/lib/navigationHistory.ts';

test('Back retraces nested screens and retains reader and stock context', () => {
  const history = new NavigationHistory();
  const visits = [
    { screen: 'start' },
    { screen: 'news', story: null },
    { screen: 'news', story: { id: 'story-1' } },
    { screen: 'summary', stock: { symbol: 'AAPL' } },
    { screen: 'watchlist' },
  ];
  visits.forEach(visit => history.push(visit));
  for (const visit of [...visits].reverse()) assert.deepEqual(history.pop(), visit);
  assert.equal(history.pop(), undefined);
});

test('a new path after Back does not reintroduce the screen that was left', () => {
  const history = new NavigationHistory();
  history.push('start');
  history.push('screener');
  assert.equal(history.pop(), 'screener');
  history.push('screener');
  history.push('news');
  assert.equal(history.pop(), 'news');
  assert.equal(history.pop(), 'screener');
  assert.equal(history.pop(), 'start');
  assert.equal(history.pop(), undefined);
});

test('history retains only the latest 30 visits', () => {
  const history = new NavigationHistory(30);
  for (let i = 0; i < 45; i++) history.push(i);
  for (let i = 44; i >= 15; i--) assert.equal(history.pop(), i);
  assert.equal(history.pop(), undefined);
});

test('Home clears the old navigation trail', () => {
  const history = new NavigationHistory();
  history.push('news');
  history.push('screener');
  history.clear();
  assert.equal(history.pop(), undefined);
  history.push('start');
  assert.equal(history.pop(), 'start');
  assert.equal(history.pop(), undefined);
});
