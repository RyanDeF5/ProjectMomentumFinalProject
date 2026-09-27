import type { Ref } from "react";
import { GeminiPanel, type GeminiState } from "../components/GeminiPanel";
import { RankBlock } from "../components/RankBlock";
import { StatRow } from "../components/StatRow";
import { compactFormatter } from "../lib/numbers";
import type { StockData } from "../lib/types";
import { useCountUp } from "../lib/useCountUp";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { Reveal } from "../ui/Reveal";
import { RevealText } from "../ui/RevealText";
import { SectionTitle } from "../ui/SectionTitle";

interface SummaryPageProps {
  screenRef: Ref<HTMLElement>;
  active: boolean;
  stock: StockData;
  /** Increments each time a new stock is summarized */
  summaryRun: number;
  gemini: GeminiState;
  onBack: () => void;
}

export function SummaryPage({ screenRef, active, stock, summaryRun, gemini, onBack }: SummaryPageProps) {
  const hasStock = summaryRun > 0;
  const rvol = hasStock ? stock.volume / stock.averageVolume : 0;
  const percentChange = hasStock ? ((stock.currentPrice - stock.lastClose) / stock.lastClose) * 100 : 0;
  const up = !hasStock || percentChange > 0;
  const price = useCountUp(stock.currentPrice, { token: summaryRun, delay: 300, duration: 1000 });

  // Bar scales match the original: 100% gain, 8x RVOL, $30, 20M volume and 20M float fill a bar
  const stats = [
    {
      icon: "/images/icons/PercentUpIcon2.png",
      label: up ? "% UP TODAY" : "% DOWN TODAY",
      value: percentChange,
      format: (v: number) => `${v.toFixed(1)}%`,
      fill: percentChange / 100,
    },
    { icon: "/images/icons/RelVolumeIcon.png", label: "RELATIVE VOLUME", value: rvol, format: (v: number) => `${v.toFixed(1)}X`, fill: rvol / 8 },
    {
      icon: "/images/icons/CurrentPriceIcon.png",
      label: "CURRENT PRICE",
      value: stock.currentPrice,
      format: (v: number) => `$${v.toFixed(2)}`,
      fill: stock.currentPrice / 30,
    },
    {
      icon: "/images/icons/CurrentVolumeIcon.png",
      label: "CURRENT VOLUME",
      value: stock.volume,
      format: (v: number) => compactFormatter.format(v),
      fill: stock.volume / 20_000_000,
    },
    {
      icon: "/images/icons/FloatIcon.png",
      label: "FLOAT/SHARES",
      value: stock.float,
      format: (v: number) => compactFormatter.format(v),
      fill: stock.float / 20_000_000,
    },
  ];

  return (
    <section className="screen screen--summary" ref={screenRef} hidden={!active} aria-label="Stock summary">
      <div className="screen__bg screen__bg--menu" data-a9-bg aria-hidden />

      <div className="summary">
        <div className="summary__heading">
          <SectionTitle as="h1" size="lg">
            STOCK SUMMARY
          </SectionTitle>
        </div>

        <div className="summary__left">
          <div className="nameplate">
            <Reveal kind="panel" className="nameplate__brand">
              {stock.fullName || "NOT IDENTIFIED"}
            </Reveal>
            <Reveal kind="panel" className="nameplate__model">
              {stock.symbol}
            </Reveal>
          </div>

          <Reveal kind="panel" className="stats card">
            {stats.map((stat, i) => (
              <StatRow key={stat.icon} {...stat} token={summaryRun} delay={320 + i * 60} />
            ))}
          </Reveal>
        </div>

        <div className="summary__center">
          <Reveal kind="slide" wash="none" className="price-hud">
            <span className="price-hud__label">LAST PRICE · USD</span>
            <span className="price-hud__value">${Number.isFinite(price) ? price.toFixed(2) : "N/A"}</span>
          </Reveal>
          {hasStock && (
            <Reveal kind="panel" wash={up ? "lime" : "pink"} className={`price-hud__change${up ? " is-up" : " is-down"}`}>
              <span aria-hidden>{up ? "▲" : "▼"}</span>
              <span className="skew">{Number.isFinite(percentChange) ? `${percentChange.toFixed(1)}%` : "N/A"} TODAY</span>
            </Reveal>
          )}
        </div>

        <div className="summary__right">
          <RankBlock gemini={gemini} />
          <GeminiPanel gemini={gemini} />
        </div>

        <div className="summary__actions">
          <Button variant="normal" onClick={onBack}>
            BACK
          </Button>
          <Reveal kind="fade" className="summary__source">
            <Chip tone="dark" size="sm">
              {stock.fullName === "Not Identified" ? "DATA: MANUAL ENTRY" : "DATA: YAHOO FINANCE"}
            </Chip>
            <span className="summary__disclaimer">
              <RevealText dir="rtl">NOT FINANCIAL ADVICE</RevealText>
            </span>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
