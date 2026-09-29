import type { ReactNode } from "react";
import { scoreToClass } from "../lib/numbers";
import { LegendEmblem } from "../ui/LegendEmblem";
import type { LegendState } from "./LegendPanel";

interface LegendBannerProps {
  legend: LegendState;
  symbol: string;
  children?: ReactNode;
}

const Gold = ({ children }: { children: ReactNode }) => <mark className="legend-banner__mark">{children}</mark>;

/** Bottom strip in the style of the game's "UNLOCK EXCLUSIVE REWARDS WITH THE LEGEND PASS" banner. */
export function LegendBanner({ legend, symbol, children }: LegendBannerProps) {
  let message: ReactNode;
  if (legend.status === "working") message = <>LEGEND IS ANALYZING <Gold>{symbol}</Gold></>;
  else if (legend.status === "error") message = <>LEGEND IS <Gold>OFFLINE</Gold> · CHECK THE LM STUDIO SERVER</>;
  else if (legend.status === "done")
    message = (
      <>
        LEGEND RATES {symbol} <Gold>{legend.response.rating.toUpperCase()}</Gold> WITH A <Gold>CLASS {scoreToClass(legend.response.score)}</Gold> RANK
      </>
    );
  else message = <>SCAN A STOCK TO UNLOCK <Gold>LEGEND'S READ</Gold></>;

  return (
    <div className="legend-banner">
      <LegendEmblem size={72} className="legend-banner__emblem" working={legend.status === "working"} />
      <p className="legend-banner__text">{message}</p>
      {children}
    </div>
  );
}
