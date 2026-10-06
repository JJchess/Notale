"use client";

import { useEffect, useRef } from "react";
import { HomeComposer } from "../home-composer";
import { useLocale } from "../locale";
import { playWizard, type WizardPlayback } from "./wizard-easter-egg";
import styles from "./start.module.css";

export function StartScreen() {
  const { t } = useLocale();
  const stage = useRef<HTMLDivElement>(null), logo = useRef<HTMLButtonElement>(null), ground = useRef<HTMLDivElement>(null);
  const playback = useRef<WizardPlayback | undefined>(undefined);
  useEffect(() => () => { playback.current?.cancel(); playback.current = undefined; }, []);
  const summon = () => {
    if (playback.current || !stage.current || !logo.current || !ground.current) return;
    const current = playWizard(stage.current, logo.current, ground.current, styles.actor);
    playback.current = current;
    void current.finished.finally(() => { if (playback.current === current) playback.current = undefined; });
  };
  return <main className={styles.home}>
    <div ref={stage} className={styles.content}>
      <h1 className={styles.brand} aria-label="Notale">
        <button ref={logo} type="button" className={styles.summon} aria-label={t("召唤小巫师", "Summon Valar")} onClick={summon}>
          <img src="/brand/notale-lockup.svg" alt="Notale" width={180} height={35} />
        </button>
      </h1>
      <div ref={ground} className={styles.ground}><HomeComposer /></div>
    </div>
  </main>;
}
