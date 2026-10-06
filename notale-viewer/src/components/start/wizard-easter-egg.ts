import { SpriteActor } from "../../lib/start/sprite-actor";
import { WIZARD } from "../../lib/start/sprites";

export interface WizardPlayback { cancel(): void; finished: Promise<void> }

/** Coordinates are measured only on a deliberate summon. No idle animation or layout work. */
export function playWizard(stage: HTMLElement, logo: HTMLElement, ground: HTMLElement, className: string): WizardPlayback {
  const actor = new SpriteActor(stage, WIZARD, className);
  const origin = stage.getBoundingClientRect(), brand = logo.getBoundingClientRect(), floor = ground.getBoundingClientRect();
  actor.spawn({
    x: Math.min(origin.width - actor.width / 2, brand.right - origin.left + 36),
    y: brand.bottom - origin.top,
  });

  const cancel = () => actor.dispose();
  const visibility = () => { if (document.visibilityState === "hidden") cancel(); };
  window.addEventListener("resize", cancel);
  document.addEventListener("visibilitychange", visibility);
  const finished = (async () => {
    try {
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        await actor.wait(700);
        return;
      }
      if (!await actor.appear() || !await actor.flashStaff()) return;
      if (!await actor.hop({ x: floor.left - origin.left + floor.width * 0.8, y: floor.top - origin.top + 1 })) return;
      await actor.leave();
    } finally {
      window.removeEventListener("resize", cancel);
      document.removeEventListener("visibilitychange", visibility);
      actor.dispose();
    }
  })();
  return { cancel, finished };
}
