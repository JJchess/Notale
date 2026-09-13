import { trackPreviewLease } from "./resource-lease";
import type { CanvasPreview } from "./resources";
type Grant = Pick<
  CanvasPreview,
  "channel" | "version" | "expiresAt" | "renewAfterMs"
>;
/** A retained runtime owns its grant until the final frame is released. */
export class PreviewLeases {
  private entries = new Map<string, { count: number; stop: () => void }>();
  constructor(
    private start: (
      documentId: string,
      grant: Grant,
    ) => { stop: () => void } = trackPreviewLease,
  ) {}
  retain(documentId: string, grant: Grant) {
    const key = JSON.stringify([documentId, grant.channel]);
    let entry = this.entries.get(key);
    if (!entry) {
      const lease = this.start(documentId, grant);
      entry = { count: 0, stop: () => lease.stop() };
      this.entries.set(key, entry);
    }
    entry.count++;
    const captured = entry;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (this.entries.get(key) !== captured) return;
      if (--captured.count === 0) {
        this.entries.delete(key);
        captured.stop();
      }
    };
  }
  clear() {
    for (const entry of this.entries.values()) entry.stop();
    this.entries.clear();
  }
}
