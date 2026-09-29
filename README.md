# Project Momentum

The official React version of Project Momentum: a day-trading stock momentum screener, designed after the menus of the mobile game Asphalt 9: Legends and meant to grow into a full investing app. It keeps the functionality of the original vanilla JavaScript site in `../ProjectMomentum/`.

## Stack

- **Frontend:** React 19 + TypeScript, built with Vite.
- **Backend (`server/`):** Express server that serves the built site. It has Yahoo Finance quotes (`/analyze`) and **Legend**, the AI analyst (`/legend`, `/legend/example`, `/legend/status`), which runs on a local LM Studio server.

## Running locally

```sh
npm install
npm --prefix server install
cp server/.env.example server/.env   # optional: Legend's LM Studio address and model
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
  App.tsx                 screen state machine (start → loading → summary), navigation, data flow
  animation/a9.ts         Asphalt 9 transition engine (Web Animations API)
  audio/sfx.ts            UI sound effects (Web Audio) and the mute setting
  ui/                     design-system pieces: Button, Chip, Reveal, RevealText, SectionTitle,
                          Segmented, Dialog, Diamond (loading indicator), Icons, Logo
  components/             app pieces: TopBar, ModeBar, StatRow, RankBlock, LegendPanel, LegendBanner,
                          LastScanCard, Field, NumberField
  pages/                  Splash, StartPage, LoadingPage, SummaryPage
  lib/                    clock + market sessions, API calls, number helpers, count-up hook, types
  styles/                 base.css (tokens, fonts), a9.css (animated elements), ui.css, screens.css
public/images/bg          map textures (from the original's unused "Asphalt Style Background" images)
public/images/icons       stat icons
public/sfx                sound effects, trimmed of leading silence and level-matched (sources: ../SFX)
server/                   Express backend (server.js) and Legend's LM Studio client (legend.js)
```

## Design system

**Strictly Asphalt 9: Legends (2018–2024), not the newer Asphalt Legends Unite.** Colors and surfaces are sampled from the reference screenshots and footage in `../Asphalt 9 UI:UX/`. Don't add glassy blur, soft drop shadows, glows or dark purple/black menus. Keep the look boxy and clean: square blocks, with no slanted chips or irregular shapes. Use diagonals only where the game itself has them (lock tabs, dialog close tab, title-screen stripes). The site has no logo yet, so don't invent one.

- **Colors:** `#1B212B` dark, `#FF0054` pink, `#C3FB12` lime, `#3F4B57` slate (tokens in `styles/base.css`).
- **Surfaces:** menus sit on deep navy (`#03132B`–`#061A3A`) with lighter blue toward the top-left. Panels are flat navy. The summary and settings screens use the same background as the home screen. Purple map backgrounds are used only for the loading screen, like the game's career map.
- **Top bar:** tiles are anchored to the right edge and run right to left: gear (home screen) or home (other screens), the wide market-session tile (lime when open, yellow pre-market/after hours, navy when closed), the date and clock counter tiles, then the Legend token counter. **New tiles are added on the left end.** Tiles have fixed widths (clock/date 168px, status 320px, tokens 214px, gear/home 80px) that don't change with the window. The rest of the bar is tile-colored space reserved for future tiles, plus the white back triangle on sub-screens. There's no page-title tile; screens carry their own "| TITLE" headings. The gear is a single solid path with six chunky teeth, with no SVG masks or gradients, since Safari could drop those when the icon re-mounts.
- **Loading diamond** (`ui/Diamond`): a black diamond with a dark rim and a thin grey inner outline. A pink comet rides clockwise along the diamond's outer edge, with a white-hot head, a fading tail and a pink glow washing into the interior. It was modelled on close-ups of the game's indicator.
- **Cursor:** the game's pink arrow cursor (`public/cursors/pointer.png` and `@2x`, tip at 5,4) is used everywhere, including buttons and links. Text fields keep the text I-beam.
- **Warnings:** `ui/Dialog` follows the CUSTOMER CARE / CONNECTION ERROR dialogs: a dark `#0D1728` header with a white top rule, a pink close tab with a dark diagonal edge, a blue gradient body with centered text, and a white action button (e.g. RETRY). `ui/Notice` is the pink-bordered "NOT AVAILABLE AT THIS MOMENT" box. `Dialog variant="info"` has a navy, left-aligned body for details such as the score breakdown.
- **Type:** Rajdhani 400–700, uppercase. Big numbers use a slanted HUD style made with `transform: skewX(-10deg)`. Rajdhani has no italic, and browser-faked italics get clipped in Safari.
- **Buttons:** `buy` (lime), `normal` (white, like GET BLUEPRINT / UPGRADES) and `ghost`. Each has a corner notch, a pressed state and striped disabled styling.
- **Blocks:** solid label chips (`01 | MARKET SCANNER`), pink-bar section titles, settings-style segmented toggles, and navy panels.

Build new screens from `ui/` and wrap elements in `Reveal`/`RevealText` so they get the transitions for free.

## Animations

`animation/a9.ts` reproduces the game's menu transitions, based on a frame-by-frame study of reference footage:

- **Exit:** the pressed button flashes. Text is covered by pink blocks again, and panels wash out toward white with a random stagger. The top bar collapses into its center with a white flash.
- **Enter:** the background fades up and the top bar rebuilds tile by tile from the center. Titles are revealed behind a moving pink block (subtitles sweep the other way). Panels appear as solid white blocks and then wash into their content. Rows slide in from the right, and stat bars, numbers and badges land last.
- **Summary:** stat values and the price count up. The rank counts to its score, then the class letter slams in with a pink burst.

Elements opt in with `data-a9` attributes, which `Reveal`, `RevealText` and the top-bar tiles render. `prefers-reduced-motion` switches everything to short fades. A timer fallback keeps navigation moving even if the browser pauses animations (e.g. in a background tab).

## Sounds

| Sound | Plays on |
| --- | --- |
| `launch` (LaunchSyleButton1) | lime SUBMIT buttons, leaving the splash |
| `race` (ScreenSwitchSoundBeforeRace) | going into the loading screen before results |
| `switch` (ScreenSwitchSound1) | other screen changes |
| `click` (Button_1) | BACK, home, dialogs |
| `tap` (Button_2) | toggles, dev buttons, invalid input, the class letter landing |

Sound is **off by default**. The speaker tile in the top bar turns it on, and the choice is remembered. Browsers only start audio after the first click or key press.

## Screens

- **Title screen:** a full-bleed background with light stripes in the top-right corner, the title low and centered, and the loading diamond bottom-right. Tap or press a key to start. It shows once per browser session and can be turned off in Settings. The game uses a car photo here; a photo can replace the map texture in `.splash__bg`.
- **Home (Market Scanner):** laid out like the game's home screen.
  - Top-left: the `01 | MARKET SCANNER` tag and the last-scan card (click to reopen it).
  - Center: greeting, date, HUD clock and the countdown to the next market session.
  - Right pane: Quick Scan, with the search field, SUBMIT in PLAY style, and dev options collapsed by default. The pane scrolls on its own.
  - Bottom: a full-width mode bar with Market Scanner first (active, left), followed by the planned features as locked tiles.
- **Settings:** styled like SOUND & DISPLAY, opened from the gear tile. It has the SFX volume slider and toggles for sound effects, title screen, dev options and AI dry run. When dev options are enabled, **RESTART FROM TITLE SCREEN** reloads the page into the title screen even if it was already seen this session or is disabled, which is handy for testing the intro. There's no access control yet (testing only).
- **Loading:** a pre-race style screen that covers the whole scan, with a step list. First the quote is fetched (or "USING MANUAL ENTRY" for dev entries). Then Legend ranks the setup. It stays up at least 1.4 s, pausing briefly once both steps are done. If the quote fails, a CONNECTION ERROR dialog opens. If Legend fails, the summary still opens with Legend marked offline.
- **Summary:** plays its reveal once everything is ready: stats and price count up, Legend's verdict and readout rows build in, the rank counts to Legend's score, and the class letter lands. Laid out like the garage car-stats screen. It has the company nameplate, stat rows with cyan bars growing left to right, the price sitting on the turntable, the rank/class block, the Legend panel, and the Legend banner with a white BACK button.
- **Dialog:** failed scans open a CONNECTION ERROR warning with RETRY instead of `alert()`.

## Legend (AI analyst)

Legend replaces the original Gemini integration. It's styled after the game's Legend Pass, with the gold kept to accents. The analysis runs on the loading screen: quote, then news search, then Legend. The summary then plays the reveal.

**How a scan is analyzed:**

1. **Metrics** (`server/legend.js`): change %, relative volume, float turnover %, dollar volume.
2. **Quant score** (`server/scoring.js`, 0–1600), straight from the numbers. It uses a day-trading momentum profile: gap 450, relative volume 450, float 350 (smaller is better), price range 150 ($2–$20 is best) and float turnover 200. Volume on a falling stock is faded (selling pressure), and names trading under $1M are scaled down.
3. **News retrieval**, the RAG step (`server/news.js`):
   - Recent stories come from Yahoo Finance (`yahoo-finance2` search) and Google News RSS, from the last 7 days.
   - They're ranked by relevance (ticker or company named in the headline, tagged tickers) plus recency.
   - Duplicates and quote-page junk are removed, and the top 8 are kept.
   - The top 5 get their article summary and opening paragraphs fetched.
   - Results are cached for 5 minutes per symbol, and STCK/TEST are skipped.
   - `NEWS_SOURCES` (e.g. `yahoo`) and `NEWS_MAX_AGE_DAYS` configure it. The Google News feed's terms allow personal, non-commercial use.
4. **Legend's judgment** (LM Studio, strict JSON schema). The model gets the metrics, the quant score, a suggested rating and the numbered news sources. It decides only:
   - catalyst strength (none / weak / moderate / strong / major)
   - event risk level (none / minor / moderate / severe / critical) with source-backed risk flags
   - news sentiment
   - up to 4 key stories with an impact line
   - the rating and the short written read (headline, news, conviction, efficiency, risks)
5. **Final score** = quant + catalyst bonus (0 to +400) + risk penalty (0 to −600), clamped to 0–2000. News can move a score a lot, e.g. a strong catalyst adds 330 and an offering subtracts 450. The rating is kept unless it contradicts the price direction.

**Endpoints:**
- `GET /news?symbol=&company=`: the ranked stories.
- `POST /legend { stockData, marketState, news }`: fetches the news itself if `news` is omitted.
- `POST /legend/example`: dry run, with a real quant breakdown and no model call.
- `GET /legend/status`

**In the app:**
- The loading screen steps through quote → "N RECENT STORIES FOUND" → Legend. Under the steps, a source carousel cycles the site icons being searched (Yahoo Finance, Google News) and then the publishers Legend is reading, merry-go-round style: the tiles ride an ellipse driven by `requestAnimationFrame` (transforms and opacity only), with the current site in front at full size with a gold frame and "LEGEND IS READING <PUBLISHER>". Tiles further round shrink and dim, but the front tile is never scaled up, so the icons stay crisp. The ring spins up gently and brakes forward onto a site, never snapping backwards, then settles on "N SOURCES READ". Icons come from `GET /favicon?domain=`, which the server fetches once and caches, so the page only talks to this server. The bottom-right diamond is the screen's only loading indicator.
- The summary shows Legend's panel (verdict, then the NEWS · sentiment · catalyst row, conviction, efficiency and risks). The **"i" box** after the rank's class letter (where the game's rank block has its small icon box) opens the **SCORE BREAKDOWN** in an info dialog: each quant component, the catalyst bonus, any risk penalty and the total.
- The **LATEST NEWS** strip shows the stories as cards: thumbnail, publisher, age and headline. Legend's key stories come first, with its sentiment and impact line, and each card opens the article.

**Possible next step:** an embedding model in LM Studio (e.g. nomic-embed-text) could rank passages from longer articles or across many stocks. It isn't needed for single-stock news today.

## Legend tokens (A-tokens)

Like the game's A-tokens, **Legend tokens** count the AI tokens Legend uses.

- **Recording** (`server/usage.js`): every analysis adds LM Studio's reported `usage` (prompt, completion, total) to a per-day tally in `server/data/token-usage.json`. The file is git-ignored; set `LEGEND_USAGE_FILE` to move it. Days use the server's local time, and weeks start on Monday. Dry runs don't use tokens.
- **Allowance:** unlimited for now (`LEGEND_DAILY_TOKENS` empty), shown as `/∞`.
- **Endpoint:** `GET /legend/usage` returns `{ dailyLimit, today, week, month, lifetime, since }`. Each period has `{ tokens, prompt, completion, requests }`.
- **Top bar:** the token tile shows today's usage as `643/∞` with the blue token icon and a lime "+". When the total grows, it rolls up from the old value (the token bobs and the "+" glows). It refreshes on load, every minute, and once the summary is on screen after each analysis.
- **Tokens screen:** clicking the tile opens a screen styled like the game's token shop, with a vertical TOKENS label and four yellow cards: TODAY (LIVE ribbon), THIS WEEK, THIS MONTH and LIFETIME (ALL TIME ribbon). Each card shows the token count, scans, input/output split and a token pile that grows with the period, over a lime period bar. Back returns to the screen you came from.

## Behavior changes from the original

The Asphalt 9 redesign replaced the original layout and animation engine. The functionality is the same, with these deliberate changes:

- K/M/B shorthand works in uppercase too (e.g. `1.25K`), and values with more than two decimals expand correctly.
- The midnight hour shows as `12`, not `0`. The weekend check no longer lags one tick behind.
- Google Gemini is replaced by Legend on LM Studio. It returns structured sections (verdict, conviction, efficiency, risks) instead of one block of text. The panel shows its working state while loading and an "unavailable" notice when the request fails.
- A stale Legend response can't overwrite a newer stock's summary.
- Disabled SUBMIT buttons are actually disabled. Navigation requests during a transition are queued, not run on top of each other.
- The ticker shows the symbol returned by the server (uppercase).
- An empty ticker shakes the field and shows an inline error instead of `alert()`. Fetch errors open a dialog.
- Stat bars are capped at full width (the original overflowed a clipped container, so this looks the same).
- The session countdown uses weekday session times in the device's local time zone and ignores market holidays.
- The layout adapts to window width *and* height. The home screen's type, clock, spacing and mode bar scale by whichever is tighter, so short laptop windows fit without overlap. The corner card sits in the layout flow, and very short windows scroll. Checked at 1920×1080, 1512×860, 1512×620, 1280×720, 1024×640, 1000×613, 820×1180 and 375×812.
- Settings (sound, volume, title screen, dev options) are saved in the browser's localStorage.
