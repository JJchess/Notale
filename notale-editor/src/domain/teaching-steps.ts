import type { Command, Slide } from './model.js';
import { invariant } from './model.js';
import { maxStep } from './timeline.js';
import { type TeachingStep } from './teaching-step-schema.js';
import { mediaSettingsSchema } from './media.js';
import { parse, serialize, elements, attr, NODE_ID, findElement, setAttr, uid } from './html.js';

export function ensureStepPlan(slide: Slide, nativeMax?: number) {
  if (nativeMax !== undefined) slide.nativeStepCount = Math.max(slide.nativeStepCount, nativeMax);
  const mediaMax = Math.max(
    0,
    ...elements(parse(slide.html)).flatMap((node) => {
      const raw = attr(node, 'data-notale-media');
      if (!raw) return [];
      const settings = mediaSettingsSchema.parse(JSON.parse(raw));
      return [settings.startStep ?? 0, ...(settings.startSteps ?? [])];
    }),
  );
  const max = Math.max(maxStep(slide), mediaMax);
  slide.steps ??= [];
  while (slide.steps.length <= max) {
    const index = slide.steps.length;
    slide.steps.push({
      id: uid(),
      name: index === 0 ? '开始' : `步骤 ${index}`,
      notes: '',
      advanceAfter: null,
    });
  }
}
function unlocked(slide: Slide, target: string) {
  const root = parse(slide.html),
    node = findElement(root, target);
  invariant(
    !elements(node).some((item) => slide.locked.includes(attr(item, NODE_ID) ?? '')),
    'LOCKED',
    'Step changes affect a locked object',
  );
  for (
    let item: typeof node | undefined = node;
    item;
    item = item.parentNode && 'tagName' in item.parentNode ? item.parentNode : undefined
  )
    invariant(
      !slide.locked.includes(attr(item, NODE_ID) ?? ''),
      'LOCKED',
      'Step changes affect a locked container',
    );
}
type Slot = { source: number; cues: boolean };
function remap(slide: Slide, order: Slot[], steps: TeachingStep[]) {
  const mapping = (old: number) =>
    order.flatMap((item, index) => (item.cues && item.source === old ? [index] : []));
  const native = slide.stepMap.length
    ? [...slide.stepMap]
    : Array.from({ length: slide.steps!.length }, (_, index) =>
        Math.min(index, slide.nativeStepCount),
      );
  const animations = slide.animations.flatMap((animation) => {
    const positions = mapping(animation.step);
    if (positions.length !== 1 || positions[0] !== animation.step) {
      unlocked(slide, animation.target);
      if (animation.triggerTarget) unlocked(slide, animation.triggerTarget);
    }
    return positions.map((step, index) => ({
      ...structuredClone(animation),
      id: index === 0 ? animation.id : uid(),
      step,
    }));
  });
  for (const component of slide.components ?? []) {
    const stateAt = (index: number) =>
      [...component.steps].filter((step) => step.step <= index).sort((a, b) => b.step - a.step)[0]
        ?.state ?? component.initial;
    const mapped = order.map((item, step) => ({ step, state: stateAt(item.source) }));
    if (JSON.stringify(mapped) !== JSON.stringify(component.steps)) unlocked(slide, component.root);
    component.steps = mapped;
    if (component.instance) {
      component.instance.steps = structuredClone(mapped);
      component.instance.initial = component.initial;
    }
  }
  const tree = parse(slide.html);
  let mediaChanged = false;
  for (const node of elements(tree)) {
    const raw = attr(node, 'data-notale-media');
    if (!raw) continue;
    const settings = mediaSettingsSchema.parse(JSON.parse(raw));
    const previous = [
      ...new Set(
        [settings.startStep, ...(settings.startSteps ?? [])].filter(
          (step): step is number => step !== null,
        ),
      ),
    ];
    const mapped = [...new Set(previous.flatMap(mapping))].sort((a, b) => a - b);
    if (JSON.stringify(mapped) === JSON.stringify(previous)) continue;
    unlocked(slide, attr(node, NODE_ID)!);
    settings.startStep = mapped[0] ?? null;
    if (mapped.length > 1 || settings.startSteps !== undefined)
      settings.startSteps = mapped.slice(1);
    setAttr(node, 'data-notale-media', JSON.stringify(settings));
    mediaChanged = true;
  }
  if (mediaChanged) slide.html = serialize(tree);
  slide.animations = animations;
  slide.stepMap = order.map((item) => native[Math.min(item.source, native.length - 1)] ?? 0);
  slide.steps = steps;
}
export function applyStepCommand(slide: Slide, command: Command) {
  if (command.type === 'step.initialize') {
    ensureStepPlan(slide, command.nativeMax);
    return;
  }
  if (!('id' in command) && command.type !== 'step.insert') return;
  ensureStepPlan(slide);
  const steps = slide.steps!,
    index = 'id' in command ? steps.findIndex((step) => step.id === command.id) : -1;
  if (command.type !== 'step.insert')
    invariant(index >= 0, 'STEP_NOT_FOUND', 'Teaching step does not exist');
  if (command.type === 'step.update') {
    Object.assign(steps[index], command.patch);
    return;
  }
  const order: Slot[] = steps.map((_, source) => ({ source, cues: true }));
  const next = structuredClone(steps);
  if (command.type === 'step.insert') {
    invariant(
      command.index <= steps.length && steps.length < 501,
      'INVALID_STEP',
      'Step insertion is outside the sequence',
    );
    invariant(
      !steps.some((step) => step.id === command.step.id),
      'DUPLICATE_STEP',
      'Teaching step ID already exists',
    );
    order.splice(command.index, 0, { source: command.index - 1, cues: false });
    next.splice(command.index, 0, command.step);
  } else if (command.type === 'step.duplicate') {
    invariant(
      steps.length < 501 && !steps.some((step) => step.id === command.newId),
      'DUPLICATE_STEP',
      'Step limit or duplicate ID',
    );
    order.splice(index + 1, 0, { source: index, cues: true });
    next.splice(index + 1, 0, {
      ...steps[index],
      id: command.newId,
      name: (steps[index].name + ' 副本').slice(0, 200),
    });
  } else if (command.type === 'step.remove') {
    invariant(index > 0, 'INITIAL_STEP', 'The initial step must remain');
    order.splice(index, 1);
    next.splice(index, 1);
  } else if (command.type === 'step.move') {
    invariant(
      index > 0 && command.index < steps.length,
      'INITIAL_STEP',
      'Move steps within the sequence after its initial state',
    );
    order.splice(command.index, 0, order.splice(index, 1)[0]);
    next.splice(command.index, 0, next.splice(index, 1)[0]);
  } else return;
  remap(slide, order, next);
}
