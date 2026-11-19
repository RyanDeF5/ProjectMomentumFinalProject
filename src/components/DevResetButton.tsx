import { useEffect, useState } from "react";
import { sfx } from "../audio/sfx";
import { useSettings } from "../lib/settings";
import { RefreshIcon } from "../ui/Icons";

// Same origin by default: the Express server serves both the site and the API
const API_URL = import.meta.env.VITE_API_URL ?? "";

/**
 * Developer option (only while DEV OPTIONS is on in Settings): one click starts a page over. The
 * server clears that job's saved results (and abandons an update that's running), then runs a
 * fresh update; the page fills back in as it lands.
 */
export function DevResetButton({ path, what }: { path: "/watchlist/reset" | "/screener/reset" | "/market-news/reset"; what: string }) {
  const { devOptions } = useSettings();
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");

  useEffect(() => {
    if (state !== "done" && state !== "failed") return;
    const timer = window.setTimeout(() => setState("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [state]);

  if (!devOptions) return null;
  const label = { idle: "RESET", busy: "RESETTING", done: "RESET ✓", failed: "RESET FAILED" }[state];
  return (
    <button
      type="button"
      className={`devreset is-${state}`}
      title={`Developer option: clear ${what} and start over`}
      disabled={state === "busy"}
      onClick={() => {
        sfx.play("tap");
        setState("busy");
        fetch(`${API_URL}${path}`, { method: "POST" })
          .then((res) => setState(res.ok ? "done" : "failed"))
          .catch(() => setState("failed"));
      }}
    >
      <span className="devreset__tag">DEV</span>
      <RefreshIcon size={15} />
      <span>{label}</span>
    </button>
  );
}
