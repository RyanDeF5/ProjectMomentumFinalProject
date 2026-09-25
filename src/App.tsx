import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AnimationEngine, PAGE_SWITCH_DELAY } from "./animation/AnimationEngine";
import { StartPage } from "./components/StartPage";
import { SummaryPage } from "./components/SummaryPage";
import { TopBar } from "./components/TopBar";
import type { GeminiState } from "./components/GeminiSummary";
import { fetchStockData, generateAIResponse, generateExampleAIResponse } from "./lib/api";
import { useClock } from "./lib/clock";
import type { PageId, StockData } from "./lib/types";

const placeholderStock: StockData = {
  symbol: "STCK",
  fullName: "",
  currentPrice: 0,
  lastClose: 0,
  volume: 0,
  averageVolume: 0,
  float: 0,
};

export default function App() {
  const clock = useClock();

  const [activePage, setActivePage] = useState<PageId>("startPage");
  const [buyButtonsEnabled, setBuyButtonsEnabled] = useState(true);
  const [dryRun, setDryRun] = useState(false);
  const [stock, setStock] = useState(placeholderStock);
  const [barRun, setBarRun] = useState(0);
  const [gemini, setGemini] = useState<GeminiState>({ status: "idle" });

  const topBarRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const pageRefs = {
    startPage: useRef<HTMLElement>(null),
    summaryPage: useRef<HTMLElement>(null),
  };
  const engineRef = useRef<AnimationEngine | null>(null);
  const activePageRef = useRef<PageId>("startPage");
  const transitioningRef = useRef(false);
  const geminiRequestRef = useRef(0);

  useEffect(() => {
    engineRef.current = new AnimationEngine(topBarRef.current!, flashRef.current!);
  }, []);

  function goToPage(targetPageId: PageId) {
    const engine = engineRef.current;
    const currentPage = pageRefs[activePageRef.current].current;
    const targetPage = pageRefs[targetPageId].current;
    if (!engine || !currentPage || !targetPage || transitioningRef.current) return;

    transitioningRef.current = true;
    engine.hidePage(currentPage);

    setTimeout(() => {
      activePageRef.current = targetPageId;
      flushSync(() => setActivePage(targetPageId));
      engine.revealPage(targetPage);
      transitioningRef.current = false;
    }, PAGE_SWITCH_DELAY);
  }

  async function startGemini(stockData: StockData) {
    const requestId = ++geminiRequestRef.current;
    setGemini({ status: "working" });
    try {
      const response = dryRun
        ? await generateExampleAIResponse(stockData)
        : await generateAIResponse(stockData);
      if (requestId === geminiRequestRef.current) setGemini({ status: "done", response });
    } catch (err) {
      console.error("Gemini request failed:", err);
      if (requestId === geminiRequestRef.current) setGemini({ status: "error" });
    }
  }

  function showSummary(stockData: StockData) {
    setStock(stockData);
    setBarRun((run) => run + 1);
    startGemini(stockData);
    goToPage("summaryPage");
  }

  async function superCalculate(symbol: string, volumeFromField: number) {
    if (symbol === "") {
      alert("Please enter a Stock Ticker/Symbol");
      return;
    }

    setBuyButtonsEnabled(false);
    let data;
    try {
      data = await fetchStockData(symbol, clock.marketState);
    } catch (err) {
      console.error("Failed to fetch stock data:", err);
      alert(`Something went wrong with fetching the stock data \n Error: ${err}`);
      setBuyButtonsEnabled(true);
      return;
    }

    showSummary({
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
    goToPage("startPage");
    setTimeout(() => setBuyButtonsEnabled(true), 1000);
  }

  // The original index.html had a stray closing tag that left the first footer and the summary page
  // outside #appContainer; the summary layout was tuned for that, so this tree reproduces it.
  return (
    <>
      <div id="appContainer">
        <main>
          <TopBar clock={clock} containerRef={topBarRef} flashRef={flashRef} />
          <StartPage
            pageRef={pageRefs.startPage}
            active={activePage === "startPage"}
            clock={clock}
            buyButtonsEnabled={buyButtonsEnabled}
            dryRun={dryRun}
            onSuperSubmit={superCalculate}
            onManualSubmit={showSummary}
            onSwitchPage={() => goToPage("summaryPage")}
            onToggleDryRun={() => setDryRun((value) => !value)}
          />
        </main>
      </div>
      <footer>
        <p>&copy; 2026 My Website Project</p>
      </footer>
      <SummaryPage
        pageRef={pageRefs.summaryPage}
        active={activePage === "summaryPage"}
        stock={stock}
        barRun={barRun}
        gemini={gemini}
        onBack={goBack}
      />
    </>
  );
}
