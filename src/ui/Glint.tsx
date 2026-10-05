import { useEffect, useRef, useState } from "react";

/**
 * The game's PLAY-button shine: a diagonal glint sweeps across, then the element flashes white
 * and settles. Place inside a positioned element; it replays each time `token` changes (not on
 * first render), e.g. when a watched stock finishes an update. `idle` repeats it every few
 * seconds instead, like the PLAY button waiting on the home screen.
 */
export function Glint({ token, idle }: { token?: unknown; idle?: boolean }) {
  const last = useRef(token);
  const [plays, setPlays] = useState(0);

  useEffect(() => {
    if (Object.is(token, last.current)) return;
    last.current = token;
    setPlays((n) => n + 1);
  }, [token]);

  if (idle) return <span className="a9-glint a9-glint--idle" aria-hidden />;
  return plays ? <span key={plays} className="a9-glint" aria-hidden /> : null;
}
