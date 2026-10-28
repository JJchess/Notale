/** Real-time media transport. The film owns time; native playback supplies decoded
 * video/audio between frames. Export will use exact seek/capture, not this clock. */
export class NativeMediaTransport {
  private requested?: number;
  private generation = 0;
  private starting = false;
  private disposed = false;
  private boundsFailed = false;
  private hasDecoded=false;
  constructor(private media: HTMLMediaElement, private failed: (message: string) => void) {}
  prepare(time: number, playing: boolean, seek: boolean, allowPending=false): boolean {
    if (this.disposed || this.media.readyState < 1) return false;
    if (Number.isFinite(this.media.duration) && time >= this.media.duration) {
      this.pause(); if (!this.boundsFailed) this.failed('片段的源时间超出媒体实际时长'); this.boundsFailed = true; return false;
    }
    this.boundsFailed = false;
    if (!playing) this.pause();
    if(!this.media.seeking&&this.media.readyState>=2)this.hasDecoded=true;
    const drift = Math.abs(this.media.currentTime - time);
    const force = this.requested === undefined || (seek && this.requested !== time) || (!playing && drift > 0.001);
    // Do not interrupt an outstanding decoder seek. The next tick catches up to a
    // newer scrub target after the previous seek finishes.
    if (!this.media.seeking && (force || drift > 0.12)) {
      this.pause(); this.requested = time;
      if (drift > 0.001) this.media.currentTime = time;
    }
    return !this.media.seeking && this.media.readyState >= 2 || allowPending&&!seek&&this.hasDecoded;
  }
  play() {
    if (this.disposed || this.starting || !this.media.paused) return;
    const generation = ++this.generation; this.starting = true;
    void this.media.play().then(() => {
      if (generation === this.generation) this.starting = false;
    }, error => {
      if (generation !== this.generation || this.disposed) return;
      this.starting = false;
      this.failed(error instanceof Error ? error.message : String(error));
    });
  }
  pause() {
    if (this.starting || !this.media.paused) { this.generation++; this.starting = false; this.media.pause(); }
  }
  dispose() { this.pause(); this.disposed = true; }
}
