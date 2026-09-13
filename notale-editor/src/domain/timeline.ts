import type { AnimationSpec, Slide } from './model.js';

export interface Cue {
  spec: AnimationSpec;
  start: number;
  end: number;
  eventTarget?: string;
}
export function timeline(slide: Pick<Slide, 'animations'>): Cue[] {
  const clocks = new Map<number, Cue>();
  return slide.animations.map((spec) => {
    const previous = clocks.get(spec.step) ?? { start: 0, end: 0, eventTarget: undefined };
    const start =
      (spec.trigger === 'after-previous'
        ? previous.end
        : spec.trigger === 'with-previous'
          ? previous.start
          : 0) + spec.delay;
    const eventTarget =
      spec.trigger === 'object'
        ? spec.triggerTarget
        : ['with-previous', 'after-previous'].includes(spec.trigger)
          ? previous.eventTarget
          : undefined;
    const cue = { spec, start, end: start + animationDuration(spec), eventTarget };
    clocks.set(spec.step, cue);
    return cue;
  });
}
export function animationDuration(spec: AnimationSpec) {
  return spec.duration * (spec.repeat ?? 1) * (spec.autoReverse ? 2 : 1);
}
export function frames(spec: AnimationSpec): Keyframe[] {
  switch (spec.effect) {
    case 'chart-state':
      return [{opacity:1},{opacity:1}];
    case 'draw-stroke':
      return [{strokeDashoffset:1},{strokeDashoffset:0}];
    case 'appear':
      return [{ opacity: 0, offset: 0 }, { opacity: 1, offset: 0.001 }, { opacity: 1 }];
    case 'disappear':
      return [{ opacity: 1, offset: 0 }, { opacity: 0, offset: 0.001 }, { opacity: 0 }];
    case 'zoom-out':
      return [{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.1)'}];
    case 'wipe-in': case 'wipe-out': {
      const hidden = {left:'inset(0 100% 0 0)',right:'inset(0 0 0 100%)',up:'inset(0 0 100% 0)',down:'inset(100% 0 0 0)'}[spec.effectDirection ?? 'left'];
      const pair=[{clipPath:hidden},{clipPath:'inset(0 0 0 0)'}];
      return spec.effect==='wipe-in'?pair:pair.reverse();
    }
    case 'split-in': case 'split-out': {
      const vertical = ['up','down'].includes(spec.effectDirection ?? 'left');
      const pair=[{clipPath:vertical?'inset(50% 0 50% 0)':'inset(0 50% 0 50%)'},{clipPath:'inset(0 0 0 0)'}];
      return spec.effect==='split-in'?pair:pair.reverse();
    }
    case 'float-in':
      return [{opacity:0,transform:`translate(${spec.dx}px,${spec.dy}px)`},{opacity:1,transform:'translate(0,0)'}];
    case 'bounce-in':
      return [{opacity:0,transform:'scale(.3)'},{opacity:1,transform:'scale(1.08)',offset:.65},{transform:'scale(.96)',offset:.82},{transform:'scale(1)'}];
    case 'fade-in':
      return [{ opacity: 0 }, { opacity: 1 }];
    case 'fade-out':
      return [{ opacity: 1 }, { opacity: 0 }];
    case 'fly-in':
      return [
        { opacity: 0, transform: `translate(${spec.dx}px,${spec.dy}px)` },
        { opacity: 1, transform: 'translate(0,0)' },
      ];
    case 'fly-out':
      return [
        { opacity: 1, transform: 'translate(0,0)' },
        { opacity: 0, transform: `translate(${spec.dx}px,${spec.dy}px)` },
      ];
    case 'zoom-in':
      return [
        { opacity: 0, transform: 'scale(.1)' },
        { opacity: 1, transform: 'scale(1)' },
      ];
    case 'pulse':
      return [
        { transform: 'scale(1)' },
        { transform: 'scale(1.15)', offset: 0.5 },
        { transform: 'scale(1)' },
      ];
    case 'spin':
      return [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }];
    case 'motion':
      if (spec.path?.length) return spec.path.map((p,i)=>({transform:`translate(${p.x}px,${p.y}px)`,offset:i/(spec.path!.length-1)}));
      return [
        { transform: 'translate(0,0)' },
        { transform: `translate(${spec.dx}px,${spec.dy}px)` },
      ];
    case 'custom':
      return spec.keyframes as Keyframe[];
  }
}
export function isEntrance(spec: AnimationSpec) {
  return ['draw-stroke', 'appear', 'fade-in', 'fly-in', 'zoom-in', 'wipe-in', 'split-in', 'float-in', 'bounce-in'].includes(spec.effect);
}
export function maxStep(
  slide: Pick<Slide, 'animations' | 'nativeStepCount' | 'components'> & {
    stepMap?: number[];
    steps?: { id: string }[];
  },
) {
  return Math.max(
    slide.stepMap?.length ? slide.stepMap.length - 1 : slide.nativeStepCount,
    (slide.steps?.length ?? 1) - 1,
    ...slide.animations.map((a) => a.step),
    ...(slide.components ?? []).flatMap((component) => component.steps.map((step) => step.step)),
    0,
  );
}

export function stepLabel(slide: Pick<Slide, 'steps'>, step: number) {
  return slide.steps?.[step]?.name ?? (step === 0 ? '开始' : `步骤 ${step}`);
}
export function stepNotes(slide: Pick<Slide, 'steps' | 'notes'>, step: number) {
  return [slide.notes, slide.steps?.[step]?.notes].filter(Boolean).join('\n\n');
}
export function stepInterval(slide: Pick<Slide, 'steps' | 'advanceAfter'>, step: number) {
  return slide.steps?.[step]?.advanceAfter ?? slide.advanceAfter;
}
