import type { AnimationSpec } from '@notale/editor/browser';

/** A gesture previews locally, then commits one animation through the normal save queue. */
export function bindAnimationTiming(track: HTMLElement, context: {
  animation: AnimationSpec;
  start: number;
  extent: number;
  current: () => boolean;
  commit: (animation: AnimationSpec) => Promise<unknown>;
  error: (error: unknown) => void;
}) {
  const bar = track.querySelector<HTMLElement>('span')!;
  const original = context.animation;
  let busy = false, suppressClick = false;
  let drag: { pointer: number; x: number; width: number; resize: boolean; moved: boolean; value: number } | undefined;
  function paint(delay: number, duration: number) {
    bar.style.left = `${(context.start + delay - original.delay) / context.extent * 100}%`;
    bar.style.width = `${duration * (original.repeat ?? 1) * (original.autoReverse ? 2 : 1) / context.extent * 100}%`;
    track.title = `延迟 ${delay} ms · 时长 ${duration} ms`;
  }
  function cancel() {
    const pointer = drag?.pointer;
    drag = undefined;
    paint(original.delay, original.duration);
    if (pointer !== undefined && track.hasPointerCapture(pointer)) track.releasePointerCapture(pointer);
  }
  async function save(field: 'delay' | 'duration', value: number) {
    if (value === original[field] || busy || !context.current()) return;
    busy = true; track.setAttribute('aria-busy', 'true');
    try { await context.commit({ ...original, [field]: value }); }
    catch (error) { paint(original.delay, original.duration); context.error(error); }
    finally { busy = false; track.removeAttribute('aria-busy'); }
  }
  track.addEventListener('click', event => {
    if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false; }
  }, true);
  track.addEventListener('pointerdown', event => {
    if (event.button !== 0 || busy || !context.current()) return;
    suppressClick = false;
    const rect = bar.getBoundingClientRect();
    const resize = event.clientX >= rect.right - 9 && event.clientX <= rect.right + 4;
    drag = { pointer: event.pointerId, x: event.clientX, width: track.clientWidth, resize, moved: false, value: original[resize ? 'duration' : 'delay'] };
    track.setPointerCapture(event.pointerId);
    track.focus({ preventScroll: true });
  });
  track.addEventListener('pointermove', event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    if (!context.current()) { cancel(); return; }
    if (Math.abs(event.clientX - drag.x) < 3 && !drag.moved) return;
    drag.moved = true;
    const field = drag.resize ? 'duration' : 'delay';
    const increment = event.altKey ? 10 : 50;
    drag.value = Math.max(0, Math.min(60000, Math.round((original[field] + (event.clientX - drag.x) / Math.max(1, drag.width) * context.extent / (drag.resize ? (original.repeat ?? 1) * (original.autoReverse ? 2 : 1) : 1)) / increment) * increment));
    paint(field === 'delay' ? drag.value : original.delay, field === 'duration' ? drag.value : original.duration);
    event.preventDefault();
  });
  track.addEventListener('pointerup', event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    const result = drag; drag = undefined;
    if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
    if (result.moved) { suppressClick = true; void save(result.resize ? 'duration' : 'delay', result.value); }
  });
  for (const name of ['pointercancel', 'lostpointercapture']) track.addEventListener(name, cancel);
  track.addEventListener('keydown', event => {
    if (event.key === 'Escape' && drag) { suppressClick = true; cancel(); event.preventDefault(); event.stopPropagation(); return; }
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || busy) return;
    event.preventDefault(); event.stopPropagation();
    const field = event.shiftKey ? 'duration' : 'delay';
    const value = Math.max(0, Math.min(60000, original[field] + (event.key === 'ArrowRight' ? 1 : -1) * (event.altKey ? 10 : 50)));
    void save(field, value);
  });
}
