import type { Ref } from "react";
import { sfx, useSfxMuted, useSfxVolume } from "../audio/sfx";
import { restartFromTitleScreen, updateSettings, useSettings } from "../lib/settings";
import { Button } from "../ui/Button";
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
          <Toggle title="AI DRY RUN" value={dryRun} onChange={onDryRunChange} />
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
