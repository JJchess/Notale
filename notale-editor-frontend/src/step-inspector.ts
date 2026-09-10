import type { Slide, Command } from '@notale/editor/browser';
export function createStepInspector(context: {
  slide: () => Slide;
  step: () => number;
  nativeMax: () => number;
  ready: () => boolean;
  whenReady: () => Promise<void>;
  preview: (step: number, play?: boolean) => void;
  commands: (commands: Command[]) => Promise<unknown>;
  error: (error: unknown) => void;
}) {
  const panel = document.createElement('fieldset');
  panel.id = 'teaching-steps';
  panel.innerHTML = `<legend>讲授步骤</legend><button id="teaching-initialize">建立可编辑步骤列表</button><div id="teaching-step-controls" hidden>
  <div id="teaching-order" class="teaching-order" aria-label="讲授顺序"></div><label class="sr-only">步骤<select id="teaching-step"></select></label><label>步骤名称<input id="teaching-name" /></label><label>本步骤讲稿<textarea id="teaching-notes" rows="4"></textarea></label>
  <label>自动前进（毫秒）<input id="teaching-advance" type="number" min="0" max="3600000" placeholder="留空继承页面，0 表示手动" /></label>
  <button id="teaching-save">保存步骤信息</button><button id="teaching-preview">预览当前步骤</button>
  <button id="teaching-insert">在后面插入空步骤</button><button id="teaching-duplicate">复制当前步骤及动画</button><button id="teaching-remove">删除当前步骤</button><button id="teaching-up">提前一步</button><button id="teaching-down">推后一步</button><p id="teaching-summary"></p></div>`;
  const details=document.createElement('details');details.className='animation-step-details';details.innerHTML='<summary>讲授步骤与讲稿</summary>';details.append(document.querySelector('[data-panel="animation"] .stepbar')!,panel);
  document.querySelector('[data-panel="animation"]')!.append(details);
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
  function choose(id: string, preview = true) {
    input('teaching-step').value = id;
    fill();
    renderOrder();
    if ((document.getElementById('save-animation') as HTMLButtonElement).disabled) (document.getElementById('animation-step') as HTMLInputElement).value = String(index());
    if (preview) context.preview(index());
  }
  function renderOrder() {
    const slide = context.slide();
    const list = el('teaching-order');
    list.replaceChildren(...(slide.steps ?? []).map((step, at) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'teaching-card';
      button.dataset.stepId = step.id;
      button.draggable = at > 0;
      button.setAttribute('aria-pressed', String(step.id === input('teaching-step').value));
      const order = document.createElement('span'); order.className = 'teaching-number'; order.textContent = String(at);
      const content = document.createElement('span');
      const title = document.createElement('strong'); title.textContent = step.name;
      const detail = document.createElement('small');
      const animations = slide.animations.filter(cue => cue.step === at).length;
      const states = (slide.components ?? []).filter(c => c.steps.some(s => s.step === at)).length;
      detail.textContent = at === 0 ? '初始画面' : `${animations} 个动画 · ${states} 个互动状态${step.advanceAfter ? ` · ${(step.advanceAfter / 1000).toFixed(1)} 秒后前进` : ''}`;
      content.append(title, detail); button.append(order, content);
      button.addEventListener('click', () => choose(step.id));
      return button;
    }));
  }
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
    renderOrder();
  }
  el('teaching-step').onchange = () => {
    choose(input('teaching-step').value);
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
  async function createStep(duplicate: boolean) {
    const newId = crypto.randomUUID();
    if (duplicate && !selected()) return;
    await context.commands([duplicate ? {
      type: 'step.duplicate', slideId: context.slide().id, id: selected()!.id, newId,
    } : {
      type: 'step.insert', slideId: context.slide().id, index: index() + 1,
      step: { id: newId, name: '新步骤', notes: '', advanceAfter: null },
    }]);
    await context.whenReady();
    choose(newId);
  }
  on('teaching-insert', () => createStep(false));
  on('teaching-duplicate', () => createStep(true));
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
  let dragged: { id: string; slideId: string } | undefined;
  const order = el('teaching-order');
  const card = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>('[data-step-id]') : null;
  const clearDrop = () => order.querySelectorAll('.step-drop-before,.step-drop-after').forEach(node => node.classList.remove('step-drop-before','step-drop-after'));
  order.addEventListener('dragstart', event => {
    const target = card(event.target);
    if (!target?.draggable || panel.disabled) { event.preventDefault(); return; }
    dragged = { id: target.dataset.stepId!, slideId: context.slide().id };
    event.dataTransfer!.setData('application/x-notale-step', dragged.id);
    event.dataTransfer!.effectAllowed = 'move';
  });
  order.addEventListener('dragover', event => {
    const target = card(event.target);
    if (!dragged || !target || dragged.slideId !== context.slide().id || panel.disabled) return;
    event.preventDefault(); clearDrop();
    target.classList.add(event.clientY < target.getBoundingClientRect().top + target.offsetHeight / 2 ? 'step-drop-before' : 'step-drop-after');
  });
  order.addEventListener('drop', event => {
    const target = card(event.target), source = dragged;
    const after = target?.classList.contains('step-drop-after');
    dragged = undefined; clearDrop();
    if (!target || !source || panel.disabled || source.slideId !== context.slide().id) return;
    event.preventDefault();
    if (target.dataset.stepId === source.id) return;
    const remaining = context.slide().steps!.filter(step => step.id !== source.id);
    const at = remaining.findIndex(step => step.id === target.dataset.stepId);
    if (at < 0) return;
    panel.disabled = true;
    void context.commands([{type:'step.move', slideId: source.slideId, id:source.id, index:Math.max(1, at + (after ? 1 : 0))}])
      .then(() => context.whenReady()).then(() => choose(source.id)).catch(context.error)
      .finally(() => { panel.disabled = false; render(); });
  });
  order.addEventListener('dragend', () => { dragged = undefined; clearDrop(); });
  return { render };
}
