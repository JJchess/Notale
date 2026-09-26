import type { Sprite } from "./sprites";

type Frame = keyof Sprite["frames"];
export interface Point { x: number; y: number }

/** A sprite on a stage: drawn on a canvas at a whole-pixel scale, placed by its feet (bottom
 * centre) in the stage's coordinates, moved by hops. Timing and drawing only; where it goes is
 * the caller's business. */
export class SpriteActor {
  private readonly canvas: HTMLCanvasElement;
  private at: Point = { x: 0, y: 0 };
  constructor(private readonly stage: HTMLElement, private readonly sprite: Sprite, private readonly scale = 4) {
    const rows = sprite.frames.stand;
    this.canvas = stage.ownerDocument.createElement("canvas");
    this.canvas.width = rows[0]!.length * scale;
    this.canvas.height = rows.length * scale;
    this.canvas.className = "sprite-actor";
    this.canvas.setAttribute("aria-hidden", "true");
  }
  get width() { return this.canvas.width; }
  get height() { return this.canvas.height; }

  spawn(at: Point, frame: Frame = "stand") {
    this.stage.append(this.canvas);
    this.draw(frame);
    this.place(at);
  }
  /** A jump from where it stands to `to`, peaking `height` px above the higher end. */
  async hop(to: Point, { height = 36, duration = 460 } = {}) {
    this.draw("crouch");
    await this.wait(90);
    const from = this.at, peak = Math.min(from.y, to.y) - height, started = performance.now();
    this.draw("jump");
    await new Promise<void>(done => {
      const tick = (now: number) => {
        const t = Math.min(1, (now - started) / duration);
        // A parabola through from, peak and to.
        const y = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * (2 * peak - (from.y + to.y) / 2) + t * t * to.y;
        this.place({ x: from.x + (to.x - from.x) * t, y });
        if (t < 1) requestAnimationFrame(tick); else done();
      };
      requestAnimationFrame(tick);
    });
    this.draw("crouch");
    await this.wait(80);
    this.draw("stand");
  }
  /** Drops `depth` px (behind whatever sits above it on the stage) and is gone. */
  async leave(depth = 60) {
    await this.canvas.animate([{ transform: "translateY(0)", opacity: 1 }, { transform: `translateY(${depth}px)`, opacity: 0 }],
      { duration: 380, easing: "cubic-bezier(.5,0,.9,.4)", fill: "forwards" }).finished;
    this.canvas.remove();
  }
  private place(at: Point) {
    this.at = at;
    this.canvas.style.left = `${Math.round(at.x - this.canvas.width / 2)}px`;
    this.canvas.style.top = `${Math.round(at.y - this.canvas.height)}px`;
  }
  private draw(frame: Frame) {
    const context = this.canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.sprite.frames[frame].forEach((row, y) => [...row].forEach((key, x) => {
      const color = this.sprite.palette[key];
      if (!color) return;
      context.fillStyle = color;
      context.fillRect(x * this.scale, y * this.scale, this.scale, this.scale);
    }));
  }
  private wait(ms: number) { return new Promise(done => setTimeout(done, ms)); }
}
