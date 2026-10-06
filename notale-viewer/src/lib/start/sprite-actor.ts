import type { Sprite } from "./sprites";

type Frame = keyof Sprite["frames"];
export interface Point { x: number; y: number }

/** One canvas, one animation frame at a time; disposal also settles the current step. */
export class SpriteActor {
  readonly width: number;
  readonly height: number;
  private readonly canvas: HTMLCanvasElement;
  private at: Point = { x: 0, y: 0 };
  private frame: Frame = "stand";
  private raf: number | undefined;
  private settle: ((completed: boolean) => void) | undefined;
  private disposed = false;

  constructor(stage: HTMLElement, private readonly sprite: Sprite, className: string, private readonly scale = 3) {
    this.canvas = stage.ownerDocument.createElement("canvas");
    this.width = this.canvas.width = sprite.frames.stand[0]!.length * scale;
    this.height = this.canvas.height = sprite.frames.stand.length * scale;
    this.canvas.className = className;
    this.canvas.dataset.wizardActor = "";
    this.canvas.setAttribute("aria-hidden", "true");
    stage.append(this.canvas);
  }

  spawn(at: Point) { this.place(at); this.draw("stand"); }

  appear() {
    const at = this.at;
    return this.animate(160, t => {
      this.canvas.style.opacity = String(t);
      this.place({ x: at.x, y: at.y + 6 * (1 - t) });
    });
  }

  flashStaff() {
    return this.animate(260, t => this.draw("stand", Math.sin(t * Math.PI)));
  }

  async hop(to: Point) {
    this.draw("crouch");
    if (!await this.animate(90)) return false;
    const from = this.at;
    this.draw("jump");
    if (!await this.animate(540, t => this.place({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t - 4 * 28 * t * (1 - t),
    }))) return false;
    this.draw("crouch");
    if (!await this.animate(80)) return false;
    this.draw("stand");
    return true;
  }

  leave() {
    const at = this.at;
    return this.animate(320, t => this.place({ x: at.x, y: at.y + this.height * t * t }));
  }

  wait(duration: number) { return this.animate(duration); }

  dispose() {
    this.disposed = true;
    if (this.raf !== undefined) cancelAnimationFrame(this.raf);
    this.raf = undefined;
    this.settle?.(false);
    this.settle = undefined;
    this.canvas.remove();
  }

  private place(at: Point) {
    this.at = at;
    this.canvas.style.left = `${Math.round(at.x - this.width / 2)}px`;
    this.canvas.style.top = `${Math.round(at.y - this.height)}px`;
  }

  private draw(frame: Frame, starLight = 0) {
    this.frame = frame;
    const context = this.canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, this.width, this.height);
    this.sprite.frames[this.frame].forEach((row, y) => [...row].forEach((key, x) => {
      const color = this.sprite.palette[key];
      if (!color) return;
      context.fillStyle = color;
      context.fillRect(x * this.scale, y * this.scale, this.scale, this.scale);
      if (starLight > 0 && x >= 16 && y <= 8 && (key === "g" || key === "c")) {
        context.fillStyle = `rgba(255, 249, 218, ${starLight * 0.9})`;
        context.fillRect(x * this.scale, y * this.scale, this.scale, this.scale);
      }
    }));
  }

  private animate(duration: number, update: (progress: number) => void = () => {}): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    return new Promise(resolve => {
      this.settle = resolve;
      const started = performance.now();
      update(0);
      const tick = (now: number) => {
        this.raf = undefined;
        if (this.disposed) return;
        const progress = Math.min(1, (now - started) / duration);
        update(progress);
        if (progress < 1) this.raf = requestAnimationFrame(tick);
        else { this.settle = undefined; resolve(true); }
      };
      this.raf = requestAnimationFrame(tick);
    });
  }
}
