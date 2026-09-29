import { useCallback, useEffect, useState, type Ref } from "react";
import { sfx, useSfxMuted, useSfxVolume } from "../audio/sfx";
import { fetchLegendStatus } from "../lib/api";
import type { LegendStatus } from "../lib/types";
import { restartFromTitleScreen, updateSettings, useSettings } from "../lib/settings";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { LegendEmblem } from "../ui/LegendEmblem";
import { Reveal } from "../ui/Reveal";
import { SectionTitle } from "../ui/SectionTitle";
import { Segmented } from "../ui/Segmented";
import { Slider } from "../ui/Slider";

interface SettingsPageProps {
  screenRef: Ref<HTMLElement>;
  active: boolean;
  dryRun: boolean;
  onDryRunChange: (dryRun: boolean) => void;
}

const ON_OFF = [
  { value: "on", label: "ENABLED" },
  { value: "off", label: "DISABLED" },
] as const;

function Toggle({ title, value, onChange }: { title: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <Reveal kind="slide" wash="none" className="setting">
      <SectionTitle as="h3" size="md">
        {title}
      </SectionTitle>
      <Segmented label={title} value={value ? "on" : "off"} onChange={(v) => onChange(v === "on")} options={[...ON_OFF]} />
    </Reveal>
  );
}

type StatusState = { state: "checking" } | { state: "ready"; status: LegendStatus } | { state: "unreachable" };

/** Legend's LM Studio connection, checked when Settings opens. */
function LegendStatusCard({ active }: { active: boolean }) {
  const [check, setCheck] = useState<StatusState>({ state: "checking" });

  const refresh = useCallback(() => {
    setCheck({ state: "checking" });
    fetchLegendStatus()
      .then((status) => setCheck({ state: "ready", status }))
      .catch(() => setCheck({ state: "unreachable" }));
  }, []);

  useEffect(() => {
    if (active) refresh();
  }, [active, refresh]);

  const online = check.state === "ready" && check.status.online;
  const chip =
    check.state === "checking" ? (
      <Chip tone="slate">CHECKING...</Chip>
    ) : online ? (
      <Chip tone="lime">ONLINE</Chip>
    ) : (
      <Chip tone="pink">OFFLINE</Chip>
    );

  return (
    <Reveal kind="slide" wash="none" className="setting setting--legend">
      <div className="legend-status">
        <LegendEmblem size={72} working={check.state === "checking"} />
        <div className="legend-status__titles">
          <span className="legend__title">LEGEND</span>
          <span className="legend__subtitle">AI SERVER</span>
        </div>
        <dl className="legend-status__facts">
          <div>
            <dt>STATUS</dt>
            <dd>{chip}</dd>
          </div>
          <div>
            <dt>SERVER</dt>
            <dd>{check.state === "ready" ? check.status.url.replace(/^https?:\/\//, "") : "--"}</dd>
          </div>
          <div>
            <dt>MODEL</dt>
            <dd>{check.state === "ready" ? (check.status.model ?? "--") : "--"}</dd>
          </div>
          {check.state === "ready" && online && check.status.latencyMs !== undefined && (
            <div>
              <dt>RESPONSE</dt>
              <dd>{check.status.latencyMs} MS</dd>
            </div>
          )}
        </dl>
        <Button variant="normal" sound="tap" onClick={refresh} disabled={check.state === "checking"}>
          CHECK CONNECTION
        </Button>
      </div>
    </Reveal>
  );
}

/** Settings laid out like the game's SOUND & DISPLAY screen. No access control yet (testing only). */
export function SettingsPage({ screenRef, active, dryRun, onDryRunChange }: SettingsPageProps) {
  const settings = useSettings();
  const muted = useSfxMuted();
  const volume = useSfxVolume();

  return (
    <section className="screen screen--settings" ref={screenRef} hidden={!active} aria-label="Settings">
      <div className="screen__bg screen__bg--menu" data-a9-bg aria-hidden />

      <div className="settings">
        <SectionTitle as="h1" size="lg">
          SOUND &amp; SETTINGS
        </SectionTitle>

        <div className="settings__grid">
          <LegendStatusCard active={active} />
          <Reveal kind="slide" wash="none" className="setting setting--slider">
            <Slider label="SFX" value={volume} onChange={(v) => sfx.setVolume(v)} onCommit={() => sfx.play("tap")} />
          </Reveal>
          <Toggle
            title="SOUND EFFECTS"
            value={!muted}
            onChange={(on) => sfx.setMuted(!on)}
          />
          <Toggle title="TITLE SCREEN" value={settings.titleScreen} onChange={(on) => updateSettings({ titleScreen: on })} />
          <Toggle title="DEV OPTIONS" value={settings.devOptions} onChange={(on) => updateSettings({ devOptions: on })} />
          <Toggle title="LEGEND DRY RUN" value={dryRun} onChange={onDryRunChange} />
          {settings.devOptions && (
            <Reveal kind="slide" wash="none" className="setting">
              <SectionTitle as="h3" size="md">
                RELOAD GAME
              </SectionTitle>
              <Button variant="normal" className="setting__button" onClick={restartFromTitleScreen}>
                RESTART FROM TITLE SCREEN
              </Button>
            </Reveal>
          )}
        </div>
      </div>
    </section>
  );
}
