import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { waitForActivity } from '../server/activity.js';

// Load the browser module with its TypeScript dependency resolved for Node's test runner.
const source = (await readFile(new URL('../src/lib/stream.ts', import.meta.url), 'utf8'))
  .replace('"./activity"', JSON.stringify(new URL('../src/lib/activity.ts', import.meta.url).href));
const { stripTypeScriptTypes } = await import('node:module');
const { openStream } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);

let streams, timers, failures, focused;
beforeEach(() => {
  streams = [];
  timers = new Map();
  failures = [];
  focused = true;
  let nextTimer = 0;
  globalThis.window = new EventTarget();
  window.setTimeout = (fn) => { timers.set(++nextTimer, fn); return nextTimer; };
  window.clearTimeout = (id) => timers.delete(id);
  globalThis.document = new EventTarget();
  document.visibilityState = 'visible';
  document.hasFocus = () => focused;
  globalThis.EventSource = class extends EventTarget {
    static CLOSED = 2;
    readyState = 1;
    constructor(url) { super(); this.url = url; streams.push(this); }
    close() { this.readyState = EventSource.CLOSED; }
  };
});

const connect = () => openStream('/watchlist/stream', {}, (up) => failures.push(up));
const blur = () => { focused = false; window.dispatchEvent(new Event('blur')); };
const focus = () => { focused = true; window.dispatchEvent(new Event('focus')); };

test('switching windows closes the stream and stops watchdog/retry timers until return', () => {
  const close = connect();
  assert.equal(streams.length, 1);
  streams[0].readyState = EventSource.CLOSED;
  streams[0].onerror();
  blur();
  assert.equal(streams[0].readyState, EventSource.CLOSED);
  assert.equal(timers.size, 0);
  assert.equal(streams.length, 1);
  focus();
  focus();
  assert.equal(streams.length, 2, 'resume opens exactly one fresh stream');
  close();
  focus();
  assert.equal(streams.length, 2, 'unmounted streams cannot resume');
  assert.equal(timers.size, 0);
});

test('hidden tabs stay suspended even if a focus event arrives; visibility alone is not focus', () => {
  const close = connect();
  document.visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  focus();
  assert.equal(streams.length, 1);
  blur();
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(streams.length, 1);
  focus();
  assert.equal(streams.length, 2);
  assert.deepEqual(failures, [], 'intentional suspension is not a connection failure');
  close();
});

test('a page initially in the background never opens update streams', () => {
  focused = false;
  const close = connect();
  assert.equal(streams.length, 0);
  assert.equal(timers.size, 0);
  focus();
  assert.equal(streams.length, 1);
  close();
});

test('pagehide closes the stream; restored pages resume only when active', () => {
  const close = connect();
  window.dispatchEvent(new Event('pagehide'));
  assert.equal(streams[0].readyState, EventSource.CLOSED);
  assert.equal(timers.size, 0);
  window.dispatchEvent(new Event('pageshow'));
  assert.equal(streams.length, 2);
  close();
});

test('late events from the previous connection cannot update a resumed page', () => {
  let updates = 0;
  const close = openStream('/market-news/stream', { feed: () => updates++ }, () => {});
  blur();
  focus();
  streams[0].dispatchEvent(new MessageEvent('feed', { data: '{}' }));
  assert.equal(updates, 0);
  streams[1].dispatchEvent(new MessageEvent('feed', { data: '{}' }));
  assert.equal(updates, 1);
  close();
});

test('server checkpoints stay paused across elapsed intervals and resume when a page returns', async () => {
  let clients = 0;
  let checks = 0;
  await waitForActivity(() => clients > 0, async () => {
    checks++;
    assert.equal(clients, 0);
    if (checks === 5) clients = 1;
  });
  assert.equal(checks, 5);
});

test('another active page or enabled background mode allows the next server step', async () => {
  for (const [clients, background] of [[1, false], [0, true]]) {
    await waitForActivity(() => clients > 0 || background, () => assert.fail('must not pause'));
  }
  let background = false;
  await waitForActivity(() => background, async () => { background = true; });
});
