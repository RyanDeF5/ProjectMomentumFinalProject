import { useEffect, useMemo, useState } from "react";
import { prefersReducedMotion } from "../animation/a9";
import { faviconUrl } from "../lib/api";

export interface Source {
  name: string;
  domain: string | null;
}

interface SourceCarouselProps {
  sources: Source[];
  /** Cycles while true; holds still when false */
  spinning: boolean;
  /** Label while cycling, e.g. SEARCHING or LEGEND IS READING */
  verb: string;
  /** Label once finished */
  doneLabel: string;
}

const VISIBLE = 3; // icons shown at once
const CYCLE_MS = 900; // a new site slides in this often

const keyOf = (s: Source) => (s.domain || s.name).toLowerCase();

function SourceIcon({ source }: { source: Source }) {
  return source.domain ? (
    <img src={faviconUrl(source.domain)} alt="" width={16} height={16} decoding="async" draggable={false} />
  ) : (
    <span className="sources__letter">{source.name.slice(0, 1)}</span>
  );
}

/**
 * The sites being searched or read, like an AI search showing the websites it is looking through:
 * a label and a tight row of overlapping site icons. While working, a new site slides in on the
 * left every beat and the oldest shrinks away on the right, so the row stays three icons wide.
 */
export function SourceCarousel({ sources, spinning, verb, doneLabel }: SourceCarouselProps) {
  // Keyed by content: the parent rebuilds the array on every render (the clock ticks each second)
  const signature = sources.map(keyOf).join("|");
  const unique = useMemo(() => {
    const seen = new Set<string>();
    return sources.filter((s) => {
      const key = keyOf(s);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = unique.length;
  const shown = Math.min(VISIBLE, count);
  const cycles = spinning && count > VISIBLE && !prefersReducedMotion();
  const [step, setStep] = useState({ signature, offset: 0 });
  // A new set of sites starts again from the first
  const offset = step.signature === signature ? step.offset : 0;

  useEffect(() => {
    if (!cycles) return;
    const timer = setInterval(() => {
      setStep((prev) => ({ signature, offset: (prev.signature === signature ? prev.offset : 0) + 1 }));
    }, CYCLE_MS);
    return () => clearInterval(timer);
  }, [cycles, signature]);

  if (!count) return null;

  // Newest on the left: sequence numbers offset, offset-1, ... map round the list of sites
  const at = (seq: number) => unique[((seq % count) + count) % count];
  const tiles = Array.from({ length: shown }, (_, k) => ({ seq: offset - k, state: k === 0 && offset > 0 ? "enter" : "" }));
  if (offset > 0 && count > VISIBLE) tiles.push({ seq: offset - VISIBLE, state: "leave" });

  return (
    <div className="sources" aria-live="polite">
      <span className={`sources__label${spinning ? " is-working" : ""}`}>{spinning ? verb : doneLabel}</span>
      <span key={signature} className="sources__stack" aria-hidden>
        {tiles.map(({ seq, state }, k) => (
          <span key={seq} className={`sources__tile${state ? ` is-${state}` : ""}`} style={{ zIndex: VISIBLE + 1 - k }}>
            <SourceIcon source={at(seq)} />
          </span>
        ))}
      </span>
    </div>
  );
}
