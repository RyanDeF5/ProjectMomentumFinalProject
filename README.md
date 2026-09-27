# Project Momentum

The official React version of Project Momentum: a day-trading stock momentum screener, designed after the menus of the mobile game Asphalt 9: Legends and meant to grow into a full investing app. It keeps the functionality of the original vanilla JavaScript site in `../ProjectMomentum/`.

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
  App.tsx                 screen state machine (start → loading → summary), navigation, data flow
  animation/a9.ts         Asphalt 9 transition engine (Web Animations API)
  audio/sfx.ts            UI sound effects (Web Audio) and the mute setting
  ui/                     design-system pieces: Button, Chip, Reveal, RevealText, SectionTitle,
                          Segmented, Dialog, Diamond (loading indicator), Icons, Logo
  components/             app pieces: TopBar, ModeBar, StatRow, RankBlock, GeminiPanel, Field, NumberField
  pages/                  Splash, StartPage, LoadingPage, SummaryPage
  lib/                    clock + market sessions, API calls, number helpers, count-up hook, types
  styles/                 base.css (tokens, fonts), a9.css (animated elements), ui.css, screens.css
public/images/bg          map textures (from the original's unused "Asphalt Style Background" images)
public/images/icons       stat icons and the Gemini star
public/sfx                sound effects, trimmed of leading silence and level-matched (sources: ../SFX)
server/                   Express backend
```

## Design system

**Strictly Asphalt 9: Legends (2018–2024), not the newer Asphalt Legends Unite.** Colors and surfaces are sampled from the reference screenshots and footage in `../Asphalt 9 UI:UX/`. Don't add glassy blur, soft drop shadows, glows or dark purple/black menus. Keep the look boxy and clean: square blocks, with no slanted chips or irregular shapes. Use diagonals only where the game itself has them (lock tabs, dialog close tab, title-screen stripes). The site has no logo yet, so don't invent one.

- **Colors:** `#1B212B` dark, `#FF0054` pink, `#C3FB12` lime, `#3F4B57` slate (tokens in `styles/base.css`).
- **Surfaces:** menus sit on deep navy (`#03132B`–`#061A3A`) with lighter blue toward the top-left. Panels are flat navy. The summary and settings screens use the same background as the home screen. Purple map backgrounds are used only for the loading screen, like the game's career map.
- **Top bar:** tiles are anchored to the right edge and run right to left: gear (home screen) or home (other screens), then the wide market-session tile (lime when open, yellow pre-market/after hours, navy when closed), then the date and clock counter tiles. Tiles have fixed widths (clock/date 168px, status 320px, gear/home 80px) that don't change with the window. The rest of the bar is tile-colored space reserved for future tiles, plus the white back triangle on sub-screens. There's no page-title tile; screens carry their own "| TITLE" headings. The gear is a single solid path with six chunky teeth, with no SVG masks or gradients, since Safari could drop those when the icon re-mounts.
- **Loading diamond** (`ui/Diamond`): a black diamond with a dark rim and a thin grey inner outline. A pink comet rides clockwise along the diamond's outer edge, with a white-hot head, a fading tail and a pink glow washing into the interior. It was modelled on close-ups of the game's indicator.
- **Warnings:** `ui/Dialog` follows the CUSTOMER CARE / CONNECTION ERROR dialogs: a dark `#0D1728` header with a white top rule, a pink close tab with a dark diagonal edge, a blue gradient body with centered text, and a white action button (e.g. RETRY). `ui/Notice` is the pink-bordered "NOT AVAILABLE AT THIS MOMENT" box.
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
- **Loading:** a pre-race style screen shown while the quote loads (at least 1.4 s).
- **Summary:** laid out like the garage car-stats screen. It has the company nameplate, stat rows with cyan bars growing left to right, the price sitting on the turntable, the rank/class block, the Gemini panel, and a dark action strip with a white BACK button.
- **Dialog:** failed scans open a CONNECTION ERROR warning with RETRY instead of `alert()`.

## Behavior changes from the original

The Asphalt 9 redesign replaced the original layout and animation engine. The functionality is the same, with these deliberate changes:

- K/M/B shorthand works in uppercase too (e.g. `1.25K`), and values with more than two decimals expand correctly.
- The midnight hour shows as `12`, not `0`. The weekend check no longer lags one tick behind.
- The Gemini panel shows its working state while loading, and "Gemini Is Unavailable" when the request fails.
- A stale Gemini response can't overwrite a newer stock's summary.
- Disabled SUBMIT buttons are actually disabled. Navigation requests during a transition are queued, not run on top of each other.
- The ticker shows the symbol returned by the server (uppercase).
- An empty ticker shakes the field and shows an inline error instead of `alert()`. Fetch errors open a dialog.
- Stat bars are capped at full width (the original overflowed a clipped container, so this looks the same).
- The session countdown uses weekday session times in the device's local time zone and ignores market holidays.
- The layout adapts to tablet and phone widths.
- Settings (sound, volume, title screen, dev options) are saved in the browser's localStorage.
