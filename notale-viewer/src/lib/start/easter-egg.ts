import { SpriteActor, type Point } from "./sprite-actor";
import { WIZARD } from "./sprites";
import { Vortex } from "./vortex";

/** The parts of the start page the egg plays on. `stage` is the positioned box the wizard is
 * drawn in; `ground` is what he drops behind (the composer); `letters` are the wordmark's glyphs. */
export interface EggParts { stage: HTMLElement; poked: SVGGraphicsElement; letters: SVGGraphicsElement[]; status?: HTMLElement | null; ground: HTMLElement }

/** Poke the `o`: it swells and swallows the status line, Valar climbs out, hops along the word,
 * drops behind the composer, and the status line comes back. Composition only -- the vortex, the
 * actor and the sprite each do one thing. One play at a time. */
export class StartEasterEgg {
  private playing = false;
  private readonly vortex = new Vortex();
  constructor(private readonly parts: EggParts, private readonly reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches) {}

  async play() {
    if (this.playing) return;
    this.playing = true;
    const { poked, status, stage, letters, ground } = this.parts;
    try {
      if (this.reducedMotion) { await poked.animate([{ opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }], { duration: 400 }).finished; return; }
      const box = poked.getBoundingClientRect(), center = new DOMPoint(box.left + box.width / 2, box.top + box.height / 2);
      const swell = poked.animate([{ transform: "scale(1)" }, { transform: "scale(1.45)", offset: 0.25 }, { transform: "scale(1.3)" }],
        { duration: 1100, easing: "cubic-bezier(.3,1.4,.5,1)", fill: "forwards" });
      if (status) await this.vortex.suck(status, center); else await swell.finished;
      await poked.animate([{ transform: "scale(1.3)" }, { transform: "scale(0.9)", offset: 0.6 }, { transform: "scale(1)" }], { duration: 320, fill: "forwards" }).finished;
      swell.cancel();

      // Out of the o, along the tops of the letters after it, down behind the composer.
      const actor = new SpriteActor(stage, WIZARD, 3), origin = stage.getBoundingClientRect();
      const local = (x: number, y: number): Point => ({ x: x - origin.left, y: y - origin.top });
      const top = (el: Element) => { const r = el.getBoundingClientRect(); return local(r.left + r.width / 2, r.top); };
      actor.spawn(local(center.x, center.y + box.height / 2));
      await actor.hop(top(poked), { height: 28 });
      const after = letters.slice(letters.indexOf(poked) + 1);
      for (const letter of [after[1], after.at(-1)].filter((el): el is SVGGraphicsElement => !!el)) await actor.hop(top(letter));
      const floor = ground.getBoundingClientRect();
      await actor.hop(local(floor.left + floor.width * 0.8, floor.top + 6), { height: 24 });
      await actor.leave(actor.height);
    } finally {
      if (status) this.vortex.restore(status);
      this.playing = false;
    }
  }
}
