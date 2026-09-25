import type { Ref } from "react";
import { compactFormatter, scoreToClass } from "../lib/numbers";
import type { StockData } from "../lib/types";
import { GeminiSummary, type GeminiState } from "./GeminiSummary";
import { SummaryBox, type SummaryRow } from "./SummaryBox";

interface SummaryPageProps {
  pageRef: Ref<HTMLElement>;
  active: boolean;
  stock: StockData;
  barRun: number;
  gemini: GeminiState;
  onBack: () => void;
}

// Maps a value onto a 0-100 bar width, where `max` is a full bar
const normalize = (value: number, max: number) => Math.round((value / max) * 100);

export function SummaryPage({ pageRef, active, stock, barRun, gemini, onBack }: SummaryPageProps) {
  const hasStock = barRun > 0;
  const rvol = (stock.volume / stock.averageVolume).toFixed(1);
  const percentChange = (((stock.currentPrice - stock.lastClose) / stock.lastClose) * 100).toFixed(1);

  const rows: SummaryRow[] = [
    {
      key: "percent",
      icon: { id: "percentUpIcon", src: "/images/PercentUpIcon2.png" },
      labelId: "percentUpBox",
      label: !hasStock || Number(percentChange) > 0 ? "% UP TODAY" : "% DOWN TODAY",
      numberId: "percentUp",
      value: hasStock ? `${percentChange}%` : "0%",
      progressId: "percetProgress",
      barId: "percetProgressBar",
      percent: normalize(Number(percentChange), 100),
    },
    {
      key: "rvol",
      icon: { id: "relVolumeIcon", src: "/images/RelVolumeIcon.png" },
      labelId: "rvolBox",
      label: "RELATIVE VOLUME",
      numberId: "rvol",
      value: hasStock ? `${rvol}X` : "0X",
      progressId: "rvolProgress",
      barId: "rvolProgressBar",
      percent: normalize(Number(rvol), 8),
    },
    {
      key: "price",
      icon: { id: "curPriceIcon", src: "/images/CurrentPriceIcon.png" },
      labelId: "priceBox",
      label: "CURRENT PRICE",
      numberId: "price",
      value: `$${stock.currentPrice.toFixed(2)}`,
      progressId: "priceProgress",
      barId: "priceProgressBar",
      percent: normalize(stock.currentPrice, 30),
    },
    {
      key: "volume",
      icon: { id: "curVolumeIcon", src: "/images/CurrentVolumeIcon.png" },
      labelId: "curVolumeBox",
      label: "CURRENT VOLUME",
      numberId: "currentVolume",
      value: hasStock ? compactFormatter.format(stock.volume) : "0",
      progressId: "curVolumeProgress",
      barId: "curVolumeProgressBar",
      percent: normalize(stock.volume, 20_000_000),
    },
    {
      key: "float",
      icon: { id: "floatIcon", src: "/images/FloatIcon.png" },
      labelId: "floatBox",
      label: "FLOAT/SHARES",
      numberId: "currentFloat",
      value: hasStock ? compactFormatter.format(stock.float) : "0",
      progressId: "curFloatProgress",
      barId: "curFloatBar",
      percent: normalize(stock.float, 20_000_000),
    },
  ];

  const score = gemini.status === "done" ? gemini.response.score : 0;
  const classRank = gemini.status === "done" ? scoreToClass(gemini.response.score) : "?";

  return (
    <section id="summaryPage" className={`page${active ? " active" : ""}`} ref={pageRef}>
      <section id="summarySection">
        <div className="animatedContainer summaryPageTitle">
          <div className="animatedCloak reveal">
            <div className="animatedBox is-hidden text"></div>
            <p style={{ fontSize: "35px" }}>Stock Summary:</p>
          </div>
        </div>

        <div className="animatedContainer rankBoxContainer">
          <div className="animatedCloak reveal">
            <div className="animatedBox is-hidden"></div>
            <div id="rankBox">
              <div className="rankBoxItem" id="rankText">RANK</div>
              <div className="rankBoxItem" id="scoreBox">{`${score}/2000`}</div>
              <div className="rankBoxItem" id="classBox">{classRank}</div>
            </div>
          </div>
        </div>

        <GeminiSummary gemini={gemini} />

        <div className="animatedContainer stockNameContainer">
          <div className="animatedCloak reveal">
            <div>
              <div id="tickerContainer">
                <div id="backgroundTicker">{stock.symbol}</div>
              </div>
              <div id="longNameContainer">
                <div id="longName">{stock.fullName}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="animatedContainer summaryBoxContainer">
          <div className="animatedCloak reveal topdown">
            <SummaryBox rows={rows} barRun={barRun} />
          </div>
        </div>
      </section>
      <button id="backButton" className="themeButton typeNormal" onClick={onBack}>
        BACK
      </button>
      <footer>
        <p>&copy; 2026 My Website Project</p>
      </footer>
    </section>
  );
}
