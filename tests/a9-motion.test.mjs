import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enterScreen, exitScreen, fadeScreen } from '../src/animation/a9.ts';

const calls = [];
let reduced = false;
globalThis.window = { matchMedia: () => ({ matches: reduced }) };
class Element {
  constructor(kind, visible = true, parent = null) {
    this.dataset = { a9: kind };
    this.visible = visible;
    this.parentElement = parent;
  }
  getClientRects() { return this.visible ? [{}] : []; }
  closest() { return this; }
  querySelector() { return null; }
  animate(frames, options) {
    calls.push({ owner: this, frames, options });
    return {
      finished: Promise.resolve(), cancel() {},
      effect: { getComputedTiming: () => ({ endTime: (options.delay ?? 0) + options.duration }) },
    };
  }
}
function root(elements) {
  return { querySelector: () => null, querySelectorAll: () => elements, contains: el => elements.includes(el) };
}

test('a full garage finishes entering within 1.25 seconds, including nested rows', async () => {
  calls.length = 0;
  const panel = new Element('panel');
  const elements = [panel, ...Array.from({ length: 90 }, () => new Element('slide', true, panel))];
  await enterScreen(root(elements));
  assert.equal(calls.length, 91);
  assert.ok(Math.max(...calls.map(c => c.options.delay + c.options.duration)) <= 1250);
});

test('hidden controls do not use stagger slots', async () => {
  calls.length = 0;
  const visible = new Element('slide');
  await enterScreen(root([...Array.from({ length: 60 }, () => new Element('slide', false)), visible]));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.delay, 180);
});

test('panel reveals preserve content geometry', async () => {
  calls.length = 0;
  await enterScreen(root([new Element('panel')]));
  assert.ok(calls[0].frames.every(frame => !frame.transform));
  assert.equal(calls[0].frames.at(-1).clipPath, 'inset(0 0 0 0)');
});

test('reduced motion uses short fades and no stagger or transforms', async () => {
  reduced = true;
  calls.length = 0;
  const screen = root([new Element('panel'), new Element('pop')]);
  await enterScreen(screen);
  await exitScreen(screen);
  assert.ok(calls.every(c => c.options.duration <= 180 && !c.options.delay));
  assert.ok(calls.every(c => c.frames.every(frame => !frame.transform && !frame.filter)));
  reduced = false;
});

test('scan entrance and exit animate only whole-surface opacity', async () => {
  calls.length = 0;
  const surface = new Element('panel');
  await fadeScreen(surface, true, 420);
  await fadeScreen(surface, false, 700);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].frames, [{ opacity: 0 }, { opacity: 1 }]);
  assert.deepEqual(calls[1].frames, [{ opacity: 1 }, { opacity: 0 }]);
  assert.equal(calls[0].options.fill, 'backwards');
  assert.equal(calls[1].options.fill, 'forwards');
});
