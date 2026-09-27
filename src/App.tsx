import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { enterScreen, enterTopBar, exitScreen, exitTopBar } from "./animation/a9";
import { sfx, type SfxName } from "./audio/sfx";
import type { GeminiState } from "./components/GeminiPanel";
import { TopBar } from "./components/TopBar";
import { fetchStockData, generateAIResponse, generateExampleAIResponse } from "./lib/api";
import { useClock } from "./lib/clock";
import { markTitleScreenSeen, shouldShowTitleScreen } from "./lib/settings";
import type { StockData } from "./lib/types";
import { LoadingPage } from "./pages/LoadingPage";
import { SettingsPage } from "./pages/SettingsPage";
import { Splash } from "./pages/Splash";
import { StartPage } from "./pages/StartPage";
import { SummaryPage } from "./pages/SummaryPage";
import { Dialog } from "./ui/Dialog";

type Screen = "start" | "loading" | "summary" | "settings";

// Keep the loading screen up long enough to read, like the game's pre-race screen
const MIN_LOADING_MS = 1400;

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
  const [summaryRun, setSummaryRun] = useState(0);
  const [gemini, setGemini] = useState<GeminiState>({ status: "idle" });
  const [error, setError] = useState<{ title: string; message: string; retry?: () => void } | null>(null);

  const topBarRef = useRef<HTMLElement>(null);
  const screenRefs = {
    start: useRef<HTMLElement>(null),
    loading: useRef<HTMLElement>(null),
    summary: useRef<HTMLElement>(null),
    settings: useRef<HTMLElement>(null),
  };
  const screenRef = useRef<Screen>("start");
  const navQueue = useRef<Promise<void>>(Promise.resolve());
  const queuedTarget = useRef<Screen | null>(null);
  const geminiRequestRef = useRef(0);

  useEffect(() => sfx.preload(), []);

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

  async function startGemini(stockData: StockData) {
    const requestId = ++geminiRequestRef.current;
    setGemini({ status: "working" });
    try {
      const response = dryRun ? await generateExampleAIResponse(stockData) : await generateAIResponse(stockData);
      if (requestId === geminiRequestRef.current) setGemini({ status: "done", response });
    } catch (err) {
      console.error("Gemini request failed:", err);
      if (requestId === geminiRequestRef.current) setGemini({ status: "error" });
    }
  }

  function showSummary(stockData: StockData, sound?: SfxName) {
    setStock(stockData);
    setSummaryRun((run) => run + 1);
    void startGemini(stockData);
    return navigate("summary", sound);
  }

  async function superCalculate(symbol: string, volumeFromField: number) {
    setBuyButtonsEnabled(false);
    setLoadingSymbol(symbol.toUpperCase());
    const stopRace = sfx.play("race");
    const toLoading = navigate("loading");
    const minimum = wait(MIN_LOADING_MS);

    let data;
    try {
      data = await fetchStockData(symbol, clock.marketState);
      await Promise.all([toLoading, minimum]);
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
        retry: () => void superCalculate(symbol, volumeFromField),
      });
      return;
    }

    void showSummary({
      symbol: data.symbol ?? symbol.toUpperCase(),
      fullName: data.fullName,
      currentPrice: data.currentPrice,
      lastClose: data.lastClose,
      volume: clock.marketState === "PRE-MARKET" ? volumeFromField : data.currentVolume,
      averageVolume: data.averageVolume,
      float: data.float,
    });
  }

  function goBack() {
    void navigate("start", "switch");
    setTimeout(() => setBuyButtonsEnabled(true), 1000);
  }

  return (
    <div className="app">
      <TopBar
        barRef={topBarRef}
        clock={clock}
        hidden={screen === "loading" || showSplash}
        onBack={screen === "start" ? undefined : goBack}
        onHome={screen === "start" ? undefined : goBack}
        onSettings={screen === "start" ? () => void navigate("settings", "switch") : undefined}
      />

      <main className="app__screens">
        <StartPage
          screenRef={screenRefs.start}
          active={screen === "start" && !showSplash}
          clock={clock}
          buyButtonsEnabled={buyButtonsEnabled}
          dryRun={dryRun}
          onSuperSubmit={superCalculate}
          onManualSubmit={(stockData) => void showSummary(stockData, "switch")}
          onSwitchPage={() => void navigate("summary", "switch")}
          onDryRunChange={setDryRun}
          lastScan={summaryRun > 0 ? { stock, gemini } : null}
          onOpenLastScan={() => void navigate("summary", "switch")}
        />
        <LoadingPage screenRef={screenRefs.loading} active={screen === "loading"} symbol={loadingSymbol} marketState={clock.marketState} />
        <SummaryPage screenRef={screenRefs.summary} active={screen === "summary"} stock={stock} summaryRun={summaryRun} gemini={gemini} onBack={goBack} />
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
