import { useCallback, useEffect, useState, type Ref } from "react";
import { ExchangePreview } from "../components/ExchangePreview";
import { music, useMusic } from "../audio/music";
import { sfx, useSfxMuted, useSfxVolume } from "../audio/sfx";
import { fetchLegendStatus } from "../lib/api";
import type { LegendStatus } from "../lib/types";
import { restartFromTitleScreen, updateSettings, useSettings } from "../lib/settings";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { LegendEmblem } from "../ui/LegendEmblem";
import { Reveal } from "../ui/Reveal";
import { SectionTitle } from "../ui/SectionTitle";
import { testNotification, testTokenDrop } from "../lib/notify";
import { testConnection } from "../lib/connection";
import { PHOTO_CREDITS } from "../lib/exchanges";
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
  const [preview, setPreview] = useState(false);
  const muted = useSfxMuted();
  const volume = useSfxVolume();
  const song = useMusic();

  return (
    <section className="screen screen--settings" ref={screenRef} hidden={!active} aria-label="Settings">
      {preview && active && <ExchangePreview onClose={() => setPreview(false)} />}
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
          <Reveal kind="slide" wash="none" className="setting setting--slider">
            <Slider label="MUSIC" value={song.muted ? 0 : song.volume} onChange={(v) => music.setVolume(v)} />
          </Reveal>
          <Toggle title="MUSIC" value={!song.muted} onChange={(on) => music.setMuted(!on)} />
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
          {settings.devOptions && (
            <Reveal kind="slide" wash="none" className="setting">
              <SectionTitle as="h3" size="md">
                TEST ANIMATIONS
              </SectionTitle>
              <div className="setting__buttons">
                <Button variant="buy" sound={null} onClick={() => testNotification("bullish")}>
                  BULLISH NEWS
                </Button>
                <Button variant="normal" sound={null} onClick={() => testNotification("class-up")}>
                  RANKED UP
                </Button>
                <Button variant="normal" sound={null} onClick={() => testNotification("setup")}>
                  NEW SETUP
                </Button>
                <Button variant="normal" sound={null} onClick={testTokenDrop}>
                  TOKEN DROP
                </Button>
                <Button variant="normal" sound={null} onClick={() => setPreview(true)}>
                  EXCHANGE REVEAL
                </Button>
                <Button variant="normal" sound={null} onClick={() => testConnection("weak")}>
                  WEAK CONNECTION
                </Button>
              </div>
            </Reveal>
          )}
          <Reveal kind="slide" wash="none" className="setting setting--credits">
            <SectionTitle as="h3" size="md">
              PHOTO CREDITS
            </SectionTitle>
            <ul className="credits">
              {PHOTO_CREDITS.map((c) => (
                <li key={c.file}>
                  <a href={c.url} target="_blank" rel="noopener noreferrer">
                    {c.title}
                  </a>{" "}
                  · {c.author} ·{" "}
                  <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer">
                    {c.license}
                  </a>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
