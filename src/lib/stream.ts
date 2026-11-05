// Same origin by default: the Express server serves both the site and the API
const API_URL = import.meta.env.VITE_API_URL ?? "";

const QUIET_MS = 40_000; // the server pings every 15 s; this long without a word means the line is dead
const RETRY_MS = 3000;

/**
 * A server-sent event stream that keeps itself alive. The browser reconnects by itself after a
 * dropped connection, but gives up for good after an error response (a proxy's 502, say), and a
 * connection that dies quietly on poor Wi-Fi can look open forever. Both are caught here and the
 * stream reopened; each reopen starts with a fresh snapshot from the server.
 * `onState(false)` reports the stream down, and any event means it is up again.
 */
export function openStream(path: string, handlers: Record<string, (data: unknown) => void>, onState: (up: boolean) => void): () => void {
  let source: EventSource | null = null;
  let retry: number | undefined;
  let watchdog: number | undefined;
  let closed = false;

  function heard() {
    window.clearTimeout(watchdog);
    watchdog = window.setTimeout(reopen, QUIET_MS);
  }

  function open() {
    source = new EventSource(`${API_URL}${path}`);
    for (const [event, fn] of Object.entries(handlers)) {
      source.addEventListener(event, (e) => {
        heard();
        fn(JSON.parse((e as MessageEvent).data));
      });
    }
    source.addEventListener("ping", heard);
    source.onopen = heard;
    source.onerror = () => {
      onState(false);
      if (source?.readyState === EventSource.CLOSED) {
        window.clearTimeout(retry);
        retry = window.setTimeout(reopen, RETRY_MS);
      }
    };
    heard();
  }

  function reopen() {
    if (closed) return;
    source?.close();
    onState(false);
    open();
  }

  open();
  return () => {
    closed = true;
    window.clearTimeout(retry);
    window.clearTimeout(watchdog);
    source?.close();
  };
}
