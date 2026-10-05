import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fadeScreen } from "../animation/a9";
import { LoadingPage } from "../pages/LoadingPage";
import { Button } from "../ui/Button";

function PreviewSequence({ exchange }: { exchange: string }) {
  const screenRef = useRef<HTMLElement>(null);
  const [finale, setFinale] = useState(false);
  useLayoutEffect(() => {
    if (screenRef.current) void fadeScreen(screenRef.current, true);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setFinale(true), 2400);
    return () => clearTimeout(timer);
  }, []);
  return <LoadingPage screenRef={screenRef} active symbol={exchange === "NYQ" ? "KO" : "NVDA"}
    marketState="MARKET OPEN" steps={{ quote: "done", news: "done", legend: "done" }} news={[]}
    exchange={{ code: exchange, name: null }} finale={finale} />;
}

/** A local, repeatable preview using the real loading component. No quote or AI requests. */
export function ExchangePreview({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [run, setRun] = useState(0);
  const [exchange, setExchange] = useState("NYQ");
  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);
  return createPortal(
    <dialog ref={dialogRef} className="exchange-preview" aria-label="Exchange animation preview" onCancel={onClose}>
      <PreviewSequence key={`${exchange}-${run}`} exchange={exchange} />
      <div className="exchange-preview__controls">
        <span>ANIMATION PREVIEW · NO SCAN</span>
        <Button variant="normal" onClick={() => setExchange(exchange === "NYQ" ? "NMS" : "NYQ")}>{exchange === "NYQ" ? "NASDAQ" : "NYSE"}</Button>
        <Button variant="buy" onClick={() => setRun(n => n + 1)}>REPLAY</Button>
        <Button variant="normal" onClick={onClose} autoFocus>CLOSE PREVIEW</Button>
      </div>
    </dialog>, document.body,
  );
}
