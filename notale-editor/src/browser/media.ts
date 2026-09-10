import type { MediaSettings } from '../domain/media.js';
/** Non-destructive trims and step starts over native media controls. Original
 * scripts and unconfigured media remain untouched. Playback failures are surfaced. */
export function mediaController(report: (type: string, data: unknown) => void) {
  const entries = [
    ...document.querySelectorAll<HTMLMediaElement>(
      'video[data-notale-media],audio[data-notale-media]',
    ),
  ].flatMap((el) => {
    try {
      return [{ el, settings: JSON.parse(el.dataset.notaleMedia!) as MediaSettings, frame: 0 }];
    } catch {
      return [];
    }
  });
  const start = (e: (typeof entries)[number]) =>
    Math.min(
      e.settings.startAt,
      Number.isFinite(e.el.duration) ? Math.max(0, e.el.duration - 0.01) : e.settings.startAt,
    );
  const end = (e: (typeof entries)[number]) =>
    Math.min(e.settings.endAt ?? Infinity, e.el.duration || Infinity);
  function play(e: (typeof entries)[number]) {
    void e.el.play().catch((error) => {
      e.el.controls = true;
      report('media-blocked', { target: e.el.dataset.notaleId, message: String(error) });
    });
  }
  for (const e of entries) {
    const { el, settings: s } = e;
    el.autoplay = false;
    el.loop = false;
    el.controls = s.controls;
    el.muted = s.muted;
    el.volume = s.volume;
    el.playbackRate = s.rate;
    const reset = () => {
      if (el.readyState >= 1) el.currentTime = start(e);
    };
    if (el.readyState >= 1) reset();
    else el.addEventListener('loadedmetadata', reset, { once: true });
    const enforce = () => {
      if (el.currentTime >= end(e) - 0.01) {
        if (s.loop && !el.paused) {
          el.currentTime = start(e);
          if (el.ended) play(e);
        } else {
          el.pause();
          if (Math.abs(el.currentTime - end(e)) > 0.005) el.currentTime = end(e);
        }
      }
    };
    function tick() {
      if (el.paused) return;
      enforce();
      e.frame = requestAnimationFrame(tick);
    }
    el.addEventListener('play', () => {
      if (el.currentTime < start(e) || el.currentTime >= end(e) - 0.02) reset();
      cancelAnimationFrame(e.frame);
      e.frame = requestAnimationFrame(tick);
    });
    el.addEventListener('pause', () => cancelAnimationFrame(e.frame));
    el.addEventListener('timeupdate', enforce);
    el.addEventListener('seeking', () => {
      if (el.currentTime < start(e)) el.currentTime = start(e);
      else if (el.currentTime > end(e)) el.currentTime = end(e);
    });
    el.addEventListener('ended', () => {
      if (s.loop) {
        reset();
        play(e);
      }
    });
  }
  let previous = -1;
  return {
    maxStep: Math.max(
      0,
      ...entries.flatMap((e) => [e.settings.startStep ?? 0, ...(e.settings.startSteps ?? [])]),
    ),
    seek(step: number, animate: boolean, enabled: boolean) {
      for (const e of entries) {
        const triggers = [e.settings.startStep, ...(e.settings.startSteps ?? [])].filter(
          (step): step is number => step !== null,
        );
        const trigger = triggers.length ? Math.min(...triggers) : null;
        if (!enabled || !animate || step < previous || (trigger !== null && step < trigger)) {
          e.el.pause();
          if (e.el.readyState >= 1) e.el.currentTime = start(e);
        }
        if (enabled && animate && triggers.includes(step) && step !== previous) {
          if (e.el.readyState >= 1) e.el.currentTime = start(e);
          play(e);
        }
      }
      previous = enabled ? step : -1;
    },
  };
}
