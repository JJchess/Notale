import type { Slide, Command } from '../domain/model.js';
export function createStepInspector(context: {
  slide: () => Slide;
  step: () => number;
  nativeMax: () => number;
  ready: () => boolean;
  preview: (step: number, play?: boolean) => void;
  commands: (commands: Command[]) => Promise<unknown>;
  error: (error: unknown) => void;
}) {
  const panel = document.createElement('fieldset');
  panel.id = 'teaching-steps';
  panel.innerHTML = `<legend>讲授步骤</legend><button id="teaching-initialize">建立可编辑步骤列表</button><div id="teaching-step-controls" hidden>
  <label>步骤<select id="teaching-step"></select></label><label>步骤名称<input id="teaching-name" /></label><label>本步骤讲稿<textarea id="teaching-notes" rows="4"></textarea></label>
  <label>自动前进（毫秒）<input id="teaching-advance" type="number" min="0" max="3600000" placeholder="留空继承页面，0 表示手动" /></label>
  <button id="teaching-save">保存步骤信息</button><button id="teaching-preview">预览当前步骤</button>
  <button id="teaching-insert">在后面插入空步骤</button><button id="teaching-duplicate">复制当前步骤及动画</button><button id="teaching-remove">删除当前步骤</button><button id="teaching-up">提前一步</button><button id="teaching-down">推后一步</button><p id="teaching-summary"></p></div>`;
  document.querySelector('[data-panel="animation"]')!.prepend(panel);
  const el = <T extends HTMLElement = HTMLElement>(id: string) => panel.querySelector<T>('#' + id)!;
  const input = (id: string) => el<HTMLInputElement>(id);
  const selected = () =>
    context.slide().steps?.find((step) => step.id === input('teaching-step').value);
  const index = () =>
    context.slide().steps?.findIndex((step) => step.id === input('teaching-step').value) ?? -1;
  const on = (id: string, action: () => unknown) =>
    (el(id).onclick = () => {
      panel.disabled = true;
      panel.setAttribute('aria-busy', 'true');
      Promise.resolve()
        .then(action)
        .catch(context.error)
        .finally(() => {
          panel.disabled = false;
          panel.setAttribute('aria-busy', 'false');
          render();
        });
    });
  function fill() {
    const step = selected(),
      at = index();
    if (!step) return;
    input('teaching-name').value = step.name;
    input('teaching-notes').value = step.notes;
    input('teaching-advance').value = step.advanceAfter === null ? '' : String(step.advanceAfter);
    for (const id of ['teaching-remove', 'teaching-up'])
      el<HTMLButtonElement>(id).disabled = at <= 0;
    el<HTMLButtonElement>('teaching-down').disabled =
      at <= 0 || at === context.slide().steps!.length - 1;
    const slide = context.slide(),
      native = slide.stepMap.length
        ? slide.stepMap[Math.min(at, slide.stepMap.length - 1)]
        : Math.min(at, slide.nativeStepCount);
    el('teaching-summary').textContent =
      `原生状态 ${native} · ${slide.animations.filter((cue) => cue.step === at).length} 个动画 · ${(slide.components ?? []).filter((component) => component.steps.some((step) => step.step === at)).length} 个组件状态`;
  }
  let key = '';
  function render() {
    const slide = context.slide(),
      steps = slide.steps;
    el('teaching-initialize').hidden = !!steps;
    el<HTMLButtonElement>('teaching-initialize').disabled = !context.ready();
    el('teaching-step-controls').hidden = !steps;
    const next =
      slide.id +
      JSON.stringify(steps) +
      JSON.stringify(slide.stepMap) +
      JSON.stringify(slide.animations) +
      JSON.stringify(slide.components);
    if (next === key) return;
    key = next;
    const current = input('teaching-step').value;
    el('teaching-step').replaceChildren(
      ...(steps ?? []).map((step, index) => new Option(`${index} · ${step.name}`, step.id)),
    );
    input('teaching-step').value = steps?.some((step) => step.id === current)
      ? current
      : (steps?.[Math.min(context.step(), steps.length - 1)]?.id ?? '');
    fill();
  }
  el('teaching-step').onchange = () => {
    fill();
    context.preview(index());
  };
  on('teaching-initialize', () =>
    context.commands([
      { type: 'step.initialize', slideId: context.slide().id, nativeMax: context.nativeMax() },
    ]),
  );
  on(
    'teaching-save',
    () =>
      selected() &&
      context.commands([
        {
          type: 'step.update',
          slideId: context.slide().id,
          id: selected()!.id,
          patch: {
            name: input('teaching-name').value,
            notes: input('teaching-notes').value,
            advanceAfter:
              input('teaching-advance').value === ''
                ? null
                : Number(input('teaching-advance').value),
          },
        },
      ]),
  );
  on('teaching-preview', () => context.preview(index(), true));
  on('teaching-insert', () =>
    context.commands([
      {
        type: 'step.insert',
        slideId: context.slide().id,
        index: index() + 1,
        step: { id: crypto.randomUUID(), name: '新步骤', notes: '', advanceAfter: null },
      },
    ]),
  );
  on(
    'teaching-duplicate',
    () =>
      selected() &&
      context.commands([
        {
          type: 'step.duplicate',
          slideId: context.slide().id,
          id: selected()!.id,
          newId: crypto.randomUUID(),
        },
      ]),
  );
  on(
    'teaching-remove',
    () =>
      selected() &&
      context.commands([{ type: 'step.remove', slideId: context.slide().id, id: selected()!.id }]),
  );
  for (const [id, delta] of [
    ['teaching-up', -1],
    ['teaching-down', 1],
  ] as const)
    on(
      id,
      () =>
        selected() &&
        context.commands([
          {
            type: 'step.move',
            slideId: context.slide().id,
            id: selected()!.id,
            index: index() + delta,
          },
        ]),
    );
  return { render };
}
