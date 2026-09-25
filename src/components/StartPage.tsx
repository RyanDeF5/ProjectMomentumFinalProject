import { useState, type Ref } from "react";
import type { ClockData } from "../lib/clock";
import { getRandomInt, parseNumber } from "../lib/numbers";
import type { StockData } from "../lib/types";
import { NumberField } from "./NumberField";

interface StartPageProps {
  pageRef: Ref<HTMLElement>;
  active: boolean;
  clock: ClockData;
  buyButtonsEnabled: boolean;
  dryRun: boolean;
  onSuperSubmit: (symbol: string, volumeFromField: number) => void;
  onManualSubmit: (stock: StockData) => void;
  onSwitchPage: () => void;
  onToggleDryRun: () => void;
}

const emptyManualFields = {
  symbol: "",
  volume: "",
  currentPrice: "",
  averageVolume: "",
  lastPrice: "",
  floatShare: "",
};

export function StartPage({
  pageRef,
  active,
  clock,
  buyButtonsEnabled,
  dryRun,
  onSuperSubmit,
  onManualSubmit,
  onSwitchPage,
  onToggleDryRun,
}: StartPageProps) {
  const [superSymbol, setSuperSymbol] = useState("");
  const [superVolume, setSuperVolume] = useState("");
  const [fields, setFields] = useState(emptyManualFields);

  const setField = (key: keyof typeof emptyManualFields) => (value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  const buyClass = `themeButton ${buyButtonsEnabled ? "typeBuy" : "typeDisabled"}`;

  function superCalculate() {
    onSuperSubmit(superSymbol.trim(), parseNumber(superVolume));
  }

  function calculate() {
    if (fields.symbol === "") return;
    onManualSubmit({
      symbol: fields.symbol.trim().toUpperCase(),
      fullName: "Not Identified",
      currentPrice: Number(fields.currentPrice),
      lastClose: Number(fields.lastPrice),
      volume: parseNumber(fields.volume),
      averageVolume: parseNumber(fields.averageVolume),
      float: parseNumber(fields.floatShare),
    });
  }

  function fakeFill() {
    setFields({
      symbol: "TEST",
      currentPrice: `${getRandomInt(30, 35)}`,
      lastPrice: `${getRandomInt(25, 30)}`,
      volume: `${getRandomInt(5000000, 20000000)}`,
      averageVolume: `${getRandomInt(1000000, 10000000)}`,
      floatShare: `${getRandomInt(2000000, 20000000)}`,
    });
  }

  return (
    <section id="startPage" className={`page${active ? " active" : ""}`} ref={pageRef}>
      <section id="topPage">
        <div className="animatedContainer">
          <p id="topMessage">
            Welcome to Project <span className="themeHighlight">Momentum</span>
          </p>
        </div>

        <div className="animatedContainer">
          <div className="animatedCloak reveal">
            <div className="animatedBox is-hidden text"></div>
            <p>
              <span id="timeOfDay" className="themeHighlight">{clock.timeOfDay}</span>
              <span id="date">{clock.date}</span>
            </p>
          </div>
        </div>

        <div className="animatedContainer">
          <div className="animatedCloak reveal">
            <div className="animatedBox is-hidden text"></div>
            <p>
              <span id="hours" className="clock">{clock.hours}:</span>
              <span id="minutes" className="clock">{clock.minutes}:</span>
              <span id="seconds" className="clock">{clock.seconds}</span>
            </p>
          </div>
        </div>
      </section>

      <section id="stockInfoRow">
        <div className="animatedCloak reveal topdown">
          <div className="animatedContainer">
            <div id="superFieldRow">
              <div className="entryLabel" id="superAverageVolumeText">CURRENT VOLUME:</div>
              <NumberField
                className="entryFieldNumberForSuper"
                id="superAverageVolume"
                placeholder="ENTER CURRENT VOLUME"
                value={superVolume}
                onChange={setSuperVolume}
                disabled={clock.marketState !== "PRE-MARKET"}
              />

              <div className="entryLabel" id="superTicker">STOCK TICKER/SYMBOL:</div>
              <input
                className="entryFieldForSuper"
                id="superSymbol"
                placeholder="E.G. AAPL, MSFT"
                value={superSymbol}
                onChange={(e) => setSuperSymbol(e.target.value)}
              />

              <button id="superSubmitButton" className={buyClass} disabled={!buyButtonsEnabled} onClick={superCalculate}>
                SUBMIT
              </button>
            </div>

            <div id="fieldRow">
              <div className="entryLabel">ENTER STOCK SYMBOL:</div>
              <input
                className="entryField"
                id="symbol"
                placeholder="E.G. AAPL, MSFT"
                value={fields.symbol}
                onChange={(e) => setField("symbol")(e.target.value)}
              />
              <div className="entryLabel">CURRENT TRADING VOLUME:</div>
              <NumberField className="entryFieldNumber" id="volume" placeholder="VOLUME" value={fields.volume} onChange={setField("volume")} />
              <div className="entryLabel">ENTER CURRENT PRICE:</div>
              <NumberField
                className="entryFieldNumber"
                id="currentPrice"
                placeholder="CURRENT TRADING PRICE"
                value={fields.currentPrice}
                onChange={setField("currentPrice")}
              />
              <div className="entryLabel">3 MONTH AVERAGE VOLUME:</div>
              <NumberField
                className="entryFieldNumber"
                id="averageVolume"
                placeholder="AVERAGE VOLUME"
                value={fields.averageVolume}
                onChange={setField("averageVolume")}
              />
              <div className="entryLabel">RECENT CLOSING PRICE:</div>
              <NumberField
                className="entryFieldNumber"
                id="lastPrice"
                placeholder="LAST CLOSING PRICE"
                value={fields.lastPrice}
                onChange={setField("lastPrice")}
              />
              <div className="entryLabel">SHARE COUNT/FLOAT:</div>
              <NumberField
                className="entryFieldNumber"
                id="floatShare"
                placeholder="'No' IF NOT AVAILABLE"
                value={fields.floatShare}
                onChange={setField("floatShare")}
              />
              <button id="submitButton" className={buyClass} disabled={!buyButtonsEnabled} onClick={calculate}>
                SUBMIT
              </button>
              <button id="SwitchPage" className="themeButton typeNormal" onClick={onSwitchPage}>
                (DEV OPTION) GO TO PAGE 2
              </button>
              <button id="fakeFillButton" className="themeButton typeNormal" onClick={fakeFill}>
                (DEV OPTION) FILL ALL FIELDS
              </button>
              <button id="dryRunButton" className="themeButton typeNormal" onClick={onToggleDryRun}>
                (DEV OPTION) AI DRY RUN: {String(dryRun).toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}
