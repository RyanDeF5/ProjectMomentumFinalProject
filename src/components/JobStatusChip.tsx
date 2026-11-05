import { resumeLabel } from "../lib/schedule";
import { useNow } from "../lib/watchlist";
import { Diamond } from "../ui/Diamond";
import { ArrowRightIcon, TimerIcon } from "../ui/Icons";
import { Reveal } from "../ui/Reveal";

function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** What a held job says: off for everything, outside its hours, or out of tokens for today. */
export function heldLabel(state: string, reason: string | null | undefined, nextAt: number | null, now: number): string | null {
  if (state === "limit") return nextAt ? `TOKEN LIMIT · BACK ${resumeLabel(nextAt, now)}` : "DAILY TOKEN LIMIT REACHED";
  if (state !== "offhours") return null;
  if (reason === "ALL AUTO UPDATES PAUSED") return "ALL AUTO UPDATES PAUSED";
  return nextAt ? `OFF HOURS · BACK ${resumeLabel(nextAt, now)}` : "OFF HOURS";
}

/**
 * The pink chip by a page's title: what a background job (the screener, the market news) is
 * doing, ticking every second while it counts down. Tapping it opens the job's settings in the
 * Update Schedule, where how often and when it runs are set.
 */
export function JobStatusChip({
  connected,
  state,
  busy,
  interval,
  nextAt,
  reason,
  clockOffset,
  active,
  onOpen,
}: {
  connected: boolean;
  state: string;
  busy: boolean;
  interval: number;
  nextAt: number | null;
  reason?: string | null;
  clockOffset: number;
  active: boolean;
  onOpen?: () => void;
}) {
  const now = useNow(1000, active && state === "idle" && Boolean(nextAt));
  const serverNow = now - clockOffset;
  const held = heldLabel(state, reason, nextAt, serverNow);
  let status: string;
  if (!connected) status = "CONNECTING";
  else if (state === "waiting") status = "WAITING FOR YOUR SCAN";
  else if (busy) status = "UPDATING";
  else if (held) status = held;
  else if (state === "paused" || !interval) status = "AUTO UPDATE PAUSED";
  else if (nextAt) status = `NEXT UPDATE ${countdown(nextAt - serverNow)}`;
  else status = "READY";
  return (
    <Reveal
      kind="panel"
      wash="pink"
      as={onOpen ? "button" : "div"}
      type={onOpen ? "button" : undefined}
      onClick={onOpen}
      title={onOpen ? "Set how often and when this updates" : undefined}
      className={`mp__timer${busy ? " is-busy" : ""}${held ? " is-held" : ""}${onOpen ? " is-link" : ""}`}
    >
      {busy ? <Diamond size={18} /> : <TimerIcon size={20} />}
      <span aria-live="polite">{status}</span>
      {onOpen && <ArrowRightIcon size={16} />}
    </Reveal>
  );
}
