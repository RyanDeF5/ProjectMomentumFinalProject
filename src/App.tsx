import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { enterScreen, enterTopBar, exitScreen, exitTopBar } from "./animation/a9";
import { sfx, type SfxName } from "./audio/sfx";
import type { LegendState } from "./components/LegendPanel";
import { TopBar } from "./components/TopBar";
import { analyzeWithLegend, exampleLegendAnalysis, fetchNews, fetchStockData, fetchTokenUsage } from "./lib/api";
import { useClock } from "./lib/clock";
import { markTitleScreenSeen, shouldShowTitleScreen } from "./lib/settings";
import type { NewsItem, StockData, TokenUsage } from "./lib/types";
import { LoadingPage, type LoadingSteps } from "./pages/LoadingPage";
import type { NewsState } from "./components/NewsStrip";
import { SettingsPage } from "./pages/SettingsPage";
import { TokensPage } from "./pages/TokensPage";
import { Splash } from "./pages/Splash";
import { StartPage } from "./pages/StartPage";
import { SummaryPage } from "./pages/SummaryPage";
import { Dialog } from "./ui/Dialog";

type Screen = "start" | "loading" | "summary" | "settings" | "tokens";

// Keep the loading screen up long enough to read, like the game's pre-race screen
const MIN_LOADING_MS = 1400;
const STEP_DONE_PAUSE_MS = 450;
const USAGE_REFRESH_MS = 60_000;

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
  const clock = useClock();

  const [screen, setScreen] = useState<Screen>("start");
  const [showSplash, setShowSplash] = useState(showTitleScreenOnLoad);
  const [buyButtonsEnabled, setBuyButtonsEnabled] = useState(true);
  const [dryRun, setDryRun] = useState(false);
  const [stock, setStock] = useState(placeholderStock);
  const [loadingSymbol, setLoadingSymbol] = useState("");
  const [steps, setSteps] = useState<LoadingSteps>({ quote: "pending", news: "pending", legend: "pending" });
  const [news, setNews] = useState<NewsState>({ status: "idle", items: [] });
  const [summaryRun, setSummaryRun] = useState(0);
  const [legend, setLegend] = useState<LegendState>({ status: "idle" });
  const [usage, setUsage] = useState<TokenUsage | null>(null);
  const [usageError, setUsageError] = useState(false);
  const [error, setError] = useState<{ title: string; message: string; retry?: () => void } | null>(null);

  const topBarRef = useRef<HTMLElement>(null);
  const screenRefs = {
    start: useRef<HTMLElement>(null),
    loading: useRef<HTMLElement>(null),
    summary: useRef<HTMLElement>(null),
    settings: useRef<HTMLElement>(null),
    tokens: useRef<HTMLElement>(null),
  };
  // Where Settings/Tokens were opened from, so Back returns there
  const returnTo = useRef<Screen>("start");
  const screenRef = useRef<Screen>("start");
  const navQueue = useRef<Promise<void>>(Promise.resolve());
  const queuedTarget = useRef<Screen | null>(null);
  const legendRequestRef = useRef(0);

  useEffect(() => sfx.preload(), []);

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

      const bar = topBarRef.current;
      const fromEl = screenRefs[from].current;
      await Promise.all([fromEl && exitScreen(fromEl), bar && from !== "loading" && exitTopBar(bar)]);

      screenRef.current = target;
      flushSync(() => setScreen(target));
      window.scrollTo(0, 0);

      if (bar && target !== "loading") void enterTopBar(bar);
      const toEl = screenRefs[target].current;
      if (queuedTarget.current === target) queuedTarget.current = null;
      if (toEl) await enterScreen(toEl);
    });
    return navQueue.current;
  }

  /** Run Legend on a stock. Resolves to whether it produced an analysis. */
  async function runLegend(stockData: StockData, stories: NewsItem[]): Promise<boolean> {
    const requestId = ++legendRequestRef.current;
    setLegend({ status: "working" });
    try {
      const response = dryRun
        ? await exampleLegendAnalysis(stockData, clock.marketState, stories)
        : await analyzeWithLegend(stockData, clock.marketState, stories);
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
    setBuyButtonsEnabled(false);
    setLoadingSymbol(symbol.toUpperCase());
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
    setStock(stockData);
    setSummaryRun((run) => run + 1);
    await navigate("summary");
    // Pick up the tokens this scan used now that the top bar is back, so the counter rolls up in view
    if (analyzed) refreshUsage();
  }

  function superCalculate(symbol: string, volumeFromField: number) {
    void scan(symbol, async () => {
      const data = await fetchStockData(symbol, clock.marketState);
      return {
        symbol: data.symbol ?? symbol.toUpperCase(),
        fullName: data.fullName,
        currentPrice: data.currentPrice,
        lastClose: data.lastClose,
        volume: clock.marketState === "PRE-MARKET" ? volumeFromField : data.currentVolume,
        averageVolume: data.averageVolume,
        float: data.float,
      };
    });
  }

  function goBack() {
    const target = screen === "settings" || screen === "tokens" ? returnTo.current : "start";
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

  return (
    <div className="app">
      <TopBar
        barRef={topBarRef}
        clock={clock}
        hidden={screen === "loading" || showSplash}
        onBack={screen === "start" ? undefined : goBack}
        onHome={screen === "start" ? undefined : goHome}
        onSettings={screen === "start" ? () => openOverlayScreen("settings") : undefined}
        usage={usage}
        onTokens={screen === "tokens" ? undefined : () => openOverlayScreen("tokens")}
      />

      <main className="app__screens">
        <StartPage
          screenRef={screenRefs.start}
          active={screen === "start" && !showSplash}
          clock={clock}
          buyButtonsEnabled={buyButtonsEnabled}
          dryRun={dryRun}
          onSuperSubmit={superCalculate}
          onManualSubmit={(stockData) => void scan(stockData.symbol, stockData)}
          onSwitchPage={() => void navigate("summary", "switch")}
          onDryRunChange={setDryRun}
          lastScan={summaryRun > 0 ? { stock, legend } : null}
          onOpenLastScan={() => void navigate("summary", "switch")}
        />
        <LoadingPage screenRef={screenRefs.loading} active={screen === "loading"} symbol={loadingSymbol} marketState={clock.marketState} steps={steps} news={news.items} />
        <SummaryPage screenRef={screenRefs.summary} active={screen === "summary"} stock={stock} summaryRun={summaryRun} legend={legend} news={news} onBack={goBack} />
        <TokensPage screenRef={screenRefs.tokens} active={screen === "tokens"} usage={usage} error={usageError} />
        <SettingsPage screenRef={screenRefs.settings} active={screen === "settings"} dryRun={dryRun} onDryRunChange={setDryRun} />
      </main>

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
