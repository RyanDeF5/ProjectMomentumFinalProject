import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { enterScreen, enterTopBar, exitScreen, exitTopBar, fadeScreen } from "./animation/a9";
import { sfx, type SfxName } from "./audio/sfx";
import type { LegendState } from "./components/LegendPanel";
import { ModeBar } from "./components/ModeBar";
import { Notifications } from "./components/Notifications";
import { TopBar } from "./components/TopBar";
import { analyzeWithLegend, exampleLegendAnalysis, fetchNews, fetchStockData, fetchTokenUsage } from "./lib/api";
import { marketStateNow, useMarketState } from "./lib/clock";
import { markTitleScreenSeen, shouldShowTitleScreen } from "./lib/settings";
import type { NewsItem, ScreenerEntry, StockData, TokenUsage, WatchItem } from "./lib/types";
import { useConnection } from "./lib/connection";
import type { TopJob } from "./lib/jobProgress";
import { addToWatchlist, refreshWatchItem, removeFromWatchlist, updateWatchSettings, useWatchlist } from "./lib/watchlist";
import { LoadingPage, type LoadingSteps } from "./pages/LoadingPage";
import type { NewsState } from "./components/NewsStrip";
import { SettingsPage } from "./pages/SettingsPage";
import { TokensPage } from "./pages/TokensPage";
import { WatchlistPage } from "./pages/WatchlistPage";
import { ScreenerPage } from "./pages/ScreenerPage";
import { scanNow, updateScreenerSettings, useScreener } from "./lib/screener";
import { NewsPage } from "./pages/NewsPage";
import { updateNewsNow, updateNewsSettings, useMarketNews } from "./lib/marketNews";
import { SchedulePage, type LiveJob, type ScheduleView } from "./pages/SchedulePage";
import type { JobKey } from "./lib/types";
import type { ModeId } from "./components/ModeBar";
import { Splash } from "./pages/Splash";
import { StartPage } from "./pages/StartPage";
import { SummaryPage } from "./pages/SummaryPage";
import { Dialog } from "./ui/Dialog";

type Screen = "start" | "loading" | "summary" | "settings" | "tokens" | "watchlist" | "screener" | "news" | "schedule";

// The bottom mode bar belongs to the home screen and the mode screens: it stays put while you move
// between them, and steps aside on every other screen
const MODE_BAR_SCREENS: ReadonlySet<Screen> = new Set(["start", "watchlist", "screener", "news", "schedule"]);

// Keep the loading screen up long enough to read, like the game's pre-race screen
const MIN_LOADING_MS = 1400;
const STEP_DONE_PAUSE_MS = 450;
// The loading screen's finale: the words fade and the exchange photo fills the screen
const LOADING_FINALE_MS = 1650;
const USAGE_REFRESH_MS = 60_000;
// Watchlist updates spend tokens; pick them up soon after, but not on every single update
const USAGE_AFTER_UPDATE_MS = 2_500;

const placeholderStock: StockData = {
  symbol: "STCK",
  fullName: "",
  currentPrice: 0,
  lastClose: 0,
  volume: 0,
  averageVolume: 0,
  float: 0,
};

// Decided once per page load (the restart flag is consumed on read)
const showTitleScreenOnLoad = shouldShowTitleScreen();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function App() {
  // Only the session (it changes a few times a day): the clock itself lives in the components that show it
  const marketState = useMarketState();

  const [screen, setScreen] = useState<Screen>("start");
  const [showSplash, setShowSplash] = useState(showTitleScreenOnLoad);
  const [buyButtonsEnabled, setBuyButtonsEnabled] = useState(true);
  const [scanInProgress, setScanInProgress] = useState(false);
  const [modeBarShown, setModeBarShown] = useState(true);
  const modeBarFaded = useRef(false);
  const [dryRun, setDryRun] = useState(false);
  const [stock, setStock] = useState(placeholderStock);
  const [loadingSymbol, setLoadingSymbol] = useState("");
  const [loadingDeparting, setLoadingDeparting] = useState(false);
  const [loadingExchange, setLoadingExchange] = useState<{ code: string | null; name: string | null } | null>(null);
  const [loadingFinale, setLoadingFinale] = useState(false);
  const loadingExchangeRef = useRef<string | null>(null);
  const [steps, setSteps] = useState<LoadingSteps>({ quote: "pending", news: "pending", legend: "pending" });
  const [news, setNews] = useState<NewsState>({ status: "idle", items: [] });
  const [summaryRun, setSummaryRun] = useState(0);
  const [legend, setLegend] = useState<LegendState>({ status: "idle" });
  const [usage, setUsage] = useState<TokenUsage | null>(null);
  const [usageError, setUsageError] = useState(false);
  const [error, setError] = useState<{ title: string; message: string; retry?: () => void } | null>(null);
  const [scheduleView, setScheduleView] = useState<ScheduleView>("overview");

  const topBarRef = useRef<HTMLElement>(null);
  const screenRefs = {
    start: useRef<HTMLElement>(null),
    loading: useRef<HTMLElement>(null),
    summary: useRef<HTMLElement>(null),
    settings: useRef<HTMLElement>(null),
    tokens: useRef<HTMLElement>(null),
    watchlist: useRef<HTMLElement>(null),
    screener: useRef<HTMLElement>(null),
    news: useRef<HTMLElement>(null),
    schedule: useRef<HTMLElement>(null),
  };
  // Where Settings/Tokens were opened from, so Back returns there
  const returnTo = useRef<Screen>("start");
  // Where the summary was opened from (a scan, the home watchlist or the watchlist screen)
  const summaryFrom = useRef<Screen>("start");
  const usageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenRef = useRef<Screen>("start");
  const navQueue = useRef<Promise<void>>(Promise.resolve());
  const queuedTarget = useRef<Screen | null>(null);
  const legendRequestRef = useRef(0);

  useEffect(() => sfx.preload(), []);

  // Live watchlist; each finished update spent tokens, so the top bar counter follows along
  const watchlist = useWatchlist((item) => {
    if (!item.legend?.tokens || usageTimer.current) return;
    usageTimer.current = setTimeout(() => {
      usageTimer.current = null;
      refreshUsage();
    }, USAGE_AFTER_UPDATE_MS);
  });

  // The stock screener's board, live (it only scans while a page is connected and it isn't paused)
  const screener = useScreener();
  // Market news, read by Legend on its schedule
  const marketNews = useMarketNews();
  const connection = useConnection(watchlist.connected && screener.connected && marketNews.connected);

  // Each grade Legend adds to the board, and each batch of news it reads, spent tokens: pick them
  // up as they land (debounced)
  const gradedKey = screener.board.reduce((n, e) => n + (e.analyzedAt ?? 0), 0) + marketNews.stories.reduce((n, s) => n + (s.readAt ?? 0), 0);
  useEffect(() => {
    if (!gradedKey) return;
    const timer = setTimeout(refreshUsage, USAGE_AFTER_UPDATE_MS);
    return () => clearTimeout(timer);
  }, [gradedKey]);

  // Watchlist updates and screener grades follow the LEGEND DRY RUN setting too
  useEffect(() => {
    updateWatchSettings({ dryRun }).catch((err) => console.error("Watchlist settings:", err));
    updateScreenerSettings({ dryRun }).catch((err) => console.error("Screener settings:", err));
    updateNewsSettings({ dryRun }).catch((err) => console.error("Market news settings:", err));
  }, [dryRun]);

  function refreshUsage() {
    fetchTokenUsage()
      .then((next) => {
        setUsage(next);
        setUsageError(false);
      })
      .catch((err) => {
        console.error("Token usage unavailable:", err);
        setUsageError(true);
      });
  }

  // Token counter: load now, then keep it fresh (the day can roll over while the app is open)
  useEffect(() => {
    refreshUsage();
    const timer = setInterval(refreshUsage, USAGE_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  // First screen builds in once the splash is gone (or straight away when it was already seen)
  useLayoutEffect(() => {
    if (showSplash) return;
    if (topBarRef.current) void enterTopBar(topBarRef.current);
    if (screenRefs.start.current) void enterScreen(screenRefs.start.current);
    // Only on the splash closing; later screens are entered by navigate()
  }, [showSplash]);

  /** Asphalt-style screen change: wash out, collapse the top bar, cut, rebuild. Calls are queued. */
  function navigate(target: Screen, sound?: SfxName): Promise<void> {
    if (queuedTarget.current === target) return navQueue.current;
    queuedTarget.current = target;

    navQueue.current = navQueue.current.then(async () => {
      const from = screenRef.current;
      if (from === target) {
        queuedTarget.current = null;
        return;
      }
      if (sound) sfx.play(sound);

      // Leaving the bar's screens: it slides away with the old screen; it returns with the new one
      const barAfter = MODE_BAR_SCREENS.has(target);
      if (!barAfter && target !== "loading") setModeBarShown(false);

      const bar = topBarRef.current;
      const fromEl = screenRefs[from].current;
      const modes = fromEl?.closest(".app")?.querySelector<HTMLElement>(".modes");
      if (target === "loading") {
        await Promise.all([fromEl && fadeScreen(fromEl, false, 260), bar && fadeScreen(bar, false, 260), modes && fadeScreen(modes, false, 260)]);
        // Keep the bar faded while it hides; restore only when returning to its screens.
        modeBarFaded.current = true;
      } else if (from !== "loading") {
        await Promise.all([fromEl && exitScreen(fromEl), bar && exitTopBar(bar)]);
      }

      screenRef.current = target;
      flushSync(() => {
        setLoadingDeparting(from === "loading");
        if (target === "loading") setModeBarShown(false);
        setScreen(target);
        if (barAfter) setModeBarShown(true);
      });
      window.scrollTo(0, 0);
      if (barAfter && modeBarFaded.current && modes) {
        void fadeScreen(modes, true, 200);
        modeBarFaded.current = false;
      }

      if (bar && target !== "loading") void (from === "loading" ? fadeScreen(bar, true, 650) : enterTopBar(bar));
      const toEl = screenRefs[target].current;
      if (queuedTarget.current === target) queuedTarget.current = null;
      if (from === "loading") {
        // Keep the actual photo mounted over the results until the crossfade finishes.
        try {
          await Promise.all([fromEl && fadeScreen(fromEl, false, 700), toEl && fadeScreen(toEl, true, 700)]);
        } finally {
          setLoadingDeparting(false);
        }
      } else if (toEl) {
        await (target === "loading" ? fadeScreen(toEl, true, 420) : enterScreen(toEl));
      }
    });
    return navQueue.current;
  }

  /** Run Legend on a stock. Resolves to whether it produced an analysis. */
  async function runLegend(stockData: StockData, stories: NewsItem[]): Promise<boolean> {
    const requestId = ++legendRequestRef.current;
    setLegend({ status: "working" });
    try {
      const response = dryRun
        ? await exampleLegendAnalysis(stockData, marketStateNow(), stories)
        : await analyzeWithLegend(stockData, marketStateNow(), stories);
      if (requestId === legendRequestRef.current) setLegend({ status: "done", response });
      return true;
    } catch (err) {
      console.error("Legend request failed:", err);
      if (requestId === legendRequestRef.current) setLegend({ status: "error" });
      return false;
    }
  }

  /**
   * Scan flow: the loading screen covers the quote lookup, the news search and Legend's analysis
   * (which reads that news), then the summary
   * plays its reveal with the final score and readout. Manual (dev) entries pass the stock directly.
   */
  async function scan(symbol: string, load: (() => Promise<StockData>) | StockData) {
    const startedFrom = screenRef.current;
    setScanInProgress(true);
    setBuyButtonsEnabled(false);
    setLoadingSymbol(symbol.toUpperCase());
    setLoadingExchange(null);
    setLoadingFinale(false);
    loadingExchangeRef.current = null;
    const manual = typeof load !== "function";
    const quoteDone = manual ? "skipped" : "done";
    setSteps({ quote: manual ? "skipped" : "active", news: "pending", legend: "pending" });
    const stopRace = sfx.play("race");
    const toLoading = navigate("loading");
    const minimum = wait(MIN_LOADING_MS);

    let stockData: StockData;
    try {
      stockData = typeof load === "function" ? await load() : load;
    } catch (err) {
      console.error("Failed to fetch stock data:", err);
      await toLoading;
      stopRace();
      await navigate("start", "switch");
      setScanInProgress(false);
      setBuyButtonsEnabled(true);
      const code = err instanceof Error ? (err.message.match(/\d{3}/)?.[0] ?? "0") : "0";
      setError({
        title: "CONNECTION ERROR",
        message: `PLEASE CHECK THE TICKER AND MAKE SURE YOU ARE CONNECTED TO A STABLE NETWORK, OR TRY AGAIN LATER.\nWE COULD NOT LOAD MARKET DATA FOR ${symbol.toUpperCase()} (ERROR: ${code}).`,
        retry: () => void scan(symbol, load),
      });
      return;
    }

    // Retrieval: recent news for Legend to read (and for the summary's news strip)
    setSteps({ quote: quoteDone, news: "active", legend: "pending" });
    let stories: NewsItem[] = [];
    let newsOk = true;
    try {
      stories = (await fetchNews(stockData.symbol, stockData.fullName)).items;
    } catch (err) {
      console.error("News search failed:", err);
      newsOk = false;
    }
    setNews({ status: newsOk ? "done" : "error", items: stories });

    setSteps({ quote: quoteDone, news: newsOk ? "done" : "failed", legend: "active" });
    const analyzed = await runLegend(stockData, stories);
    setSteps({ quote: quoteDone, news: newsOk ? "done" : "failed", legend: analyzed ? "done" : "failed" });

    // Let the completed steps register before the summary takes over
    await Promise.all([toLoading, minimum, wait(STEP_DONE_PAUSE_MS)]);
    // Like the game before a race: the words fade and the exchange's photo fills the screen
    if (!manual && loadingExchangeRef.current) {
      setLoadingFinale(true);
      await wait(LOADING_FINALE_MS);
    }
    setStock(stockData);
    setSummaryRun((run) => run + 1);
    // A stock scanned from the news returns there
    summaryFrom.current = startedFrom === "news" ? "news" : "start";
    await navigate("summary");
    // Pick up the tokens this scan used now that the top bar is back, so the counter rolls up in view
    setScanInProgress(false);
    if (analyzed) refreshUsage();
  }

  /** Scan a stock. Before the open the volume comes from the form; without one, the quote's is used. */
  function superCalculate(symbol: string, volumeFromField = Number.NaN) {
    void scan(symbol, async () => {
      const state = marketStateNow();
      const data = await fetchStockData(symbol, state);
      // The loading screen shows the exchange's building as soon as the quote is in
      setLoadingExchange({ code: data.exchange, name: data.exchangeName });
      loadingExchangeRef.current = data.exchange || data.exchangeName;
      return {
        symbol: data.symbol ?? symbol.toUpperCase(),
        fullName: data.fullName,
        currentPrice: data.currentPrice,
        lastClose: data.lastClose,
        volume: state === "PRE-MARKET" && Number.isFinite(volumeFromField) ? volumeFromField : data.currentVolume,
        averageVolume: data.averageVolume,
        float: data.float,
      };
    });
  }

  /** Open a watched stock's latest analysis on the summary screen. */
  function openWatchItem(item: WatchItem) {
    if (!item.stock || !item.legend) return;
    legendRequestRef.current++;
    setStock(item.stock);
    setLegend({ status: "done", response: item.legend });
    setNews({ status: "done", items: item.news });
    setSummaryRun((run) => run + 1);
    summaryFrom.current = screen === "watchlist" ? "watchlist" : "start";
    void navigate("summary", "switch");
  }

  /** Open a screener find's full read (Legend's screener grade) on the summary. */
  function openScreenerEntry(entry: ScreenerEntry) {
    if (!entry.ai) return;
    legendRequestRef.current++;
    setStock({
      symbol: entry.symbol,
      fullName: entry.name,
      currentPrice: entry.price,
      lastClose: entry.prevClose,
      volume: entry.volume,
      averageVolume: entry.avgVolume,
      float: entry.float,
    });
    setLegend({ status: "done", response: entry.ai });
    setNews({ status: "done", items: entry.news });
    setSummaryRun((run) => run + 1);
    summaryFrom.current = "screener";
    void navigate("summary", "switch");
  }

  function openScreener() {
    void navigate("screener", "switch");
  }

  function openWatchlist() {
    void navigate("watchlist", "switch");
  }

  function openNews() {
    void navigate("news", "switch");
  }

  /** The Update Schedule, on the overview or on one job's settings (from that job's status chip). */
  function openSchedule(view?: ScheduleView) {
    if (view) setScheduleView(view);
    void navigate("schedule", "switch");
  }

  function openJob(job: JobKey | TopJob["source"]) {
    if (job === "screener") openScreener();
    else if (job === "news") openNews();
    else openWatchlist();
  }

  /** UPDATE NOW from the schedule screen: the whole watchlist, a screener scan or a news update. */
  function updateJobNow(job: JobKey) {
    if (job === "screener") void scanNow();
    else if (job === "news") void updateNewsNow();
    else watchlist.items.forEach((item) => void refreshWatchItem(item.symbol));
  }

  function goBack() {
    const target = screen === "settings" || screen === "tokens" ? returnTo.current : screen === "summary" ? summaryFrom.current : "start";
    void navigate(target, "switch");
    if (target === "start") setTimeout(() => setBuyButtonsEnabled(true), 1000);
  }

  function goHome() {
    void navigate("start", "switch");
    setTimeout(() => setBuyButtonsEnabled(true), 1000);
  }

  function openOverlayScreen(target: "settings" | "tokens") {
    if (screen !== "settings" && screen !== "tokens") returnTo.current = screen;
    if (target === "tokens") refreshUsage();
    void navigate(target, "switch");
  }

  // The background job for the top bar: the one belonging to this screen if it's running, else
  // a screener update, else a watchlist update
  const jobs: TopJob[] = [];
  if (screener.connected && ["scanning", "analyzing", "waiting"].includes(screener.engine.state)) {
    jobs.push({
      source: "screener",
      label: "SCREENER",
      step: screener.engine.step ?? "UPDATING",
      progress: screener.engine.progress ?? null,
      held: screener.engine.state === "waiting",
      clockOffset: screener.clockOffset,
    });
  }
  if (watchlist.connected && watchlist.engine.state === "updating") {
    const queue = watchlist.engine.queue ?? 0;
    jobs.push({
      source: "watchlist",
      label: "WATCHLIST",
      step: `UPDATING ${watchlist.engine.symbol}${queue ? ` (+${queue} DUE)` : ""}`,
      progress: watchlist.engine.progress ?? null,
      held: false,
      clockOffset: watchlist.clockOffset,
    });
  }
  if (marketNews.connected && ["gathering", "reading", "waiting"].includes(marketNews.engine.state)) {
    jobs.push({
      source: "news",
      label: "NEWS",
      step: marketNews.engine.step ?? "UPDATING",
      progress: marketNews.engine.progress ?? null,
      held: marketNews.engine.state === "waiting",
      clockOffset: marketNews.clockOffset,
    });
  }
  const topJob = jobs.find((j) => j.source === screen) ?? jobs[0] ?? null;

  // Each job as it is right now, for the schedule screen
  const liveJobs: Record<JobKey, LiveJob> = {
    watchlist: {
      connected: watchlist.connected,
      state: watchlist.engine.state,
      busy: watchlist.engine.state === "updating" || watchlist.engine.state === "waiting",
      nextAt: watchlist.engine.nextAt,
      reason: watchlist.engine.reason,
      symbol: watchlist.engine.state === "idle" ? watchlist.engine.symbol : null,
      clockOffset: watchlist.clockOffset,
    },
    screener: {
      connected: screener.connected,
      state: screener.engine.state,
      busy: ["scanning", "analyzing", "waiting"].includes(screener.engine.state),
      nextAt: screener.engine.nextAt,
      reason: screener.engine.reason,
      clockOffset: screener.clockOffset,
    },
    news: {
      connected: marketNews.connected,
      state: marketNews.engine.state,
      busy: ["gathering", "reading", "waiting"].includes(marketNews.engine.state),
      nextAt: marketNews.engine.nextAt,
      reason: marketNews.engine.reason,
      clockOffset: marketNews.clockOffset,
    },
  };

  const sectionScreen = screen === "settings" || screen === "tokens" ? returnTo.current : screen;
  const section = sectionScreen === "summary" ? summaryFrom.current : sectionScreen;
  const activeMode: ModeId = section === "watchlist" || section === "screener" || section === "news" || section === "schedule" ? section : "scanner";

  return (
    <div className="app">
      <TopBar
        barRef={topBarRef}
        hidden={screen === "loading" || showSplash}
        onBack={screen === "start" ? undefined : goBack}
        onHome={screen === "start" ? undefined : goHome}
        onSettings={screen === "start" ? () => openOverlayScreen("settings") : undefined}
        usage={usage}
        onTokens={screen === "tokens" ? undefined : () => openOverlayScreen("tokens")}
        garageCount={watchlist.connected ? watchlist.items.length : null}
        onGarage={screen === "watchlist" || scanInProgress ? undefined : openWatchlist}
        connection={connection}
        job={screen === "loading" ? null : topJob}
        onOpenJob={scanInProgress ? undefined : (source) => (source === screen ? undefined : openJob(source))}
      />

      <main className="app__screens">
        <StartPage
          screenRef={screenRefs.start}
          active={screen === "start" && !showSplash}
            buyButtonsEnabled={buyButtonsEnabled}
          dryRun={dryRun}
          onSuperSubmit={superCalculate}
          onManualSubmit={(stockData) => void scan(stockData.symbol, stockData)}
          onSwitchPage={() => void navigate("summary", "switch")}
          onDryRunChange={setDryRun}
          lastScan={summaryRun > 0 ? { stock, legend } : null}
          onOpenLastScan={() => {
            summaryFrom.current = "start";
            void navigate("summary", "switch");
          }}
          watchlist={watchlist}
          onOpenWatchItem={openWatchItem}
          onOpenWatchlist={openWatchlist}
        />
        <LoadingPage screenRef={screenRefs.loading} active={screen === "loading" || loadingDeparting} departing={loadingDeparting} symbol={loadingSymbol} marketState={marketState} steps={steps} news={news.items} exchange={loadingExchange} finale={loadingFinale} />
        <SummaryPage
          screenRef={screenRefs.summary}
          active={screen === "summary"}
          stock={stock}
          summaryRun={summaryRun}
          legend={legend}
          news={news}
          onBack={goBack}
          watch={{
            watched: watchlist.items.some((item) => item.symbol === stock.symbol),
            blocked:
              stock.fullName === "Not Identified"
                ? "MANUAL ENTRIES CAN'T BE WATCHED"
                : legend.status !== "done"
                  ? "LEGEND'S ANALYSIS IS NEEDED FIRST"
                  : !watchlist.connected
                    ? "THE WATCHLIST IS OFFLINE"
                    : watchlist.items.length >= watchlist.limit
                      ? "YOUR WATCHLIST IS FULL"
                      : null,
            count: watchlist.items.length,
            limit: watchlist.limit,
            tokensPerUpdate: legend.status === "done" ? (legend.response.tokens?.total ?? null) : null,
            onAdd: () => addToWatchlist(stock.symbol, legend.status === "done" ? { stock, legend: legend.response, news: news.items } : undefined),
            onRemove: () => removeFromWatchlist(stock.symbol),
            onOpenWatchlist: openWatchlist,
          }}
        />
        <WatchlistPage screenRef={screenRefs.watchlist} active={screen === "watchlist"} watchlist={watchlist} onOpenItem={openWatchItem} onOpenSchedule={() => openSchedule("watchlist")} />
        <ScreenerPage screenRef={screenRefs.screener} active={screen === "screener"} screener={screener} onOpen={openScreenerEntry} onOpenSchedule={() => openSchedule("screener")} />
        <NewsPage screenRef={screenRefs.news} active={screen === "news"} news={marketNews} onScan={(symbol) => superCalculate(symbol)} scanBusy={scanInProgress} onOpenSchedule={() => openSchedule("news")} />
        <SchedulePage screenRef={screenRefs.schedule} active={screen === "schedule"} dryRun={dryRun} live={liveJobs} onOpenJob={openJob} onUpdateNow={updateJobNow} view={scheduleView} onViewChange={setScheduleView} />
        <TokensPage screenRef={screenRefs.tokens} active={screen === "tokens"} usage={usage} error={usageError} />
        <SettingsPage screenRef={screenRefs.settings} active={screen === "settings"} dryRun={dryRun} onDryRunChange={setDryRun} />
      </main>

      {!showSplash && (
        <ModeBar
          activeMode={activeMode}
          hidden={!modeBarShown}
          busy={scanInProgress}
          onHome={goHome}
          onOpenWatchlist={openWatchlist}
          onOpenScreener={openScreener}
          onOpenNews={openNews}
          onOpenSchedule={() => openSchedule("overview")}
        />
      )}

      {!showSplash && (
        <Notifications
          onOpen={(symbol) => {
            const item = watchlist.items.find((i) => i.symbol === symbol);
            if (item && screenRef.current !== "loading") openWatchItem(item);
          }}
        />
      )}

      {error && (
        <Dialog title={error.title} onClose={() => setError(null)} action={error.retry && { label: "RETRY", onClick: error.retry }}>
          <p>{error.message}</p>
        </Dialog>
      )}

      {showSplash && (
        <Splash
          onDone={() => {
            markTitleScreenSeen();
            setShowSplash(false);
          }}
        />
      )}
    </div>
  );
}
