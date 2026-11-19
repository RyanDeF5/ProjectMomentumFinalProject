import { useEffect, useState } from "react";
import { isAppActive } from "../lib/activity";
import { useJobProgress, type TopJob } from "../lib/jobProgress";

const APP_TITLE = "Alpha 9: Legends";
const API_URL = import.meta.env.VITE_API_URL ?? "";

/**
 * The browser tab's title while updates run: "NEWS 42% · Alpha 9: Legends" (and "+1" for each
 * further job). Updates wait while the app isn't in front, so from another tab or window it reads
 * "PAUSED · NEWS 42%" instead, or "UPDATING IN THE BACKGROUND" when the schedule keeps jobs running
 * with the app away. Renders nothing.
 */
export function TabTitle({ jobs }: { jobs: TopJob[] }) {
  const first = jobs[0] ?? null;
  const { pct } = useJobProgress(first);
  const percent = first?.progress ? `${Math.round(pct * 100)}%` : "";
  const [away, setAway] = useState(() => !isAppActive());
  // Whether jobs keep running with the app away (the schedule's KEEP RUNNING switch); asked when leaving
  const [background, setBackground] = useState(false);

  useEffect(() => {
    const changed = () => {
      const nowAway = !isAppActive();
      setAway(nowAway);
      if (nowAway) {
        fetch(`${API_URL}/schedule`)
          .then((res) => res.json())
          .then((snap: { background?: boolean }) => setBackground(Boolean(snap.background)))
          .catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", changed);
    window.addEventListener("focus", changed);
    window.addEventListener("blur", changed);
    return () => {
      document.removeEventListener("visibilitychange", changed);
      window.removeEventListener("focus", changed);
      window.removeEventListener("blur", changed);
    };
  }, []);

  const label = first ? `${first.label}${percent ? ` ${percent}` : ""}${jobs.length > 1 ? ` +${jobs.length - 1}` : ""}` : "";
  const held = Boolean(first?.held);
  useEffect(() => {
    if (!label) document.title = APP_TITLE;
    else if (away) document.title = background ? `UPDATING IN THE BACKGROUND · ${APP_TITLE}` : `PAUSED · ${label} · ${APP_TITLE}`;
    else document.title = `${held ? "WAITING · " : ""}${label} · ${APP_TITLE}`;
  }, [label, away, background, held]);

  useEffect(
    () => () => {
      document.title = APP_TITLE;
    },
    [],
  );
  return null;
}
