import { useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { sfx } from "../audio/sfx";
import { heldLabel } from "../components/JobStatusChip";
import { formatTokens } from "../lib/numbers";
import {
  clockLabel,
  coverage,
  everyLabel,
  jobCost,
  matchingPreset,
  PRESETS,
  presetPatch,
  runs,
  SESSIONS,
  sessionsLabel,
  useSchedule,
} from "../lib/schedule";
import type { HoursWindow, JobKey, JobSchedule, ScheduleSnapshot, SchedulePatch, SessionKey } from "../lib/types";
import { agoLabel, useNow } from "../lib/watchlist";
import { Button } from "../ui/Button";
import { Diamond } from "../ui/Diamond";
import { Dropdown } from "../ui/Dropdown";
import { Glint } from "../ui/Glint";
import { Reveal } from "../ui/Reveal";
import { RevealText } from "../ui/RevealText";
import { Segmented } from "../ui/Segmented";
import { TokenIcon } from "../ui/TokenIcon";

/** A job's live state, from its own event stream (fresher than the schedule's snapshot). */
export interface LiveJob {
  connected: boolean;
  state: string;
  busy: boolean;
  nextAt: number | null;
  reason?: string | null;
  symbol?: string | null;
  clockOffset: number;
}

interface SchedulePageProps {
  screenRef: Ref<HTMLElement>;
  active: boolean;
  dryRun: boolean;
  live: Record<JobKey, LiveJob>;
  onOpenJob: (job: JobKey) => void;
  onUpdateNow: (job: JobKey) => void;
  /** Which tab is open: the overview or a job (pages open their own job's tab) */
  view: ScheduleView;
  onViewChange: (view: ScheduleView) => void;
}

export type ScheduleView = "overview" | JobKey;

const JOBS: { key: JobKey; number: string; title: string; detail: string; page: string }[] = [
  { key: "watchlist", number: "01", title: "WATCHLIST", detail: "LIVE PRICE, NEWS AND A NEW LEGEND SCORE FOR EVERY SAVED STOCK", page: "WATCHLIST" },
  { key: "screener", number: "02", title: "STOCK SCREENER", detail: "HUNTS THE MARKET FOR MOVERS; LEGEND GRADES THE HOTTEST", page: "SCREENER" },
  { key: "news", number: "03", title: "MARKET NEWS", detail: "THE DAY'S HEADLINES, READ AND BRIEFED BY LEGEND", page: "NEWS" },
];

const ON_OFF = [
  { value: "on", label: "ENABLED" },
  { value: "off", label: "DISABLED" },
] as const;

const HALF_HOURS = Array.from({ length: 48 }, (_, i) => ({ value: i * 30, label: clockLabel(i * 30) }));

function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)}H ${String(m % 60).padStart(2, "0")}M`;
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function duration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s}S`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}M ${String(s % 60).padStart(2, "0")}S` : `${Math.floor(m / 60)}H ${String(m % 60).padStart(2, "0")}M`;
}

function hoursLabel(minutes: number): string {
  if (minutes >= 1440) return "24H";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}H ${m}M` : `${h}H`;
}

/** What a job is doing right now, in a few words. */
function liveLabel(job: LiveJob, interval: number, now: number): { text: string; tone: "busy" | "on" | "held" | "off" } {
  const serverNow = now - job.clockOffset;
  if (!job.connected) return { text: "OFFLINE", tone: "off" };
  if (job.busy) return { text: job.state === "waiting" ? "WAITING FOR YOUR SCAN" : "UPDATING NOW", tone: "busy" };
  const held = heldLabel(job.state, job.reason, job.nextAt, serverNow);
  if (held) return { text: held, tone: "held" };
  if (!interval || job.state === "paused") return { text: "AUTO UPDATE OFF", tone: "off" };
  if (job.nextAt) return { text: `NEXT${job.symbol ? ` ${job.symbol}` : ""} IN ${countdown(job.nextAt - serverNow)}`, tone: "on" };
  return { text: "READY", tone: "on" };
}

function Section({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <div className="sched__section">
      <div className="sched__section-head">
        <h3 className="sched__section-title">{title}</h3>
        {note && <span className="sched__section-note">{note}</span>}
      </div>
      {children}
    </div>
  );
}

// ---------- Timeline ----------

const TICKS = [
  { at: 0, label: "12 AM" },
  { at: 240, label: "4 AM" },
  { at: 570, label: "9:30" },
  { at: 960, label: "4 PM" },
  { at: 1200, label: "8 PM" },
  { at: 1440, label: "12 AM" },
];

const BANDS: { key: SessionKey; from: number; to: number; label: string }[] = [
  { key: "overnight", from: 0, to: 240, label: "NIGHT" },
  { key: "premarket", from: 240, to: 570, label: "PRE-MARKET" },
  { key: "open", from: 570, to: 960, label: "MARKET OPEN" },
  { key: "afterhours", from: 960, to: 1200, label: "AFTER HOURS" },
  { key: "overnight", from: 1200, to: 1440, label: "NIGHT" },
];

const at = (minute: number) => `${(minute / 1440) * 100}%`;

/** A day from midnight to midnight: the sessions, and the stretches each job runs. */
function Timeline({ rows, weekend, nowMinute }: { rows: { key: string; label: string; job: JobSchedule; off: boolean }[]; weekend: boolean; nowMinute: number | null }) {
  return (
    <div className={`tline${weekend ? " is-weekend" : ""}`}>
      <div className="tline__row tline__row--bands">
        <span className="tline__name" />
        <div className="tline__track">
          {weekend ? (
            <span className="tline__band is-weekend" style={{ left: 0, width: "100%" }}>
              WEEKEND · MARKET CLOSED
            </span>
          ) : (
            BANDS.map((b, i) => (
              <span key={i} className={`tline__band is-${b.key}`} style={{ left: at(b.from), width: at(b.to - b.from) }}>
                {b.label}
              </span>
            ))
          )}
        </div>
      </div>
      {rows.map((r) => (
        <div key={r.key} className={`tline__row${r.off ? " is-off" : ""}`}>
          <span className="tline__name">{r.label}</span>
          <div className="tline__track tline__track--job">
            {!r.off &&
              runs(r.job, weekend).map(([from, to]) => (
                <span key={from} className="tline__run" style={{ left: at(from), width: at(to - from) }} />
              ))}
            {r.off && <span className="tline__offnote">AUTO UPDATE OFF</span>}
          </div>
        </div>
      ))}
      <div className="tline__row tline__row--axis">
        <span className="tline__name" />
        <div className="tline__track tline__track--axis">
          {TICKS.map((t) => (
            <span key={t.at} className="tline__tick" style={{ left: at(t.at) }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>
      {nowMinute !== null && (
        <div className="tline__now-layer" aria-hidden>
          <span className="tline__name" />
          <div className="tline__track tline__track--now">
            <span className="tline__now" style={{ left: at(nowMinute) }}>
              <em>NOW</em>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Pickers ----------

/** Session toggles: lime when the job runs in that session. */
function SessionPicker({ value, onChange }: { value: SessionKey[]; onChange: (next: SessionKey[]) => void }) {
  return (
    <div className="spick" role="group" aria-label="Sessions">
      {SESSIONS.map((s) => {
        const on = value.includes(s.key);
        return (
          <button
            key={s.key}
            type="button"
            aria-pressed={on}
            className={`spick__opt${on ? " is-on" : ""}`}
            onClick={() => {
              sfx.play("tap");
              onChange(on ? value.filter((k) => k !== s.key) : [...value, s.key]);
            }}
          >
            <span className="spick__check" aria-hidden />
            <span className="spick__label">{s.label}</span>
            <span className="spick__range">{s.range}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A row of choices in the settings screen's boxy style, wrapping when there are many. */
function Choices<T extends number>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="a9-seg sched__choices" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={`a9-seg__opt${o.value === value ? " is-on" : ""}`}
          onClick={() => {
            if (o.value === value) return;
            sfx.play("tap");
            onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const shortEvery = (s: number) => (s >= 3600 ? `${s / 3600}H` : s >= 60 ? `${s / 60} MIN` : `${s}S`);

// ---------- Cost ----------

function CostStats({ snap, job, dryRun }: { snap: ScheduleSnapshot; job: JobKey; dryRun: boolean }) {
  const cost = jobCost(snap, job, dryRun);
  const interval = snap.info[job].interval;
  const per = job === "watchlist" ? `ALL ${snap.info.watchlist.count} STOCKS` : "PER UPDATE";
  return (
    <div className="sched__costs">
      <span className="mp__stat">
        <span className="mp__stat-label">{per}</span>
        <span className="mp__stat-value">
          <TokenIcon size={20} />
          {dryRun ? "0" : `~${formatTokens(cost.perUpdate)}`}
        </span>
        <span className="mp__stat-sub">TAKES ~{duration(cost.updateMs)}</span>
      </span>
      <span className="mp__stat">
        <span className="mp__stat-label">PER HOUR</span>
        <span className="mp__stat-value">{interval ? `~${formatTokens(cost.perHour)}` : "0"}</span>
        <span className="mp__stat-sub">WHILE IT RUNS</span>
      </span>
      <span className="mp__stat">
        <span className="mp__stat-label">PER WEEKDAY</span>
        <span className="mp__stat-value">{interval ? `~${formatTokens(cost.weekday)}` : "0"}</span>
        <span className="mp__stat-sub">{interval ? `~${cost.updatesPerWeekday.toLocaleString("en-US")} ${job === "watchlist" ? "ROUNDS" : "UPDATES"}` : "AUTO UPDATE OFF"}</span>
      </span>
      <span className="mp__stat">
        <span className="mp__stat-label">PER WEEK</span>
        <span className="mp__stat-value">{interval ? `~${formatTokens(cost.week)}` : "0"}</span>
        <span className="mp__stat-sub">{dryRun ? "DRY RUN: NO TOKENS" : "ON THIS SCHEDULE"}</span>
      </span>
    </div>
  );
}

// ---------- Panels ----------

function JobPanel({
  snap,
  job,
  live,
  now,
  dryRun,
  apply,
  onOpen,
  onUpdateNow,
}: {
  snap: ScheduleSnapshot;
  job: (typeof JOBS)[number];
  live: LiveJob;
  now: number;
  dryRun: boolean;
  apply: (patch: SchedulePatch) => void;
  onOpen: () => void;
  onUpdateNow: () => void;
}) {
  const key = job.key;
  const info = snap.info[key];
  const sched = snap.jobs[key];
  const on = info.interval > 0;
  const status = liveLabel(live, info.interval, now);
  const covered = coverage(sched);
  const change = (patch: NonNullable<SchedulePatch["jobs"]>[JobKey]) => apply({ jobs: { [key]: patch } });
  const intervals = info.intervals.filter((s) => s > 0);
  const nowDate = new Date(now);
  const weekendToday = nowDate.getDay() === 0 || nowDate.getDay() === 6;
  const [day, setDay] = useState<"weekday" | "weekend">(weekendToday ? "weekend" : "weekday");
  const custom = Boolean(sched.hours);
  const hours: HoursWindow = sched.hours ?? { from: 570, to: 960 };

  return (
    <div className="sched__detail">
      <div className="sched__hero">
        <span className="sched__stage">
          <span className="sched__stage-tag">JOB</span>
          <span className="sched__stage-number">{job.number}</span>
        </span>
        <div className="sched__hero-text">
          <h2 className="sched__hero-title">{job.title}</h2>
          <p className="sched__hero-detail">
            {job.detail}
            {key !== "watchlist" && (
              <span className="sched__hero-last"> · LAST UPDATE {agoLabel((snap.info[key] as { lastFinishedAt: number }).lastFinishedAt || null, now - live.clockOffset)}</span>
            )}
          </p>
        </div>
        <span className={`sched__live is-${status.tone}`}>
          {status.tone === "busy" && <Diamond size={16} />}
          {status.text}
        </span>
      </div>

      <div className="sched__grid">
        <Section title="AUTO UPDATE">
          <Segmented label="AUTO UPDATE" value={on ? "on" : "off"} onChange={(v) => change({ enabled: v === "on" })} options={[...ON_OFF]} />
        </Section>

        <Section title={key === "watchlist" ? "HOW OFTEN (EACH STOCK)" : "HOW OFTEN"} note={on ? everyLabel(info.interval) : "OFF"}>
          <Choices label="HOW OFTEN" options={intervals.map((s) => ({ value: s, label: shortEvery(s) }))} value={info.interval} onChange={(interval) => change({ interval })} />
        </Section>

        {key === "screener" && (
          <Section title="CHECK TOP" note="STOCKS LEGEND GRADES EACH UPDATE">
            <Choices
              label="CHECK TOP"
              options={snap.info.screener.boardSizes.map((n) => ({ value: n, label: `${n} STOCKS` }))}
              value={snap.info.screener.boardSize}
              onChange={(boardSize) => change({ boardSize })}
            />
          </Section>
        )}
        {key === "news" && (
          <Section title="READ TOP" note="STORIES LEGEND READS EACH UPDATE">
            <Choices
              label="READ TOP"
              options={snap.info.news.storyCounts.map((n) => ({ value: n, label: `${n} STORIES` }))}
              value={snap.info.news.storyCount}
              onChange={(storyCount) => change({ storyCount })}
            />
          </Section>
        )}
        {key === "watchlist" && (
          <Section title="STOCKS" note="ADD OR REMOVE THEM ON THE WATCHLIST">
            <div className="sched__fact">
              <strong>{snap.info.watchlist.count}</strong> OF {snap.info.watchlist.limit} SAVED · EACH UPDATE IS A PRICE CHECK, A NEWS SEARCH AND A NEW LEGEND SCORE
            </div>
          </Section>
        )}

        <Section title="WHEN IT RUNS" note={`${hoursLabel(covered.weekday)} OF EACH WEEKDAY${covered.weekend ? ` · ${hoursLabel(covered.weekend)} ON WEEKEND DAYS` : ""}`}>
          <SessionPicker value={sched.sessions} onChange={(sessions) => change({ sessions })} />
        </Section>

        <Section title="HOURS" note={custom ? `ONLY ${clockLabel(hours.from)} TO ${clockLabel(hours.to)}, WITHIN THE SESSIONS ABOVE` : "EVERY HOUR OF THE SESSIONS ABOVE"}>
          <div className="sched__hours">
            <Segmented
              label="HOURS"
              value={custom ? "custom" : "all"}
              onChange={(v) => change({ hours: v === "custom" ? hours : null })}
              options={[
                { value: "all", label: "ALL SESSION HOURS" },
                { value: "custom", label: "CUSTOM" },
              ]}
            />
            {custom && (
              <div className="sched__hours-pick">
                <Dropdown label="FROM" options={HALF_HOURS} value={hours.from} onChange={(from) => change({ hours: { ...hours, from } })} />
                <Dropdown label="TO" options={HALF_HOURS} value={hours.to} onChange={(to) => change({ hours: { ...hours, to } })} />
              </div>
            )}
          </div>
        </Section>
      </div>

      {on && covered.weekday + covered.weekend === 0 && (
        <p className="sched__warn">THIS SCHEDULE NEVER RUNS: PICK A SESSION THAT OVERLAPS THE HOURS YOU CHOSE.</p>
      )}

      <div className="sched__plan">
        <div className="sched__plan-head">
          <h3 className="sched__section-title">THE DAY AT A GLANCE</h3>
          <Segmented
            label="DAY"
            value={day}
            onChange={setDay}
            options={[
              { value: "weekday", label: "WEEKDAY" },
              { value: "weekend", label: "WEEKEND" },
            ]}
          />
        </div>
        <Timeline
          rows={[{ key, label: job.page, job: sched, off: !on }]}
          weekend={day === "weekend"}
          nowMinute={(day === "weekend") === weekendToday ? nowDate.getHours() * 60 + nowDate.getMinutes() : null}
        />
      </div>

      <div className="sched__foot">
        <CostStats snap={snap} job={key} dryRun={dryRun} />
        <div className="sched__actions">
          <Button variant="normal" onClick={onOpen}>
            OPEN {job.page}
          </Button>
          <Button variant="buy" size="lg" disabled={live.busy || !live.connected} onClick={onUpdateNow}>
            {live.busy ? "UPDATING" : "UPDATE NOW"}
            <Glint idle />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Overview({ snap, live, now, dryRun, apply }: { snap: ScheduleSnapshot; live: Record<JobKey, LiveJob>; now: number; dryRun: boolean; apply: (patch: SchedulePatch) => void }) {
  const nowDate = new Date(now);
  const weekendToday = nowDate.getDay() === 0 || nowDate.getDay() === 6;
  const [day, setDay] = useState<"weekday" | "weekend">(weekendToday ? "weekend" : "weekday");
  const preset = matchingPreset(snap);
  const costs = JOBS.map((j) => jobCost(snap, j.key, dryRun));
  const weekday = costs.reduce((a, c) => a + c.weekday, 0);
  const week = costs.reduce((a, c) => a + c.week, 0);
  const limit = snap.dailyTokenLimit;
  const used = snap.today;

  return (
    <div className="sched__detail">
      <div className="sched__plan">
        <div className="sched__plan-head">
          <h3 className="sched__section-title">THE DAY AT A GLANCE</h3>
          <Segmented
            label="DAY"
            value={day}
            onChange={setDay}
            options={[
              { value: "weekday", label: "WEEKDAY" },
              { value: "weekend", label: "WEEKEND" },
            ]}
          />
        </div>
        <Timeline
          rows={JOBS.map((j) => ({ key: j.key, label: j.page, job: snap.jobs[j.key], off: !snap.info[j.key].interval || snap.paused }))}
          weekend={day === "weekend"}
          nowMinute={(day === "weekend") === weekendToday ? nowDate.getHours() * 60 + nowDate.getMinutes() : null}
        />
        <ul className="sched__summary">
          {JOBS.map((j, i) => {
            const status = liveLabel(live[j.key], snap.info[j.key].interval, now);
            return (
              <li key={j.key}>
                <span className="sched__summary-name">{j.page}</span>
                <span className="sched__summary-rule">
                  {snap.info[j.key].interval ? `${everyLabel(snap.info[j.key].interval)} · ${sessionsLabel(snap.jobs[j.key])}${snap.jobs[j.key].hours ? ` · ${clockLabel(snap.jobs[j.key].hours!.from)}-${clockLabel(snap.jobs[j.key].hours!.to)}` : ""}` : "OFF"}
                </span>
                <span className={`sched__summary-state is-${status.tone}`}>{status.text}</span>
                <span className="sched__summary-cost">
                  <TokenIcon size={16} />~{formatTokens(costs[i].weekday)} / WEEKDAY
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <Section title="PRESETS" note="ONE TAP SETS HOW OFTEN AND WHEN ALL THREE RUN">
        <div className="presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`preset${preset === p.id ? " is-on" : ""}`}
              onClick={() => {
                sfx.play("tap");
                apply(presetPatch(p));
              }}
            >
              <span className="preset__title">{p.title}</span>
              <span className="preset__detail">{p.detail}</span>
              <span className="preset__rules">
                {JOBS.map((j) => (
                  <span key={j.key}>
                    {j.page} {shortEvery(p.jobs[j.key].interval)}
                  </span>
                ))}
              </span>
              {preset === p.id && <span className="preset__badge">ACTIVE</span>}
            </button>
          ))}
        </div>
      </Section>

      <div className="sched__grid sched__grid--general">
        <Section title="AUTO UPDATES" note={snap.paused ? "NOTHING RUNS ON ITS OWN; UPDATE NOW STILL WORKS" : "EACH JOB FOLLOWS ITS SCHEDULE"}>
          <Segmented
            label="AUTO UPDATES"
            value={snap.paused ? "paused" : "on"}
            onChange={(v) => apply({ paused: v === "paused" })}
            options={[
              { value: "on", label: "ENABLED" },
              { value: "paused", label: "PAUSE ALL" },
            ]}
          />
        </Section>
        <Section title="KEEP RUNNING WITH THE APP CLOSED" note={snap.background ? "THE SERVER UPDATES ON SCHEDULE EVEN WITH NO PAGE OPEN" : "UPDATES ONLY RUN WHILE THE APP IS OPEN"}>
          <Segmented label="KEEP RUNNING" value={snap.background ? "on" : "off"} onChange={(v) => apply({ background: v === "on" })} options={[...ON_OFF]} />
        </Section>
        <Section title="DAILY TOKEN LIMIT" note="AUTO UPDATES STOP FOR THE DAY ONCE IT'S REACHED">
          <div className="sched__limit">
            <Dropdown
              label="LIMIT"
              options={snap.tokenLimits.map((n) => ({ value: n, label: n ? `${formatTokens(n)} TOKENS` : "NO LIMIT" }))}
              value={limit}
              onChange={(dailyTokenLimit) => apply({ dailyTokenLimit })}
            />
            <div className="sched__meter">
              <span className="sched__meter-label">
                TODAY <strong>{formatTokens(used)}</strong>
                {limit ? ` / ${formatTokens(limit)}` : ""}
              </span>
              <span className="sched__meter-track">
                <span className={`sched__meter-fill${limit && used >= limit ? " is-full" : ""}`} style={{ width: limit ? `${Math.min(100, (used / limit) * 100)}%` : "0%" }} />
              </span>
            </div>
          </div>
        </Section>
      </div>

      <div className="sched__foot">
        <div className="sched__costs">
          <span className="mp__stat">
            <span className="mp__stat-label">ALL JOBS · WEEKDAY</span>
            <span className="mp__stat-value">
              <TokenIcon size={20} />~{formatTokens(weekday)}
            </span>
            <span className="mp__stat-sub">{dryRun ? "DRY RUN: NO TOKENS" : limit && weekday > limit ? "MORE THAN YOUR DAILY LIMIT" : "ON THIS SCHEDULE"}</span>
          </span>
          <span className="mp__stat">
            <span className="mp__stat-label">ALL JOBS · WEEK</span>
            <span className="mp__stat-value">~{formatTokens(week)}</span>
            <span className="mp__stat-sub">5 WEEKDAYS + THE WEEKEND</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** The update schedule for the three AI jobs, laid out like the game's car upgrade screen. */
export function SchedulePage({ screenRef, active, dryRun, live, onOpenJob, onUpdateNow, view, onViewChange: setView }: SchedulePageProps) {
  const { schedule: snap, error, apply } = useSchedule(active);
  const now = useNow(1000, active);
  const panelRef = useRef<HTMLDivElement>(null);
  // Each job's settings start from the top
  useLayoutEffect(() => {
    if (panelRef.current) panelRef.current.scrollTop = 0;
  }, [view]);

  const onCount = snap ? JOBS.filter((j) => snap.info[j.key].interval > 0).length : 0;
  const weekday = snap ? JOBS.reduce((a, j) => a + jobCost(snap, j.key, dryRun).weekday, 0) : 0;

  return (
    <section className="screen screen--schedule" ref={screenRef} hidden={!active} aria-label="Update schedule">
      <div className="screen__bg screen__bg--menu" data-a9-bg aria-hidden />

      <div className="sched">
        <header className="mp__head sched__head">
          <div className="mp__title">
            <Reveal kind="fade" className="mp__rule" />
            <h1 className="mp__heading">
              <RevealText>UPDATE SCHEDULE</RevealText>
            </h1>
            <div className="mp__chips">
              <Reveal kind="panel" wash="pink" className="mp__timer">
                <span>{!snap ? (error ? "OFFLINE" : "LOADING") : snap.paused ? "ALL AUTO UPDATES PAUSED" : `${onCount} OF 3 JOBS ON`}</span>
              </Reveal>
              <Reveal kind="panel" className="mp__legend">
                <TokenIcon size={20} />
                <span>{snap ? `${formatTokens(snap.today)} TODAY${snap.dailyTokenLimit ? ` / ${formatTokens(snap.dailyTokenLimit)}` : ""}` : "--"}</span>
              </Reveal>
            </div>
          </div>
          <Reveal kind="fade" className="mp__aplus">
            <span className="mp__aplus-tag">PER WEEKDAY</span>
            <span className="mp__aplus-value">~{formatTokens(weekday)}</span>
          </Reveal>
        </header>

        <div className="sched__body">
          <Reveal kind="slide" wash="none" className="sched__jobs">
            <nav aria-label="Jobs">
              <button type="button" className={`sjob sjob--overview${view === "overview" ? " is-on" : ""}`} onClick={() => (sfx.play("tap"), setView("overview"))}>
                <span className="sjob__number">ALL</span>
                <span className="sjob__text">
                  <span className="sjob__title">OVERVIEW</span>
                  <span className="sjob__rule">PRESETS, LIMITS AND THE WHOLE DAY</span>
                </span>
              </button>
              {JOBS.map((j) => {
                const status = snap ? liveLabel(live[j.key], snap.info[j.key].interval, now) : { text: "--", tone: "off" as const };
                const sched = snap?.jobs[j.key];
                const interval = snap?.info[j.key].interval ?? 0;
                return (
                  <button key={j.key} type="button" className={`sjob${view === j.key ? " is-on" : ""}`} onClick={() => (sfx.play("tap"), setView(j.key))}>
                    <span className="sjob__number">{j.number}</span>
                    <span className="sjob__text">
                      <span className="sjob__title">{j.title}</span>
                      <span className="sjob__rule">{sched ? `${interval ? everyLabel(interval) : "OFF"} · ${sessionsLabel(sched)}` : "--"}</span>
                      <span className={`sjob__state is-${status.tone}`}>
                        {status.tone === "busy" && <Diamond size={12} />}
                        {status.text}
                      </span>
                    </span>
                    {sched && (
                      <span className="sjob__bar" aria-hidden>
                        {interval > 0 && !snap!.paused && runs(sched).map(([from, to]) => <i key={from} style={{ left: at(from), width: at(to - from) }} />)}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </Reveal>

          <Reveal kind="slide" wash="none" className="sched__panel" ref={panelRef}>
            {!snap ? (
              <div className="sboard__empty">
                <span>{error ? "THE SCHEDULE IS UNAVAILABLE: THE SERVER CAN'T BE REACHED." : "LOADING THE SCHEDULE…"}</span>
              </div>
            ) : view === "overview" ? (
              <Overview snap={snap} live={live} now={now} dryRun={dryRun} apply={apply} />
            ) : (
              <JobPanel
                key={view}
                snap={snap}
                job={JOBS.find((j) => j.key === view)!}
                live={live[view]}
                now={now}
                dryRun={dryRun}
                apply={apply}
                onOpen={() => onOpenJob(view)}
                onUpdateNow={() => onUpdateNow(view)}
              />
            )}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
