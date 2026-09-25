import type { Ref } from "react";
import type { ClockData } from "../lib/clock";

interface TopBarProps {
  clock: ClockData;
  containerRef: Ref<HTMLDivElement>;
  flashRef: Ref<HTMLDivElement>;
}

export function TopBar({ clock, containerRef, flashRef }: TopBarProps) {
  const isOpen = clock.marketState !== "MARKET CLOSED";

  return (
    <div className="topBarContainer" id="topBarCover" ref={containerRef}>
      <div className="flashBox" id="topBarFlashBox" ref={flashRef}></div>
      <div id="topBar">
        <div className={`barItem${isOpen ? " backgroundGreen" : ""}`} id="marketStatus">
          {clock.marketState}
        </div>
        <div className="barItem" id="topClock">
          {`${clock.hours}:${clock.minutes} ${clock.anteMeridiem}`}
        </div>
      </div>
    </div>
  );
}
