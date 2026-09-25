# Project Momentum

The official React version of Project Momentum: a day-trading stock momentum screener with an Asphalt 9 style interface. It is a faithful port of the original vanilla JavaScript site in `../ProjectMomentum/`.

## Stack

- **Frontend:** React 19 + TypeScript, built with Vite.
- **Backend (`server/`):** Express server that serves the built site, with Yahoo Finance (`/analyze`) and Google Gemini (`/generate`, `/generateExample`) endpoints, carried over unchanged from the original.

## Running locally

```sh
npm install
npm --prefix server install
cp server/.env.example server/.env   # add your Gemini API_KEY
npm run build                         # build the site into dist/
npm run server                        # site + API on http://localhost:3000
```

The Express server serves the built site and the API from the same origin. It listens on `PORT` (default 3000). If that port is taken, it falls back to `FALLBACK_PORT` (default 3001).

For live-reload development, run `npm run dev` (http://localhost:5173) while the server is running. Vite proxies the API routes to port 3000. To point the site at a different backend, set `VITE_API_URL` (see `.env.example`).

Checks: `npm run typecheck` and `npm run build`.

## Running with pm2

The site runs as the pm2 process `project-momentum`, defined in `ecosystem.config.cjs`:

```sh
npm run build && pm2 restart project-momentum   # deploy frontend changes
pm2 restart project-momentum                    # after server changes
pm2 logs project-momentum                       # view logs
pm2 save                                        # after adding/removing processes, so they come back on reboot
```

Starting at boot uses pm2's launchd agent (`pm2 startup`, which requires sudo once) plus the saved process list in `~/.pm2/dump.pm2`.

## Structure

```
src/
  animation/AnimationEngine.ts   Asphalt 9 page transitions (ported line-for-line)
  components/                    TopBar, StartPage, SummaryPage, SummaryBox, GeminiSummary, NumberField
  lib/                           clock + market session, API calls, number helpers, types
  styles/                        original CSS, unchanged
public/images, public/fonts      original assets
server/                          Express backend
```

## Animations

The Asphalt 9 transitions are the original engine's code. It still toggles the same CSS classes (`animatedBox`, `animatedCloak`, `curtainClose`, the flash box) with the same timings, forced reflows and random 1–100 ms box stagger. React owns the content, and the engine animates the elements React renders. Keep the class names on these elements static in JSX so React never overwrites the classes the engine adds.

The original `index.html` had a stray closing `</div>` that placed the summary page and the first footer outside `#appContainer`. The summary layout was tuned around that, so `App.tsx` deliberately reproduces the same element tree.

## Behavior changes from the original

These are deliberate bug fixes. Everything else is intended to match the original.

- K/M/B shorthand works in uppercase too (e.g. `1.25K`), and values with more than two decimals expand correctly.
- The midnight hour shows as `12`, not `0`. The weekend check no longer lags one tick behind.
- The Gemini title shows "Gemini Is Working..." while loading. The original immediately overwrote it. A failed Gemini request now shows "Gemini Is Unavailable" instead of spinning forever.
- A stale Gemini response can't overwrite a newer stock's summary.
- Disabled SUBMIT buttons are actually disabled, and navigation clicks during a transition are ignored.
- The ticker shows the symbol returned by the server (uppercase).
- The summary section is centered with auto margins, so it is centered in every browser. The original relied on `justify-self: center` on a block element, which only newer Chromium supports; other browsers, like Safari, left-aligned the section.
