import { useEffect, useState, type Ref } from "react";
import { TokenHourChart } from "../components/TokenHourChart";
import { sfx } from "../audio/sfx";
import { formatTokens } from "../lib/numbers";
import type { TokenTally, TokenUsage } from "../lib/types";
import { Reveal } from "../ui/Reveal";
import { SectionTitle } from "../ui/SectionTitle";
import { TokenPile } from "../ui/TokenPile";

interface TokensPageProps {
  screenRef: Ref<HTMLElement>;
  active: boolean;
  usage: TokenUsage | null;
  error: boolean;
}

interface CardSpec {
  period: string;
  pick: (usage: TokenUsage) => TokenTally;
  level: 1 | 2 | 3 | 4;
  ribbon?: { text: string; tone: "purple" | "pink" };
}

const CARDS: CardSpec[] = [
  { period: "TODAY", pick: (u) => u.today, level: 1, ribbon: { text: "LIVE", tone: "purple" } },
  { period: "THIS WEEK", pick: (u) => u.week, level: 2 },
  { period: "THIS MONTH", pick: (u) => u.month, level: 3 },
  { period: "LIFETIME", pick: (u) => u.lifetime, level: 4, ribbon: { text: "ALL TIME", tone: "pink" } },
];

const EMPTY: TokenTally = { tokens: 0, prompt: 0, completion: 0, requests: 0, hours: Array(24).fill(0), hourScans: Array(24).fill(0), untimed: 0 };

// Bars grow once the screen has built in; straight away when switching period
const ENTER_DELAY_MS = 520;

function formatSince(day: string | null): string {
  if (!day) return "YOUR FIRST SCAN";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase();
}

/** Legend token usage, laid out like the game's token shop. */
export function TokensPage({ screenRef, active, usage, error }: TokensPageProps) {
  const [selected, setSelected] = useState(0);
  const [picked, setPicked] = useState(false);

  // Each visit opens on today, with the graph growing in after the screen
  useEffect(() => {
    if (active) return;
    setSelected(0);
    setPicked(false);
  }, [active]);

  const current = CARDS[selected];

  return (
    <section className="screen screen--tokens" ref={screenRef} hidden={!active} aria-label="Legend tokens">
      <div className="screen__bg screen__bg--menu" data-a9-bg aria-hidden />

      <div className="tokens">
        <div className="tokens__head">
          <SectionTitle as="h1" size="lg">
            LEGEND TOKENS
          </SectionTitle>
          <Reveal kind="fade" className="tokens__note">
            <span className="tokens__note-bar" aria-hidden />
            TOKENS USED BY LEGEND'S ANALYSES
          </Reveal>
        </div>

        <div className="tokens__body">
          <div className="tokens__rail" aria-hidden>
            <span>TOKENS</span>
          </div>

          <div className="tokens__grid">
            {CARDS.map((card, i) => {
              const tally = usage ? card.pick(usage) : EMPTY;
              return (
                <Reveal
                  key={card.period}
                  as="button"
                  type="button"
                  kind="slide"
                  className={`token-card${i === selected ? " is-selected" : ""}`}
                  delay={220 + i * 60}
                  aria-pressed={i === selected}
                  onClick={() => {
                    if (i === selected) return;
                    sfx.play("tap");
                    setSelected(i);
                    setPicked(true);
                  }}
                >
                  <span className="token-card__art">
                    <span className="token-card__watermark" aria-hidden />
                    <span className="token-card__tag">TOKENS</span>
                    <span className="token-card__count">{usage ? formatTokens(tally.tokens) : "--"}</span>
                    <span className="token-card__detail">
                      {tally.requests} {tally.requests === 1 ? "SCAN" : "SCANS"}
                    </span>
                    <span className="token-card__split">
                      {formatTokens(tally.prompt)} IN · {formatTokens(tally.completion)} OUT
                    </span>
                    <TokenPile level={card.level} />
                    {card.ribbon && <span className={`token-card__ribbon is-${card.ribbon.tone}`}>{card.ribbon.text}</span>}
                  </span>
                  <span className="token-card__bar">{card.period}</span>
                </Reveal>
              );
            })}
          </div>
        </div>

        <Reveal kind="slide" className="tokens__chart" delay={460}>
          <TokenHourChart
            tally={usage ? current.pick(usage) : null}
            period={current.period}
            nowHour={selected === 0 && usage ? usage.hour : null}
            delayMs={picked ? 0 : ENTER_DELAY_MS}
            hourlySince={usage?.hourlySince ?? null}
          />
        </Reveal>

        <Reveal kind="fade" className="tokens__foot">
          {error ? (
            <span className="pink">TOKEN USAGE IS NOT AVAILABLE AT THIS MOMENT</span>
          ) : (
            <>
              DAILY ALLOWANCE <strong>{usage?.dailyLimit ? formatTokens(usage.dailyLimit) : "∞ UNLIMITED"}</strong>
              <span className="tokens__dot" aria-hidden />
              TRACKING SINCE <strong>{formatSince(usage?.since ?? null)}</strong>
              <span className="tokens__dot" aria-hidden />
              DAYS RESET AT MIDNIGHT, WEEKS ON MONDAY
            </>
          )}
        </Reveal>
      </div>
    </section>
  );
}
