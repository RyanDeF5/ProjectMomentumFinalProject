# Alpha 9: Legends

**Alpha 9: Legends** (formerly Project Momentum) is the official React app: a day-trading stock momentum screener, designed after the menus of the mobile game Asphalt 9: Legends and meant to grow into a full investing app. It keeps the functionality of the original vanilla JavaScript site in `../ProjectMomentum/`.

## Stack

- **Frontend:** React 19 + TypeScript, built with Vite.
- **Backend (`server/`):** Express server that serves the built site. It has Yahoo Finance quotes (`/analyze`), **Legend**, the AI analyst (`/legend`, `/legend/example`, `/legend/status`), which runs on a local LM Studio server, and the live **watchlist** (`/watchlist`).

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

The site runs as the pm2 process `alpha-9-legends`, defined in `ecosystem.config.cjs`:

```sh
npm run build && pm2 restart alpha-9-legends   # deploy frontend changes
pm2 restart alpha-9-legends                    # after server changes
pm2 logs alpha-9-legends                       # view logs
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
                          Segmented, Dropdown, Dialog, Diamond (loading indicator), Glint, Sparkline, Logo, Icons
  components/             app pieces: TopBar, ModeBar, StatRow, RankBlock, LegendPanel, LegendBanner,
                          LastScanCard, WatchRail, WatchCard, WatchControl, Field, NumberField
  pages/                  Splash, StartPage, LoadingPage, SummaryPage, WatchlistPage, TokensPage, SettingsPage
  lib/                    clock + market sessions, API calls, number helpers, count-up hook, types
  styles/                 base.css (tokens, fonts), a9.css (animated elements), ui.css, screens.css,
                          watchlist.css
public/images/bg          map textures (from the original's unused "Asphalt Style Background" images)
public/images/icons       stat icons
public/sfx                sound effects, trimmed of leading silence and level-matched (sources: ../SFX)
server/                   Express backend (server.js), Legend's LM Studio client (legend.js), quotes.js,
                          news.js (RAG), usage.js (tokens), watchlist.js (live updates), screener.js,
                          progress.js (loading-bar steps and learned timings), fortune500.json
```

## Design system

**Strictly Asphalt 9: Legends (2018–2024), not the newer Asphalt Legends Unite.** Colors and surfaces are sampled from the reference screenshots and footage in `../Asphalt 9 UI:UX/`. Don't add glassy blur, soft drop shadows, glows or dark purple/black menus. Keep the look boxy and clean: square blocks, with no slanted chips or irregular shapes. Use diagonals only where the game itself has them (lock tabs, dialog close tab, title-screen stripes). The logo (`ui/Logo`, `LogoBadge`; also `public/favicon.svg`) follows the game's: the pink shield with a blocky white "9" (measured from the game's title screen: under the top loop a slot opens to the left into a V-shaped lower counter that follows the shield's point; the badge is 2.4× the wordmark's font size), ALPHA in wide silver caps and LEGENDS spaced out in pink. The wordmark uses Michroma (SIL OFL, `public/fonts/Michroma-Regular.ttf` with its licence). Don't invent other logos.

- **Colors:** `#1B212B` dark, `#FF0054` pink, `#C3FB12` lime, `#3F4B57` slate (tokens in `styles/base.css`).
- **Surfaces:** menus sit on deep navy (`#03132B`–`#061A3A`) with lighter blue toward the top-left. Panels are flat navy. The summary and settings screens use the same background as the home screen. Purple map backgrounds are used only for the loading screen, like the game's career map.
- **Top bar:** tiles are anchored to the right edge and run right to left: gear (home screen) or home (other screens), the wide market-session tile (lime when open, yellow pre-market/after hours, navy when closed), the date and clock counter tiles, then the Legend token counter, then the watchlist **ticker count** (candlestick icon and number of tickers, in the place of the game's garage car count; opens the watchlist). **New tiles are added on the left end.** Tiles have fixed widths (clock/date 168px, status 320px, tokens 214px, garage 124px, gear/home 80px) that don't change with the window. To stay clear of the back triangle, the status tile steps down to 220px below 1200px wide, the date tile is hidden below 1080px, both counters below 900px, and the garage tile on phones (below 560px). The rest of the bar is tile-colored space reserved for future tiles, plus the white back triangle on sub-screens. At the right end of that space sits the **connection signal** (see Connection and progress). There's no page-title tile; screens carry their own "| TITLE" headings. The gear is a single solid path with six chunky teeth, with no SVG masks or gradients, since Safari could drop those when the icon re-mounts.
- **Loading diamond** (`ui/Diamond`): a black diamond with a dark rim and a thin grey inner outline. A pink comet rides clockwise along the diamond's outer edge, with a white-hot head, a fading tail and a pink glow washing into the interior. It was modelled on close-ups of the game's indicator.
- **Cursor:** the game's pink arrow cursor (`public/cursors/pointer.png` and `@2x`, tip at 5,4) is used everywhere, including buttons and links. Text fields keep the text I-beam.
- **Warnings:** `ui/Dialog` follows the CUSTOMER CARE / CONNECTION ERROR dialogs: a dark `#0D1728` header with a white top rule, a pink close tab with a dark diagonal edge, a blue gradient body with centered text, and a white action button (e.g. RETRY). `ui/Notice` is the pink-bordered "NOT AVAILABLE AT THIS MOMENT" box. `Dialog variant="info"` has a navy, left-aligned body for details such as the score breakdown.
- **Type:** Rajdhani 400–700, uppercase. Big numbers use a slanted HUD style made with `transform: skewX(-10deg)`. Rajdhani has no italic, and browser-faked italics get clipped in Safari.
- **Buttons:** `buy` (lime), `normal` (white, like GET BLUEPRINT / UPGRADES) and `ghost`. Each has a corner notch, a pressed state and striped disabled styling.
- **Blocks:** solid label chips (`01 | MARKET SCANNER`), pink-bar section titles, settings-style segmented toggles, and navy panels.

Build new screens from `ui/` and wrap elements in `Reveal`/`RevealText` so they get the transitions for free.

## Animations

`animation/a9.ts` reproduces the game's menu transitions, based on a frame-by-frame study of reference footage:

- **Exit:** the pressed button flashes. Text is covered by pink blocks again, and panels wash out toward white with a short ordered stagger. The top bar collapses into its center with a white flash.
- **Enter:** the background fades up and the top bar rebuilds tile by tile from the center. Titles are revealed behind a moving pink block (subtitles sweep the other way). Panels reveal through a clipped white wipe without stretching their contents. Rows slide in 36px from the right, and stat bars, numbers and badges land last. Hidden controls do not consume stagger slots; all element delays are capped at 580ms so a full garage stays responsive.
- **Scan boundaries:** the home screen, top bar and bottom menu fade out together (260ms), then the fully composed loading screen fades in (420ms). Loading skips the menu wipes and pop animations. The revealed exchange photo remains mounted above the results and dissolves over them for 700ms; reduced motion uses 100ms fades.
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

- **Title screen:** like the game's title card: a full-bleed photo (the NYSE facade on Wall Street, softened with a slight blur and darkened toward the bottom), light stripes in the top-right corner, the ALPHA 9: LEGENDS logo low and centered, and the loading diamond bottom-right. Tap or press a key to start. It shows once per browser session and can be turned off in Settings.
- **Home (Market Scanner):** laid out like the game's home screen.
  - Top-left: the `01 | MARKET SCANNER` tag and the last-scan card (click to reopen it), with the live **watchlist** filling the column below (see Watchlist).
  - Center: greeting, date, HUD clock and the countdown to the next market session.
  - Right pane: Quick Scan, with the search field, SUBMIT in PLAY style (with the PLAY button's idle glint every 7 s), and dev options collapsed by default. The pane scrolls on its own.
  - Bottom: a full-width mode bar (`components/ModeBar`, mounted once in `App`) that belongs to the home screen, the watchlist and the stock screener. Market Scanner, Watch List and Stock Screener switch between them, with the active one white and marked in pink; planned features stay locked. Moving between those two screens never animates the bar out. On every other screen (loading, summary, settings, tokens) it slides down out of the window as the old screen exits, and slides back up when you return. Pages reserve its measured height only while it shows; smaller screens use a single horizontally scrollable row.
  - The greeting is sized to its own column (container units), so it never runs into the watchlist at any window size.
- **Settings:** styled like SOUND & DISPLAY, opened from the gear tile. It has the SFX volume slider and toggles for sound effects, title screen, dev options and AI dry run. When dev options are enabled, **RESTART FROM TITLE SCREEN** reloads the page into the title screen even if it was already seen this session or is disabled, which is handy for testing the intro. There's no access control yet (testing only).
- **Loading:** a pre-race style screen that covers the whole scan, with a step list. First the quote is fetched (or "USING MANUAL ENTRY" for dev entries). Then Legend ranks the setup. It stays up at least 1.4 s, pausing briefly once both steps are done. If the quote fails, a CONNECTION ERROR dialog opens. If Legend fails, the summary still opens with Legend marked offline. **Exchange reveal**, after the game's pre-race screen: the whole screen is a grid of big squares (8 across, 4 on phones, `.lgrid` in `pages/LoadingPage`). Top right (bottom on phones) is the block: map squares, dim squares, the ticker letters and the pink square. As soon as the quote is in, the tags read `01 | TICKER | NASDAQ` (or NYSE, NYSE AMERICAN, NYSE ARCA, TSX, LSE, OTC, CBOE…) and that exchange's building shows through the block's photo squares one at a time. When the scan is done, the finale plays (about 1.65 s, `LOADING_FINALE_MS` in `App.tsx`): the words fade, then the photo spreads in staggered diagonal groups of squares (a restrained pale flash, then the photo) until it fills the screen with faint grid lines, and the photo crossfades over the summary for 700ms. Every square samples one viewport-sized map texture, avoiding per-cell fixed-background painting. Covers have no inset; integer-rounded cell bounds overlap fractional edges to prevent exposed-photo seams. Already-open cells retain their original delay through the finale, and the spread is bounded on tall screens. Reduced motion removes the stagger. Mapping and photos: `src/lib/exchanges.ts`, `public/images/exchanges/` (credits in `CREDITS.md` there and on the Settings screen). Exchanges without a landmark (OTC, Cboe, unknown) show Wall Street. Manual entries keep the plain grid.
- **Summary:** (no bottom bar) plays its reveal once everything is ready: stats and price count up, Legend's verdict and readout rows build in, the rank counts to Legend's score, and the class letter lands. Laid out like the garage car-stats screen. It has the company nameplate, stat rows with cyan bars growing left to right, the price sitting on the turntable, the rank/class block, the Legend panel, and the Legend banner with a white BACK button.
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
- The loading screen steps through quote → "N RECENT STORIES FOUND" → Legend. Under the steps, a source carousel cycles the site icons being searched (Yahoo Finance, Google News) and then the publishers Legend is reading, like an AI search showing the sites it's looking through. It shows the label (with a light sweep while working) and a tight row of three small overlapping white icon tiles. Every 0.9 s a new site slides in on the left and the oldest shrinks away on the right. With three or fewer sites the row holds still. It ends on "N SOURCES READ". Icons come from `GET /favicon?domain=`, which the server fetches once and caches, so the page only talks to this server. The bottom-right diamond is the screen's only loading indicator.
- The summary shows Legend's panel (verdict, then the NEWS · sentiment · catalyst row, conviction, efficiency and risks). The **"i" box** after the rank's class letter (where the game's rank block has its small icon box) opens the **SCORE BREAKDOWN** in an info dialog: each quant component, the catalyst bonus, any risk penalty and the total.
- The **LATEST NEWS** strip shows the stories as cards: thumbnail, publisher, age and headline. Legend's key stories come first, with its sentiment and impact line, and each card opens the article.

**Possible next step:** an embedding model in LM Studio (e.g. nomic-embed-text) could rank passages from longer articles or across many stocks. It isn't needed for single-stock news today.

## Legend tokens (A-tokens)

Like the game's A-tokens, **Legend tokens** count the AI tokens Legend uses.

- **Recording** (`server/usage.js`): every analysis adds LM Studio's reported `usage` (prompt, completion, total) to a per-day tally in `server/data/token-usage.json`, split by hour of the day (tokens and scans) for the graph. Days recorded before hourly tracking began (Sep 29, 2026) have no hour split. The file is git-ignored; set `LEGEND_USAGE_FILE` to move it. Days use the server's local time, and weeks start on Monday. Dry runs don't use tokens.
- **Allowance:** unlimited for now (`LEGEND_DAILY_TOKENS` empty), shown as `/∞`.
- **Endpoint:** `GET /legend/usage` returns `{ dailyLimit, today, week, month, lifetime, since }`. Each period has `{ tokens, prompt, completion, requests, hours[24], hourScans[24], untimed }`. The response also has `hourlySince` and the server's current `hour`.
- **Top bar:** the token tile shows today's usage as `643/∞` with the blue token icon and a lime "+". When the total grows, it rolls up from the old value (the "+" highlights). It refreshes on load, every minute, and once the summary is on screen after each analysis. **Token drop**, after the game's A-token animation: four faint tokens travel along the same path, 60ms apart, shrinking into the counter icon over 460ms. A short blue wash responds at impact; the count begins rolling at 380ms. The icon stays still while the count rolls. Settings → TEST ANIMATIONS → TOKEN DROP plays the visual without changing usage.
- **Tokens screen:** clicking the tile opens a screen styled like the game's token shop, with a vertical TOKENS label and four yellow cards: TODAY (LIVE ribbon), THIS WEEK, THIS MONTH and LIFETIME (ALL TIME ribbon). Each card shows the token count, scans, input/output split and a token pile that grows with the period, over a lime period bar. The cards are buttons: pressing one (white frame = selected; TODAY on each visit) shows that period in the **USAGE BY HOUR** graph below.
  - The graph (`components/TokenHourChart`) is a boxy navy panel with 24 gold bars (midnight to 11 PM) growing up in a stagger, a round-number scale with a middle gridline, and the peak hour.
  - Pre-market, market-open (lime tint) and after-hours bands are shaded behind the bars, in the same local time as the top bar's status. On TODAY, a pink NOW tag marks the current hour.
  - Hovering or tapping a bar shows a white tooltip with the hour, tokens and scans. Tokens from before hourly tracking are noted underneath rather than guessed.

Back returns to the screen you came from.

## Watchlist

Stocks you follow, kept fresh by Legend while the site is open.

- **Updates** (`server/watchlist.js`): each update is a full pass: a live quote and the session's 5-minute price line (`server/quotes.js`), a fresh news search (news is re-fetched at most once a minute per stock), and a new Legend analysis and score. Updates spend Legend tokens, so the top-bar counter rolls up as they land.
  - The server runs one update at a time, always the stalest stock, so none waits longer than the others and LM Studio isn't flooded. A full update takes about 6 s, so with many stocks the real cadence per stock is the larger of the interval and roughly 6 s × the number of stocks.
  - Updates run only while at least one page is connected (a server-sent event stream, `GET /watchlist/stream`). They pause while a hand-run scan is using Legend, then resume.
  - The interval is **EVERY 10S / 30S / 60S** or **PAUSED** (default 30 s), chosen on the watchlist screen and saved on the server. The LEGEND DRY RUN setting applies to watchlist updates too.
  - A failed update keeps the card's last data, flags it (LEGEND OFFLINE or UPDATE FAILED) and retries after at least 30 s.
  - Saved in `server/data/watchlist.json` (git-ignored; `WATCHLIST_FILE` moves it). Up to 30 stocks. Hand-typed tickers are checked against Yahoo before they're added.
  - API: `GET /watchlist`, `POST /watchlist {symbol, snapshot?}` (a scan's results can come along so the card is complete at once), `DELETE /watchlist/:symbol`, `POST /watchlist/:symbol/refresh`, `PUT /watchlist/settings {interval, dryRun}`.
- **Update animation** (`ui/Glint`): when a stock finishes an update, its card and home-screen row play the game's PLAY-button shine: a soft diagonal glint crosses at constant speed (0.62 s), followed by a broad white wash (0.92 s, beginning at 0.42 s). The idle and update versions share the same rhythm; idle repeats every 7 s.
- **Home screen list** (`components/WatchRail`): a scrolling column under MARKET SCANNER. Each row has the class box, ticker (with a lime/pink chevron when the last update moved the score), company, price, the day's change and a cyan score bar. Rows open the stock's summary. The header shows what's updating; VIEW WATCHLIST opens the full screen.
- **Watchlist screen** (`pages/WatchlistPage`), laid out like the garage:
  - WATCHLIST title with a count tab, and the class filter squares **ALL D C B A S** top right.
  - A toolbar with ADD A TICKER, **SORT BY** (class, score, % change, relative volume, price, ticker, recently added, last updated), a direction toggle, and the **UPDATES** interval dropdown (`ui/Dropdown`). The sort is shared with the home list and saved in the browser.
  - A status line (UPDATING NVDA / NEXT: MSFT IN 7S / WAITING FOR YOUR SCAN / UPDATES PAUSED) and UPDATE ALL NOW.
  - Sorting by class groups the cards under the garage's dotted class rail (boxed letter). Other sorts use a single rail.
- **Cards** (`components/WatchCard`) mirror the garage cards:
  - The blue plate has 0–6 stars for the score, the SCORE box (`519/2,000`, score in lime), the session's price line where the car sits (lime above the previous close, pink below, with a dashed previous-close line), the day's change where the fuel chip is, the time since the update, and the garage's upgrade badge (lime up / pink down) when the last update moved the score.
  - The orange "blueprint" has the company logo (from its website), class letter, company and ticker, over a yellow price bar where the blueprint bar is.
  - **Stocks with 4 or more stars (a score of about 1,167+) get the gold card** the game gives maxed cars: gold plate and yellow MAX-style price bar. Everything else is a regular car: blue plate and the dark blueprint progress bar. Fortune 500 companies show FORTUNE 500 · #rank on the blueprint tag (`server/fortune500.json`: the 2023 list with tickers from github.com/EatMoreOranges/Fortune-500-Dataset, private companies omitted, aliases for Yahoo spellings, other share classes and later ticker changes; the server adds `fortune500: {rank, company}` to each item).
  - Refresh and remove buttons appear on hover (always on touch screens). Removing asks first. Clicking a card opens its latest analysis on the summary, and Back returns to the watchlist.
- **Notifications** (`components/Notifications`, `lib/notify.ts`, `styles/notifications.css`), shown one at a time over any screen; click to clear early (a real alert then opens that stock's summary):
  - **Bullish news**, staged like the game's DAILY GOAL COMPLETED: a broad diagonal lime slab rises from the lower left with its dark twin, white edge and a brief pale arrival flash, the game's daily-goal badge settles into place (a lime stopwatch with crown, side buttons and a pale quarter wedge in a white laurel, with stars), a pink bar and pale trailing block sweep across the screen from right to left, `NVDA NEWS` lands small over a big `BULLISH`, and the headline (publisher · title) appears in white on a dark bar before lime fills it from left to right and the text turns dark. The compact badge, two title strips and two-line headline land in successive beats, then collapse downward on dismissal. Holds 4.2 s. The server sends it when a watchlist update finds a story Legend marks bullish that it hasn't alerted on for that stock before (`announce()` in `server/watchlist.js`; stories already in a scan, or present when a stock is first tracked, don't alert).
  - **Banner**, after the game's TRADE COINS strip: navy striped panel with a lime title and white text, art in the middle, a white diagonal cut into a maroon panel with `+delta` over a big total. Used for **RANKED UP** (a watched stock moving into a higher class, e.g. B › A, +236 / 1,482) and meant for future notices.
  - Settings → TEST ANIMATIONS (dev options) has BULLISH NEWS, RANKED UP, TOKEN DROP and EXCHANGE REVEAL. The exchange preview uses the real loading component in a native modal, with NYSE/Nasdaq, Replay, Close and Escape support; it makes no quote or AI requests.
- **Add to watchlist** (`components/WatchControl`), on the summary's right-hand column under Legend's read, as on the game's car screen: laid out like the game's car-screen corner. A gas-tank style caption (e.g. EACH UPDATE USES ~2.1K TOKENS) sits over the watched count, beside a WATCH**LIST** ON/OFF switch in the TOUCHDRIVE style, above a big lime PLAY-style button: ADD TO WATCHLIST (with the idle glint), then OPEN WATCHLIST once added. Manual entries can't be watched.

## Stock screener

Legend's continuous hunt for the day's best momentum setups (the STOCK SCREENER tile in the bottom bar, formerly MY PORTFOLIO). **Paused by default.** AUTO UPDATE runs it every 1, 2, 5, 10, 15 or 30 minutes or every hour, counted from the end of one update to the start of the next. UPDATE NOW runs one even while paused. Like the watchlist, it only runs while a page is connected, and steps aside while you run a scan by hand.

- **Each update** (`server/screener.js`):
  1. **Discovery:** Yahoo Finance's small-cap gainers, day gainers, most active and aggressive small-cap screens; trending tickers on Yahoo and StockTwits; and momentum headlines on Google News (`stock soars premarket`, `FDA approval shares jump`, …) with tickers pulled from the titles (`IOVA Stock`, `(NASDAQ: ABCD)`, `$ABCD`, `ONDS, AVAV, KTOS Stocks`). Usually 400+ tickers.
  2. **One batched quote** checks them all, session-aware (pre-market price and change before the open). Movers are US stocks up 10%+, $0.50-$30, with 100K+ volume.
  3. Each mover's **float and company website** are looked up (cached 12 h), and the movers get a first ranking from the quant score. The hottest ones, up to the **CHECK TOP** limit (10, 20, 50 or 100; default 20), are researched. Each gets a **fresh news search** (at most a minute old).
  4. **The five pillars** (defaults from the trader's checklist): price $1-$10, float under 10M, up 25%+, relative volume 10x+, fresh news in the last 24 h.
  5. **Legend grades every stock checked, every update**, in **screener mode** (`legend.screen()`). Last update's best go first, then new arrivals.
     - Each grade has the normal read and score, plus a setup grade (A+ to F), the catalyst type, why it's moving now, and what to watch (confirmation/invalidation using the day's levels).
     - The screener prompt adds the pillars, catalyst-quality rules (FDA, earnings with raised guidance, big contracts, buyouts vs. recaps, sympathy and buzzwords) and red flags (offerings/ATM/warrants, reverse splits, going-concern or delisting notices, no-news pumps, exhausted runs).
     - The board re-ranks as each grade lands. Until a stock is re-graded, its grade from the last update stands.
  6. **Ranking:**
     - Only A+ to C setups are shown, ranked best first by grade and then score. Stocks graded F, and new ones Legend hasn't graded yet, are left off the board and only counted ("PASSED ON 7, CHECKING 1 MORE").
     - Each ranked stock carries its rank change since the last update: ▲/▼, NEW or SAME (saved as `ranks`). A new A or A+ setup raises a **NEW SETUP** banner, once per stock per day.
  7. **Cost:** tokens per grade (a moving average of real grades, saved as `tokensPerGrade`) and step times (`timing`) are measured. The page multiplies them by the number of stocks that will be graded.
- **Screen** (`pages/ScreenerPage`, `styles/screener.css`), laid out like the game's multiplayer rank rewards:
  - **Header:** event style, with a pink rule, the title, a status chip (AUTO UPDATE PAUSED / NEXT UPDATE 04:12 / UPDATING), a Legend chip (setups · checked), an A+/A SETUPS count, and LIVE BOARD / HOW IT WORKS tabs on the panel's edge.
  - **Board:** a sticky row of column names (RANK · STOCK · THE FIVE PILLARS · LEGEND'S GRADE · SCORE · NEWEST STORY), then a line on what was scanned, how many Legend passed on and how ranking works. Then the setups. With none, it says so and how many were checked.
  - **Rows:**
    - A chevron rank tab: #1 is pink and marked TOP PICK, with the rank change.
    - The company logo, ticker, name, price and change.
    - The five pillar checks, lime when passed.
    - Legend's grade on a red pack card (gold for A+), with the catalyst, the score, why now, and the **newest story** with its age (lime NEW under 3 hours).
    - A row being re-graded pulses.
  - **Footer** like LEADERBOARD / POS / RACE:
    - **CHECK TOP** and **AUTO UPDATE** dropdowns, both opening upward. A smaller CHECK TOP trims the board at once; a bigger one fills on the next update.
    - **PER UPDATE** tokens (grades × tokens per grade), **TAKES** (with tokens per hour when auto-updating) and **LAST UPDATE**.
    - A lime UPDATE NOW button.
  - Clicking a graded row opens its summary, with the screener grade, why now, WHAT TO WATCH and the add-to-watchlist control; Back returns to the screener. Progress shows in the top bar (see Connection and progress).
- **API:** `GET /screener`, `GET /screener/stream` (SSE: snapshot, board, engine with the progress, settings, alert, ping), `POST /screener/scan` and `PUT /screener/settings {interval, boardSize, dryRun}`.
- Saved in `server/data/screener.json` (git-ignored). LEGEND DRY RUN applies.

## Connection and progress

- **Connection signal** (`lib/connection.ts`, `ConnectionSignal` in `components/TopBar`): when the connection is poor, a signal icon (lit arcs dimmed, red warning badge) slowly fades in and out at the right end of the top bar's empty strip, with WEAK CONNECTION / NO INTERNET / NO CONNECTION and a short note when there's room (icon only on narrow bars). It fades away once things recover. The page checks `GET /health` every 10 s (every 4 s while something is wrong; not while the tab is hidden) and watches the browser's online flag and the live streams. Weak: a round trip over 0.9 s, one failed check, the server's own internet probe slow, or a live stream down for 6 s. No connection: offline or two failed checks. No internet: the server can't reach the web (market data, news). `/health` answers at once with the server's cached probe of `https://www.gstatic.com/generate_204` (re-run at most every 15 s). Settings → TEST ANIMATIONS → WEAK CONNECTION previews it.
- **Live streams** (`lib/stream.ts`): the watchlist and screener streams reopen themselves when the browser gives up on them (an error response) or when they go quiet for 40 s (the server pings every 15 s), which is how a connection dropped on poor Wi-Fi shows up. Each reopen starts with a fresh snapshot.
- **Background jobs in the top bar** (`lib/jobProgress.ts`, `JobTile` and `JobLine` in `components/TopBar`): while a screener or watchlist update runs, the tile shows a spinning diamond, the job (SCREENER / WATCHLIST) and its percentage. Below that are the current step, its count and the time left, e.g. LEGEND IS GRADING ABCD · 3/20 · ~1M 40S LEFT. A lime loading line with a white leading edge runs along the top bar's bottom edge, under the back triangle. The tile has a fixed size: 236px, or 92px (percentage only) and 48px (icon only) when the empty strip runs short. Its text truncates inside, so it never grows with the step's name. Clicking it opens that screen. When both jobs run, the current screen's is shown, otherwise the screener's. Nothing on the pages moves; they keep only a small status chip (the screener's timer chip, and the watchlist's chip by its count).
  - The server sends where each step starts and should end (`server/progress.js`); the bar fills between them as time passes or as items are counted off (e.g. floats 12/34), and never runs backwards within a job. Step times are learned from earlier runs (a moving average saved as `timing` in `server/data/screener.json` and `watchlist.json`); dry runs, failures and waits aren't learned from.
- **Performance:** the clock is a shared store (`lib/clock.ts`, `useSyncExternalStore`), so only the clock readouts re-render each second instead of the whole app, and the watchlist and screener stop ticking while hidden.
- **Dropdowns** (`ui/Dropdown`) open upward when the list wouldn't fit below; the screener's AUTO SCAN always opens upward.

## Behavior changes from the original

The Asphalt 9 redesign replaced the original layout and animation engine. The functionality is the same, with these deliberate changes:

- K/M/B shorthand works in uppercase too (e.g. `1.25K`), and values with more than two decimals expand correctly.
- The midnight hour shows as `12`, not `0`. The weekend check no longer lags one tick behind.
- Google Gemini is replaced by Legend on LM Studio. It returns structured sections (verdict, conviction, efficiency, risks) instead of one block of text. The panel shows its working state while loading and an "unavailable" notice when the request fails.
- A stale Legend response can't overwrite a newer stock's summary.
- Disabled SUBMIT buttons are actually disabled. Navigation requests during a transition are queued, not run on top of each other.
- The ticker shows the symbol returned by the server (uppercase).
- Before the open, a stock with no pre-market trades yet shows its last regular price (the original sent no price at all). The company name falls back to Yahoo's short name.
- An empty ticker shakes the field and shows an inline error instead of `alert()`. Fetch errors open a dialog.
- Stat bars are capped at full width (the original overflowed a clipped container, so this looks the same).
- The session countdown uses weekday session times in the device's local time zone and ignores market holidays.
- The layout adapts to window width *and* height. The home screen's type, clock, spacing and mode bar scale by whichever is tighter, so short laptop windows fit without overlap. The corner card sits in the layout flow, and very short windows scroll. Checked at 1920×1080, 1512×860, 1512×620, 1280×720, 1024×640, 1000×613, 820×1180 and 375×812.
- Settings (sound, volume, title screen, dev options) are saved in the browser's localStorage.

## Motion verification

`node --test tests/a9-motion.test.mjs` checks bounded large-garage entrances, hidden-control stagger handling, undistorted panel reveals, reduced-motion behavior and opacity-only loading fades (Node 22.18+). The October 3 refinement was checked against all four supplied recordings and the UI/UX folder transition footage, then reviewed in the browser on desktop and at 375×812.
