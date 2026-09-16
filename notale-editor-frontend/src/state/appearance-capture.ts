import { appearanceSelection, type AppearanceObject } from "./appearance";
export interface AppearanceCaptureResult {
  fields: Record<string, string | boolean>;
  objectFields: Record<string, Record<string, string | boolean>>;
  mixed: string[];
  rectangles: Record<string, { width: number; height: number }>;
}
type Capture = {
  computedStyles: Record<string, Record<string, string>>;
  rectangles?: { id: string; width: number; height: number }[];
};
/** Owns async capture generations. A rejected old request cannot repaint a newer selection. */
export class AppearanceCapture {
  private generation = 0;
  private disposed = false;
  constructor(
    private context: {
      key: () => string;
      capture: (ids: string[]) => Promise<Capture>;
      accept: (result: AppearanceCaptureResult) => void;
    },
  ) {}
  async read(targets: AppearanceObject[]) {
    if (this.disposed || !targets.length) return;
    const generation = ++this.generation,
      key = this.context.key(),
      source = structuredClone(targets);
    let capture: Capture;
    try {
      capture = await this.context.capture(source.map((o) => o.id));
    } catch {
      capture = { computedStyles: {} };
    }
    if (
      this.disposed ||
      generation !== this.generation ||
      key !== this.context.key()
    )
      return;
    this.context.accept({
      ...appearanceSelection(source, capture.computedStyles),
      rectangles: Object.fromEntries(
        (capture.rectangles ?? []).map((rect) => [
          rect.id,
          { width: rect.width, height: rect.height },
        ]),
      ),
    });
  }
  invalidate() {
    this.generation++;
  }
  dispose() {
    this.disposed = true;
    this.invalidate();
  }
}
