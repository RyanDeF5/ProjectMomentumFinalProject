import { useEffect, useLayoutEffect, useRef } from "react";
import { enterScreen, exitScreen } from "../animation/a9";
import { sfx } from "../audio/sfx";
import { Diamond } from "../ui/Diamond";
import { Logo } from "../ui/Logo";
import { Reveal } from "../ui/Reveal";

/**
 * Title screen, like the game's: full-bleed background, light stripes in the top-right corner,
 * the logo low and centered, and the loading diamond bottom-right. Tap (or press a key) to start.
 */
export function Splash({ onDone }: { onDone: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const leavingRef = useRef(false);

  async function leave() {
    if (leavingRef.current || !rootRef.current) return;
    leavingRef.current = true;
    sfx.play("launch");
    await exitScreen(rootRef.current);
    onDone();
  }

  useLayoutEffect(() => {
    if (rootRef.current) void enterScreen(rootRef.current);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Escape") void leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="splash" ref={rootRef} onClick={() => void leave()} role="button" tabIndex={0} aria-label="Tap to start Alpha 9: Legends">
      <div className="splash__bg" data-a9-bg aria-hidden />
      <div className="splash__stripes" aria-hidden>
        <Reveal kind="fade" className="splash__stripe splash__stripe--wide" delay={0} />
        <Reveal kind="fade" className="splash__stripe splash__stripe--pink" delay={80} />
        <Reveal kind="fade" className="splash__stripe splash__stripe--thin" delay={160} />
        <Reveal kind="fade" className="splash__stripe splash__stripe--thin2" delay={200} />
      </div>

      <Reveal kind="pop" className="splash__brand" delay={420}>
        <Logo className="splash__logo" />
      </Reveal>

      <Reveal kind="fade" className="splash__corner" delay={700}>
        <Diamond size={62} />
      </Reveal>
    </div>
  );
}
