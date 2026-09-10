import { componentSchema, type InteractiveComponent } from '@notale/editor/browser';
import { containerLayoutSchema } from '@notale/editor/browser';
import type { DeckDocument, Slide, Command } from '@notale/editor/browser';
type ObjectInfo = { id: string; parent?: string; tag: string; text: string };
export function createComponentInspector(context: {
  slide: () => Slide;
  document: () => DeckDocument;
  capture: (
    ids: string[],
  ) => Promise<{ rectangles: unknown[]; computedStyles: Record<string, Record<string, string>> }>;
  objects: () => ObjectInfo[];
  selected: () => string[];
  choose: (id: string) => void;
  openPage: (id: string) => Promise<unknown>;
  commands: (commands: Command[]) => Promise<unknown>;
  preview: (id: string, state: string) => void;
  error: (error: unknown) => void;
}) {
  const panel = document.createElement('fieldset');
  panel.id = 'author-components';
  panel.innerHTML = `<legend>组件与状态</legend><p id="author-source-status" class="hint" hidden></p><button id="author-source-return" hidden>返回原实例</button>
 <label>组件<select id="author-component"></select></label><button id="author-component-create">将选中容器设为组件</button>
 <label>共享组件<select id="author-library"></select></label><button id="author-library-insert">插入共享实例</button><button id="author-library-edit">编辑共享源</button>
 <div id="author-component-edit" hidden>
 <p id="author-instance-status"></p><button id="author-library-publish">发布或更新共享组件</button><button id="author-library-unlink">解除实例关联</button>
 <label><input id="author-override-text-enabled" type="checkbox" />覆盖实例文字</label><label>实例文字覆盖<input id="author-override-text" /></label><label>实例样式覆盖 JSON<textarea id="author-override-style" rows="2">{}</textarea></label><button id="author-override-save">保存当前对象的实例覆盖</button><button id="author-override-reset">重置当前对象覆盖</button>
 <label>组件名称<input id="author-component-name" /></label>
 <label>状态<select id="author-state"></select></label><label>状态名称<input id="author-state-name" /></label>
 <button id="author-state-add">复制为新状态</button><button id="author-state-remove">删除状态</button>
 <button id="author-state-preview">预览状态</button><button id="author-state-initial">设为初始状态</button>
 <label>编辑对象<select id="author-target"></select></label><button id="author-target-select">选择内部对象</button>
 <label><input id="author-text-enabled" type="checkbox" />替换此状态的文字</label><input id="author-text" /><p id="author-text-hint" class="hint" hidden>此对象包含内部元素或原生控件，请选择内部的纯文字对象修改内容。</p>
 <label>可见性<select id="author-visible"><option value="">沿用源稿</option><option value="true">显示</option><option value="false">隐藏</option></select></label>
 <label data-component-pending>状态样式 JSON<textarea id="author-style" rows="3">{}</textarea></label>
 <div class="component-style-fields"><label>文字颜色<input id="author-color" placeholder="沿用源稿，如 #6638dc" /></label><label>背景颜色<input id="author-background-color" placeholder="沿用源稿，如 #fff4cc" /></label><label>透明度<input id="author-opacity" type="number" min="0" max="1" step="0.1" placeholder="沿用源稿" /></label></div>
 <label>原生图表选择<select id="author-native-value"><option value="">沿用初始值</option><option value="1.0">1.0</option><option value="0.1">0.1</option><option value="0.02">0.02</option></select></label>
 <button id="author-patch-save">保存对象状态</button><button id="author-state-override-reset" hidden>恢复此对象的共享状态</button>
 <label>过渡时长（毫秒）<input id="author-duration" type="number" min="0" max="10000" /></label><label>缓动<select id="author-easing"><option>ease</option><option>linear</option><option>ease-in</option><option>ease-out</option><option>ease-in-out</option></select></label><button id="author-behavior-save">保存名称与过渡</button>
 <label>触发事件<select id="author-event"><option value="click">点击</option><option value="pointerenter">移入</option><option value="pointerleave">移出</option></select></label>
 <label>从状态<select id="author-from"></select></label><button id="author-event-add">用此对象切换到当前状态</button>
 <label>已有事件<select id="author-events"></select></label><button id="author-event-remove">删除事件</button>
 <label>页内 step<input id="author-step" type="number" min="0" max="500" value="1" /></label><button id="author-step-save">此 step 切换到当前状态</button><button id="author-step-remove">移除此 step 映射</button><p id="author-step-list"></p>
 <label>组件布局<select id="author-layout"><option value="row">横向排列</option><option value="column">纵向排列</option><option value="grid">网格</option><option value="block">普通流</option></select></label><label>间距<input id="author-gap" type="number" min="0" value="20" /></label><label>网格列数<input id="author-columns" type="number" min="1" max="12" value="2" /></label><button id="author-layout-save">应用容器布局</button>
 <label>容器宽度<select id="author-width"><option value="fixed">固定</option><option value="hug">随内容</option><option value="fill">填满父容器</option></select></label>
 <label>容器高度<select id="author-height"><option value="hug">随内容</option><option value="fixed">固定</option><option value="fill">填满父容器</option></select></label>
 <label>固定宽度<input id="author-width-value" type="number" min="0" /></label><label>固定高度<input id="author-height-value" type="number" min="0" /></label>
 <label>内边距<input id="author-padding" type="number" min="0" value="0" /></label><label>交叉轴对齐<select id="author-align"><option>stretch</option><option>start</option><option>center</option><option>end</option></select></label><label>主轴分布<select id="author-justify"><option>start</option><option>center</option><option>end</option><option>space-between</option><option>space-around</option></select></label><label><input id="author-wrap" type="checkbox" />允许换行</label>
 <label>子对象宽度<select id="author-child-width"><option value="fixed">固定</option><option value="hug">随内容</option><option value="fill">填满</option></select></label><label>子对象高度<select id="author-child-height"><option value="hug">随内容</option><option value="fixed">固定</option><option value="fill">填满</option></select></label><label>子对象伸展权重<input id="author-grow" type="number" min="0" value="0" /></label><button id="author-child-layout-save">约束当前子对象</button>
 <button id="author-parent-select">选择上一级容器</button>
 <button id="author-component-detach">移除组件行为，保留内容</button>
 </div>`;
  document.querySelector('[data-panel="format"]')!.append(panel);
  const sections: Array<[string, string, string, boolean]> = [
    ['共享组件', 'author-library', 'author-library-edit', false],
    ['实例覆盖', 'author-override-text-enabled', 'author-override-reset', true],
    ['状态', 'author-component-name', 'author-state-initial', false],
    ['对象在此状态的表现', 'author-target', 'author-state-override-reset', false],
    ['切换效果', 'author-duration', 'author-behavior-save', false],
    ['触发方式', 'author-event', 'author-event-remove', false],
    ['步骤与容器布局', 'author-step', 'author-component-detach', true],
  ];
  for (const [title, first, last, pending] of sections) {
    const control = panel.querySelector<HTMLElement>('#' + first)!;
    const start = control.closest('label') ?? control;
    const endControl = panel.querySelector<HTMLElement>('#' + last)!;
    const end = endControl.closest('label') ?? endControl;
    const section = document.createElement('details');
    section.className = 'component-section';
    section.open = true;
    if (pending) section.dataset.componentPending = '';
    const summary = document.createElement('summary'); summary.textContent = title;
    section.append(summary); start.before(section);
    let node: ChildNode | null = start;
    while (node) { const next: ChildNode | null = node.nextSibling; section.append(node); if (node === end) break; node = next; }
  }
  const el = <T extends HTMLElement = HTMLElement>(id: string) => panel.querySelector<T>('#' + id)!;
  const value = (id: string) =>
    el<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(id).value;
  const set = (id: string, value: unknown) => {
    el<HTMLInputElement>(id).value = String(value ?? '');
  };
  const options = (id: string, items: Array<[string, string]>, selected?: string) => {
    el(id).replaceChildren(
      ...items.map(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        return option;
      }),
    );
    if (selected !== undefined) set(id, selected);
  };
  const styleFields = ['color', 'background-color', 'opacity'] as const;
  const changedStyles = new Set<(typeof styleFields)[number]>();
  for (const property of styleFields) el('author-' + property).oninput = () => changedStyles.add(property);
  const stateStyle = () => {
    const style: Record<string, string> = JSON.parse(value('author-style'));
    for (const property of changedStyles) {
      const next = value('author-' + property).trim();
      if (!next) delete style[property];
      else {
        if (!CSS.supports(property, next) || (property === 'opacity' && !(Number(next) >= 0 && Number(next) <= 1)))
          throw new Error(property === 'opacity' ? '透明度应在 0 到 1 之间' : '请输入有效的颜色，如 #6638dc');
        style[property] = next;
      }
    }
    return style;
  };
  const current = () =>
    context.slide().components?.find((component) => component.id === value('author-component'));
  const state = () => current()?.states.find((state) => state.id === value('author-state'));
  const save = (component: InteractiveComponent) =>
    context.commands([
      {
        type: 'component.set',
        slideId: context.slide().id,
        component: componentSchema.parse(component),
      },
    ]);
  const on = (id: string, fn: () => unknown) =>
    (el(id).onclick = () => {
      panel.disabled = true;
      panel.setAttribute('aria-busy', 'true');
      try {
        Promise.resolve(fn())
          .catch(context.error)
          .finally(() => {
            panel.disabled = false;
            panel.setAttribute('aria-busy', 'false');
          });
      } catch (error) {
        panel.disabled = false;
        panel.setAttribute('aria-busy', 'false');
        context.error(error);
      }
    });
  const inside = (target: string, root: string) => {
    const seen = new Set<string>();
    let id: string | undefined = target;
    while (id && !seen.has(id)) {
      if (id === root) return true;
      seen.add(id);
      id = context.objects().find((object) => object.id === id)?.parent;
    }
    return false;
  };
  const canReplaceText = (target: string) => {
    const objects = context.objects(), object = objects.find(item => item.id === target);
    return !!object && !objects.some(item => item.parent === target) &&
      !['script', 'style', 'canvas', 'iframe', 'input', 'textarea', 'select', 'img', 'video', 'audio'].includes(object.tag);
  };
  let sourceReturn: { documentId: string; pageId: string; root: string } | undefined;
  let key = '';
  function render() {
    if (sourceReturn?.documentId !== context.document().id) sourceReturn = undefined;
    el('author-source-return').hidden = !sourceReturn;
    el('author-source-status').hidden = !sourceReturn;
    el('author-source-status').textContent = '正在编辑共享源。修改后发布更新，再返回原实例检查。';
    const library = context.document().componentLibrary ?? [],
      previousLibrary = value('author-library');
    options(
      'author-library',
      library.map((item) => [item.id, item.name]),
      library.some((item) => item.id === previousLibrary) ? previousLibrary : library[0]?.id,
    );
    el<HTMLButtonElement>('author-library-insert').disabled = !library.length;
    el<HTMLButtonElement>('author-component-create').disabled = context.selected().length !== 1;
    const components = context.slide().components ?? [],
      selected = context.selected()[0],
      previous = value('author-component');
    const candidates = components.filter((component) => inside(selected, component.root));
    const component =
      candidates.find(
        (candidate) =>
          !candidates.some((other) => other !== candidate && inside(other.root, candidate.root)),
      ) ?? components.find((c) => c.id === previous);
    if (component?.instance) set('author-library', component.instance.definitionId);
    el<HTMLButtonElement>('author-library-edit').disabled = !library.length;
    el<HTMLButtonElement>('author-library-publish').disabled = !!component?.instance;
    const definition = library.find(item => item.source.components?.find(c => c.id === item.componentId)?.root === component?.root);
    const usages = definition ? context.document().slides.flatMap(page => page.components ?? []).filter(c => c.instance?.definitionId === definition.id).length : 0;
    el('author-library-publish').textContent = definition ? `发布更新 · 同步 ${usages} 个实例` : '发布为共享组件';
    for (const id of ['author-component-name', 'author-state-name', 'author-state-add', 'author-state-remove', 'author-duration', 'author-easing', 'author-behavior-save', 'author-event-add', 'author-event-remove'])
      (el(id) as HTMLInputElement | HTMLButtonElement).disabled = !!component?.instance;
    const stateId = value('author-state'),
      target = value('author-target');
    options(
      'author-component',
      components.map((c) => [c.id, c.name]),
      component?.id,
    );
    el('author-component-edit').hidden = !component;
    if (!component) {
      key = '';
      return;
    }
    const next =
      JSON.stringify(component) +
      '/' +
      context.slide().id +
      JSON.stringify(
        context.objects().map((object) => [object.id, object.parent, object.text.slice(0, 35)]),
      );
    if (key === next && el('author-target').childElementCount) return;
    key = next;
    el('author-instance-status').textContent = component.instance
      ? `共享实例 · ${library.find((item) => item.id === component.instance!.definitionId)?.name ?? ''}`
      : definition ? `共享源 · ${usages} 个关联实例` : '独立组件';
    el<HTMLButtonElement>('author-library-unlink').disabled = !component.instance;
    set('author-component-name', component.name);
    const layout = context.slide().constraints?.[component.root];
    if (layout) {
      for (const field of [
        'width',
        'height',
        'padding',
        'align',
        'justify',
        'gap',
        'columns',
      ] as const)
        set('author-' + field, layout[field]);
      set('author-layout', layout.mode);
      set('author-width-value', layout.widthValue ?? '');
      set('author-height-value', layout.heightValue ?? '');
      el<HTMLInputElement>('author-wrap').checked = layout.wrap;
    }
    set('author-duration', component.duration);
    set('author-easing', component.easing);
    options(
      'author-state',
      component.states.map((state) => [state.id, state.name]),
      component.states.some((state) => state.id === stateId) ? stateId : component.initial,
    );
    options(
      'author-target',
      context
        .objects()
        .filter((object) => inside(object.id, component.root))
        .map((object) => [object.id, `${object.tag} · ${object.text.slice(0, 35)}`]),
      inside(target, component.root) ? target : component.root,
    );
    options('author-from', [
      ['', '任意状态'],
      ...component.states.map((state) => [state.id, state.name] as [string, string]),
    ]);
    options(
      'author-events',
      component.events.map((event) => [
        event.id,
        `${event.event} → ${component.states.find((state) => state.id === event.to)?.name}`,
      ]),
    );
    el('author-step-list').textContent = component.steps
      .map(
        (step) =>
          `${step.step} → ${component.states.find((state) => state.id === step.state)?.name}`,
      )
      .join('；');
    fill();
  }
  function fill() {
    const selected = state(),
      patch = selected?.patches[value('author-target')];
    set('author-state-name', selected?.name ?? '');
    el<HTMLInputElement>('author-text-enabled').checked = patch?.text !== undefined;
    set('author-text', patch?.text ?? '');
    const textAllowed = canReplaceText(value('author-target'));
    el<HTMLInputElement>('author-text-enabled').disabled = !textAllowed;
    el<HTMLInputElement>('author-text').disabled = !textAllowed;
    el('author-text-hint').hidden = textAllowed;
    set('author-visible', patch?.visible === undefined ? '' : String(patch.visible));
    set('author-style', JSON.stringify(patch?.style ?? {}, null, 2));
    changedStyles.clear();
    for (const property of styleFields) set('author-' + property, patch?.style?.[property] ?? '');
    set('author-native-value', patch?.nativeChartValue ?? '');
    const component = current(),
      instance = component?.instance,
      source = Object.entries(instance?.objects ?? {}).find(
        ([, id]) => id === value('author-target'),
      )?.[0],
      override = source ? instance?.overrides[source] : undefined;
    el<HTMLInputElement>('author-override-text-enabled').checked = override?.text !== undefined;
    set('author-override-text', override?.text ?? '');
    set('author-override-style', JSON.stringify(override?.style ?? {}, null, 2));
    el('author-state-override-reset').hidden = !instance;
    el<HTMLButtonElement>('author-state-override-reset').disabled = !source || !instance?.stateOverrides[value('author-state')]?.[source];
    el('author-patch-save').textContent = instance ? '仅保存此实例的对象状态' : '保存对象状态';
    const child =
      component && context.slide().constraints?.[component.root]?.children[value('author-target')];
    set('author-child-width', child?.width ?? 'fixed');
    set('author-child-height', child?.height ?? 'hug');
    set('author-grow', child?.grow ?? 0);
  }
  el<HTMLSelectElement>('author-component').onchange = () => {
    const component = current();
    if (component) {
      key = '';
      context.choose(component.root);
      render();
    }
  };
  el<HTMLSelectElement>('author-state').onchange = fill;
  el<HTMLSelectElement>('author-target').onchange = fill;
  on('author-library-publish', async () => {
    const component = current();
    if (!component) return;
    const existing = context
      .document()
      .componentLibrary?.find(
        (item) =>
          item.source.components?.find((c) => c.id === item.componentId)?.root === component.root,
      );
    const sourceDocument = context.document(), slideId = context.slide().id,
      name = value('author-component-name');
    const capture = await context.capture([component.root]);
    if (context.document() !== sourceDocument || context.slide().id !== slideId)
      throw new Error('页面或内容已变化，请重新发布当前组件');
    await context.commands([
      {
        type: 'component.publish',
        slideId,
        id: component.id,
        definitionId: existing?.id ?? crypto.randomUUID(),
        name,
        rectangles: capture.rectangles,
        computedStyles: capture.computedStyles,
      } as Command,
    ]);
    render();
  });
  on('author-library-edit', async () => {
    const definition = context
      .document()
      .componentLibrary?.find((item) => item.id === value('author-library'));
    if (!definition) return;
    const component = definition.source.components!.find(
      (item) => item.id === definition.componentId,
    )!;
    const existing = context
      .document()
      .slides.find((page) =>
        page.components?.some((item) => !item.instance && item.root === component.root),
      );
    const origin = { documentId: context.document().id, pageId: context.slide().id, root: current()?.root ?? '' };
    const pageId = existing?.id ?? crypto.randomUUID();
    if (!existing)
      await context.commands([
        { type: 'component.checkout', definitionId: definition.id, newId: pageId },
      ]);
    if (origin.pageId !== pageId) sourceReturn = origin;
    await context.openPage(pageId);
    context.choose(component.root);
    render();
  });
  on('author-source-return', async () => {
    const origin = sourceReturn;
    if (!origin || origin.documentId !== context.document().id) return;
    if (!context.document().slides.some(page => page.id === origin.pageId)) throw new Error('原页面已删除，请在页面列表中选择其他实例');
    await context.openPage(origin.pageId);
    if (context.objects().some(object => object.id === origin.root)) context.choose(origin.root);
    sourceReturn = undefined;
    render();
  });
  on('author-state-override-reset', () => {
    const component = current();
    if (!component?.instance) return;
    return context.commands([{ type: 'component.override', slideId: context.slide().id, id: component.id, target: value('author-target'), state: value('author-state'), patch: null }]);
  });
  on('author-library-insert', () =>
    context.commands([
      {
        type: 'component.instantiate',
        slideId: context.slide().id,
        definitionId: value('author-library'),
        offset: { x: 30, y: 30 },
      },
    ]),
  );
  on(
    'author-library-unlink',
    () =>
      current() &&
      context.commands([
        { type: 'component.unlink', slideId: context.slide().id, id: current()!.id },
      ]),
  );
  on(
    'author-override-save',
    () =>
      current() &&
      context.commands([
        {
          type: 'component.override',
          slideId: context.slide().id,
          id: current()!.id,
          target: value('author-target'),
          patch: {
            ...(el<HTMLInputElement>('author-override-text-enabled').checked
              ? { text: value('author-override-text') }
              : {}),
            style: JSON.parse(value('author-override-style')),
          },
        },
      ]),
  );
  on(
    'author-override-reset',
    () =>
      current() &&
      context.commands([
        {
          type: 'component.override',
          slideId: context.slide().id,
          id: current()!.id,
          target: value('author-target'),
          patch: null,
        },
      ]),
  );
  on('author-parent-select', () => {
    const parent = context.objects().find((item) => item.id === context.selected()[0])?.parent;
    if (parent) context.choose(parent);
  });
  on('author-component-create', () => {
    const root = context.selected()[0];
    if (!root) throw new Error('请先选择组件容器');
    return save(
      componentSchema.parse({
        id: crypto.randomUUID(),
        root,
        name: '互动组件',
        initial: 'base',
        states: [{ id: 'base', name: '初始', patches: {} }],
      }),
    );
  });
  on('author-target-select', () => context.choose(value('author-target')));
  on('author-state-preview', () => {
    const component = current(),
      selected = state();
    if (component && selected) context.preview(component.id, selected.id);
  });
  on('author-state-initial', () => {
    const component = current(),
      selected = state();
    if (component && selected)
      return context.commands([
        {
          type: 'component.state',
          slideId: context.slide().id,
          id: component.id,
          state: selected.id,
        },
      ]);
  });
  on('author-state-add', async () => {
    const component = structuredClone(current()),
      selected = state();
    if (!component || !selected) return;
    const id = crypto.randomUUID();
    component.states.push({
      ...structuredClone(selected),
      id,
      name: value('author-state-name') + ' 副本',
    });
    await save(component);
    set('author-state', id);
    fill();
  });
  on('author-state-remove', () => {
    const component = structuredClone(current()),
      id = value('author-state');
    if (!component) return;
    if (component.states.length === 1) throw new Error('至少保留一个状态');
    component.states = component.states.filter((state) => state.id !== id);
    component.events = component.events.filter((event) => event.from !== id && event.to !== id);
    component.steps = component.steps.filter((step) => step.state !== id);
    if (component.initial === id) component.initial = component.states[0].id;
    return save(component);
  });
  on('author-patch-save', () => {
    const component = structuredClone(current());
    if (!component) return;
    const selected = component.states.find((state) => state.id === value('author-state'))!;
    selected.name = value('author-state-name');
    if (el<HTMLInputElement>('author-text-enabled').checked && !canReplaceText(value('author-target')))
      throw new Error('请选择内部的纯文字对象，容器和原生控件不能整体替换文字');
    selected.patches[value('author-target')] = {
      style: stateStyle(),
      ...(el<HTMLInputElement>('author-text-enabled').checked
        ? { text: value('author-text') }
        : {}),
      ...(value('author-visible') ? { visible: value('author-visible') === 'true' } : {}),
      ...(value('author-native-value')
        ? { nativeChartValue: value('author-native-value') as '1.0' | '0.1' | '0.02' }
        : {}),
    };
    if (component.instance)
      return context.commands([
        {
          type: 'component.override',
          slideId: context.slide().id,
          id: component.id,
          target: value('author-target'),
          state: selected.id,
          patch: selected.patches[value('author-target')],
        },
      ]);
    return save(component);
  });
  on('author-behavior-save', () => {
    const component = structuredClone(current());
    if (!component) return;
    component.name = value('author-component-name');
    component.states.find((state) => state.id === value('author-state'))!.name =
      value('author-state-name');
    component.duration = Number(value('author-duration'));
    component.easing = value('author-easing') as InteractiveComponent['easing'];
    return save(component);
  });
  on('author-event-add', () => {
    const component = structuredClone(current());
    if (!component) return;
    const target = value('author-target'),
      event = value('author-event') as 'click' | 'pointerenter' | 'pointerleave',
      from = value('author-from');
    component.events = component.events.filter(
      (item) =>
        !(item.target === target && item.event === event && item.from === (from || undefined)),
    );
    component.events.push({
      id: crypto.randomUUID(),
      target,
      event,
      ...(from ? { from } : {}),
      to: value('author-state'),
    });
    return save(component);
  });
  on('author-event-remove', () => {
    const component = structuredClone(current());
    if (component) {
      component.events = component.events.filter((event) => event.id !== value('author-events'));
      return save(component);
    }
  });
  on('author-step-save', () => {
    const component = structuredClone(current());
    if (component) {
      const step = Number(value('author-step'));
      component.steps = component.steps.filter((item) => item.step !== step);
      component.steps.push({ step, state: value('author-state') });
      if (step === 0) component.initial = value('author-state');
      return save(component);
    }
  });
  on('author-step-remove', () => {
    const component = structuredClone(current());
    if (component) {
      component.steps = component.steps.filter(
        (item) => item.step !== Number(value('author-step')),
      );
      return save(component);
    }
  });
  const layoutSpec = () =>
    containerLayoutSchema.parse({
      ...(context.slide().constraints?.[current()!.root] ?? {}),
      mode: value('author-layout'),
      gap: Number(value('author-gap')),
      columns: Number(value('author-columns')),
      width: value('author-width'),
      height: value('author-height'),
      padding: Number(value('author-padding')),
      align: value('author-align'),
      justify: value('author-justify'),
      wrap: el<HTMLInputElement>('author-wrap').checked,
      ...(value('author-width-value') ? { widthValue: Number(value('author-width-value')) } : {}),
      ...(value('author-height-value')
        ? { heightValue: Number(value('author-height-value')) }
        : {}),
    });
  on(
    'author-layout-save',
    () =>
      current() &&
      context.commands([
        {
          type: 'container.layout',
          slideId: context.slide().id,
          target: current()!.root,
          layout: layoutSpec(),
        },
      ]),
  );
  on('author-child-layout-save', () => {
    if (!current()) return;
    const layout = layoutSpec();
    layout.children[value('author-target')] = {
      width: value('author-child-width') as 'fixed',
      height: value('author-child-height') as 'hug',
      grow: Number(value('author-grow')),
      shrink: 1,
      align: 'auto',
    };
    return context.commands([
      { type: 'container.layout', slideId: context.slide().id, target: current()!.root, layout },
    ]);
  });
  on('author-component-detach', () => {
    const component = current();
    if (component)
      return context.commands([
        { type: 'component.remove', slideId: context.slide().id, id: component.id },
      ]);
  });
  return { render };
}
