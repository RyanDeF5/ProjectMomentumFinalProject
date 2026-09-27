import { LockIcon } from "../ui/Icons";
import { Reveal } from "../ui/Reveal";

// Home-screen mode row, like the game's LEGEND PASS / SPECIAL EVENTS / ... / MY CAREER tiles.
// The scanner comes first; locked tiles mark features planned for the investing app.
const MODES = [
  { top: "MARKET", bottom: "SCANNER", active: true },
  { top: "WATCH", bottom: "LIST" },
  { top: "MY", bottom: "PORTFOLIO" },
  { top: "PRICE", bottom: "ALERTS" },
  { top: "MARKET", bottom: "NEWS" },
];

export function ModeBar() {
  return (
    <nav className="modes" aria-label="Modes">
      {MODES.map((mode, i) => (
        <Reveal
          key={mode.bottom}
          kind="slide"
          className={`mode${mode.active ? " is-active" : " is-locked"}`}
          delay={380 + i * 55}
          aria-current={mode.active ? "page" : undefined}
          aria-disabled={mode.active ? undefined : "true"}
        >
          {!mode.active && (
            <span className="mode__lock" aria-label="Coming soon">
              <LockIcon />
            </span>
          )}
          <span className="mode__top">{mode.top}</span>
          <span className="mode__bottom">{mode.bottom}</span>
        </Reveal>
      ))}
    </nav>
  );
}
