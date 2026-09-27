// Asphalt 9 style menu transitions, built on the Web Animations API.
//
// Screens mark their elements with data attributes (the ui/ components render these), and the
// engine animates them in and out. Timings come from a frame-by-frame study of in-game footage:
//   exit:  pressed button flashes, elements wash out toward white with a random stagger, hard cut
//   enter: top bar rebuilds from the center, titles are revealed behind a moving pink block,
//          panels appear as solid blocks then wash into their content, rows slide in from the
//          right, and stat bars / rank badges land last.
//
//   data-a9="text"   RevealText: pink block sweeps across, text revealed behind it (data-a9-dir)
//   data-a9="panel"  solid block wipes in, then washes into content (needs a .a9-wash child)
//   data-a9="slide"  slides in from the right through a white wash
//   data-a9="pop"    scales in with an overshoot
//   data-a9="fade"   fades in
//   data-a9="bar"    progress fill grows from 0 to its inline transform
//   data-a9-delay    optional absolute start time in ms
//   data-a9-tile     top bar tile; value is its distance from the center tile

export type A9Kind = "text" | "panel" | "slide" | "pop" | "fade" | "bar";

const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const EASE_IN_OUT = "cubic-bezier(0.65, 0, 0.35, 1)";

// When each kind starts on enter, and how far apart siblings of that kind are staggered
const ENTER_TIMING: Record<A9Kind, { base: number; stagger: number }> = {
  text: { base: 120, stagger: 70 },
  panel: { base: 150, stagger: 70 },
  slide: { base: 240, stagger: 45 },
  fade: { base: 220, stagger: 40 },
  bar: { base: 520, stagger: 70 },
  pop: { base: 560, stagger: 90 },
};

// Nested elements start this long after the element that contains them
const NESTED_DELAY = 140;

const running = new WeakMap<Element, Animation[]>();

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function track(owner: Element, animation: Animation): Animation {
  const list = running.get(owner) ?? [];
  list.push(animation);
  running.set(owner, list);
  return animation;
}

function cancelOwned(owner: Element) {
  running.get(owner)?.forEach((a) => a.cancel());
  running.delete(owner);
}

// Resolves when every animation is done, or when they are scheduled to be done. The timer keeps
// navigation moving when the browser stops ticking animations (e.g. a background tab).
function settle(animations: Animation[]): Promise<void> {
  const end = Math.max(0, ...animations.map((a) => Number(a.effect?.getComputedTiming().endTime ?? 0)));
  const finished = Promise.all(animations.map((a) => a.finished.catch(() => undefined)));
  return Promise.race([finished, new Promise((resolve) => setTimeout(resolve, end + 100))]).then(() => undefined);
}

function wash(el: HTMLElement): HTMLElement | null {
  return el.querySelector<HTMLElement>(":scope > .a9-wash");
}

function enterElement(owner: Element, el: HTMLElement, kind: A9Kind, delay: number): Animation[] {
  const out: Animation[] = [];
  const add = (target: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) =>
    out.push(track(owner, target.animate(keyframes, { fill: "backwards", ...options, delay })));

  switch (kind) {
    case "text": {
      const bar = el.querySelector<HTMLElement>(":scope > .a9-text__bar");
      const content = el.querySelector<HTMLElement>(":scope > .a9-text__content");
      if (!bar || !content) break;
      const rtl = el.dataset.a9Dir === "rtl";
      const [near, far] = rtl ? ["100% 50%", "0% 50%"] : ["0% 50%", "100% 50%"];
      const hidden = rtl ? "inset(0 0 0 100%)" : "inset(0 100% 0 0)";
      const shown = "inset(0 0 0 0)";
      // Longer text takes a little longer, like the game's title wipes
      const duration = Math.min(620, 300 + (content.textContent?.length ?? 0) * 11);
      const split = 0.38;
      // Phase 1: pink block grows to cover the text. Phase 2: it shrinks toward the far edge,
      // uncovering the text behind its trailing edge.
      add(
        bar,
        [
          { transform: "scaleX(0)", transformOrigin: near, offset: 0, easing: EASE_OUT },
          { transform: "scaleX(1)", transformOrigin: near, offset: split },
          { transform: "scaleX(1)", transformOrigin: far, offset: split, easing: EASE_IN_OUT },
          { transform: "scaleX(0)", transformOrigin: far, offset: 1 },
        ],
        { duration },
      );
      add(
        content,
        [
          { clipPath: hidden, offset: 0 },
          { clipPath: hidden, offset: split, easing: EASE_IN_OUT },
          { clipPath: shown, offset: 1 },
        ],
        { duration },
      );
      break;
    }
    case "panel": {
      add(el, [{ transform: "scaleX(0)", transformOrigin: "0% 50%" }, { transform: "scaleX(1)", transformOrigin: "0% 50%" }], {
        duration: 230,
        easing: EASE_OUT,
      });
      const w = wash(el);
      if (w) add(w, [{ opacity: 1 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }], { duration: 560, easing: "ease-out" });
      break;
    }
    case "slide": {
      add(el, [{ transform: "translateX(72px)", opacity: 0 }, { transform: "translateX(0)", opacity: 1 }], {
        duration: 440,
        easing: EASE_OUT,
      });
      const w = wash(el);
      if (w) add(w, [{ opacity: 0.85 }, { opacity: 0 }], { duration: 520, easing: "ease-out" });
      break;
    }
    case "pop":
      add(
        el,
        [
          { transform: "scale(0.4)", opacity: 0 },
          { transform: "scale(1.12)", opacity: 1, offset: 0.6 },
          { transform: "scale(1)", opacity: 1 },
        ],
        { duration: 380, easing: EASE_OUT },
      );
      break;
    case "fade":
      add(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: "ease-out" });
      break;
    case "bar":
      // Grows left to right from empty to the element's own inline transform. The offset is
      // required: a lone keyframe otherwise counts as the end, making the bar shrink then snap back.
      add(el, [{ transform: "scaleX(0)", offset: 0 }], { duration: 900, easing: EASE_OUT });
      break;
  }
  return out;
}

/** Animate every marked element inside `root` into view. Resolves when all are settled. */
export function enterScreen(root: HTMLElement): Promise<void> {
  cancelOwned(root);
  const animations: Animation[] = [];
  const reduce = prefersReducedMotion();

  const bg = root.querySelector<HTMLElement>("[data-a9-bg]");
  if (bg) animations.push(track(root, bg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduce ? 150 : 260, fill: "backwards" })));

  const counters: Partial<Record<A9Kind, number>> = {};
  const delays = new Map<Element, number>();

  root.querySelectorAll<HTMLElement>("[data-a9]").forEach((el) => {
    const kind = el.dataset.a9 as A9Kind;
    if (!(kind in ENTER_TIMING)) return;

    if (reduce) {
      animations.push(track(root, el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, fill: "backwards" })));
      return;
    }

    const index = (counters[kind] = (counters[kind] ?? -1) + 1);
    let delay = el.dataset.a9Delay ? Number(el.dataset.a9Delay) : ENTER_TIMING[kind].base + index * ENTER_TIMING[kind].stagger;

    const parent = el.parentElement?.closest("[data-a9]");
    if (parent && root.contains(parent) && delays.has(parent)) delay = Math.max(delay, delays.get(parent)! + NESTED_DELAY);
    delays.set(el, delay);

    animations.push(...enterElement(root, el, kind, delay));
  });

  return settle(animations);
}

/** Wash every marked element in `root` out of view. Leaves them hidden until the next enter. */
export function exitScreen(root: HTMLElement): Promise<void> {
  cancelOwned(root);
  const animations: Animation[] = [];
  const reduce = prefersReducedMotion();
  const add = (el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) =>
    animations.push(track(root, el.animate(keyframes, { fill: "forwards", ...options })));

  // Only outermost marked elements; nested ones go with their container
  const targets = [...root.querySelectorAll<HTMLElement>("[data-a9]")].filter((el) => {
    const parent = el.parentElement?.closest("[data-a9]");
    return !parent || !root.contains(parent);
  });

  targets.forEach((el) => {
    if (reduce) {
      add(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 120 });
      return;
    }
    const delay = Math.floor(Math.random() * 90);
    // Text is covered by the pink block again before it goes, like the original site
    if (el.dataset.a9 === "text") {
      const bar = el.querySelector(":scope > .a9-text__bar");
      if (bar) add(bar, [{ transform: "scaleX(0)", transformOrigin: "0% 50%" }, { transform: "scaleX(1)", transformOrigin: "0% 50%" }], { duration: 110, delay, easing: EASE_OUT });
    }
    add(
      el,
      [
        { opacity: 1, filter: "brightness(1)" },
        { opacity: 1, filter: "brightness(1.8) saturate(0.4)", offset: 0.5 },
        { opacity: 0, filter: "brightness(2.4) saturate(0)" },
      ],
      { duration: 200, delay: delay + 60, easing: "ease-in" },
    );
  });

  const bg = root.querySelector("[data-a9-bg]");
  if (bg) add(bg, [{ opacity: 1 }, { opacity: 0 }], { duration: 140, delay: reduce ? 0 : 180 });

  return settle(animations);
}

/** Rebuild the top bar from the center outward: each tile lands as a white block, then washes in. */
export function enterTopBar(bar: HTMLElement): Promise<void> {
  cancelOwned(bar);
  const animations: Animation[] = [];
  const add = (el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) =>
    animations.push(track(bar, el.animate(keyframes, { fill: "backwards", ...options })));

  if (prefersReducedMotion()) {
    add(bar, [{ opacity: 0 }, { opacity: 1 }], { duration: 150 });
    return settle(animations);
  }

  const strip = bar.querySelector("[data-a9-strip]");
  if (strip) add(strip, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 240, easing: EASE_OUT });

  bar.querySelectorAll<HTMLElement>("[data-a9-tile]").forEach((tile) => {
    const delay = 60 + Number(tile.dataset.a9Tile) * 45;
    add(tile, [{ transform: "scaleX(0)", opacity: 0 }, { transform: "scaleX(1)", opacity: 1 }], { duration: 180, delay, easing: EASE_OUT });
    const w = wash(tile);
    if (w) add(w, [{ opacity: 1 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }], { duration: 420, delay, easing: "ease-out" });
  });

  const flash = bar.querySelector(".a9-flash");
  if (flash) add(flash, [{ opacity: 0.9 }, { opacity: 0 }], { duration: 260 });

  return settle(animations);
}

/** Collapse the top bar into its center with a white flash (the original site's curtain). */
export function exitTopBar(bar: HTMLElement): Promise<void> {
  cancelOwned(bar);
  const animations: Animation[] = [];
  const reduce = prefersReducedMotion();
  animations.push(
    track(
      bar,
      bar.animate([{ clipPath: "inset(0 0 0 0)" }, { clipPath: "inset(0 50% 0 50%)" }], {
        duration: reduce ? 100 : 220,
        easing: "cubic-bezier(0.7, 0, 0.84, 0)",
        fill: "forwards",
      }),
    ),
  );
  const flash = bar.querySelector(".a9-flash");
  if (flash && !reduce)
    animations.push(track(bar, flash.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 220 })));
  return settle(animations);
}

/** Quick brightness flash on a pressed button (the game's pressed NEXT/PLAY). */
export function pressFlash(el: HTMLElement) {
  if (prefersReducedMotion()) return;
  el.animate([{ filter: "brightness(1)" }, { filter: "brightness(1.45) saturate(0.7)", offset: 0.25 }, { filter: "brightness(1)" }], {
    duration: 220,
    easing: "ease-out",
  });
}

/** Side-to-side shake for invalid input. */
export function shake(el: HTMLElement) {
  if (prefersReducedMotion()) return;
  el.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-8px)" },
      { transform: "translateX(7px)" },
      { transform: "translateX(-5px)" },
      { transform: "translateX(3px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 360, easing: "ease-out" },
  );
}
