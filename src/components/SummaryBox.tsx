import { useEffect, useRef } from "react";

export interface SummaryRow {
  key: string;
  icon: { id: string; src: string };
  labelId: string;
  label: string;
  numberId: string;
  value: string;
  progressId: string;
  barId: string;
  percent: number;
}

interface SummaryBoxProps {
  rows: SummaryRow[];
  barRun: number; // increments each time a new stock is summarized
}

export function SummaryBox({ rows, barRun }: SummaryBoxProps) {
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const percentsRef = useRef<number[]>([]);
  percentsRef.current = rows.map((row) => row.percent);

  // Snap the bars back to 0 without a transition, then let them fill after 500ms
  useEffect(() => {
    if (barRun === 0) return;
    const bars = barRefs.current;
    bars.forEach((bar) => {
      if (!bar) return;
      bar.classList.add("no-transition");
      bar.style.width = "0%";
      void bar.offsetHeight;
      bar.classList.remove("no-transition");
    });

    const timer = setTimeout(() => {
      bars.forEach((bar, i) => {
        if (bar) bar.style.width = `${percentsRef.current[i]}%`;
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [barRun]);

  return (
    <div id="summaryBox">
      {rows.map((row) => (
        <img key={row.icon.id} className="summaryIcon" id={row.icon.id} src={row.icon.src} alt="" />
      ))}
      {rows.map((row, i) => [
        <div key={row.labelId} className="summaryItem" id={row.labelId}>
          {row.label}
        </div>,
        <div key={row.numberId} className="summaryNumber" id={row.numberId}>
          {row.value}
        </div>,
        <div key={row.progressId} className="progressContainer summaryBar" id={row.progressId}>
          <div
            className="progressBar"
            id={row.barId}
            ref={(el) => {
              barRefs.current[i] = el;
            }}
          ></div>
        </div>,
      ])}
    </div>
  );
}
