import { componentSchema, type InteractiveComponent } from '@notale/editor/browser';
import { containerLayoutSchema } from '@notale/editor/browser';
import type { DeckDocument, Slide, Command } from '@notale/editor/browser';
export type ObjectInfo = { id: string; parent?: string; tag: string; text: string };

import {componentDefaults} from '../component-form';
interface Control {value?:string;checked?:boolean;disabled?:boolean;hidden?:boolean;text?:string;options?:Array<[string,string]>;}
interface Model {scope:string;controls:Record<string,Control>;busy:boolean;error:string;change?:(id:string,value:string|boolean)=>void;run?:(id:string)=>Promise<void>;reset?:()=>void;}
const initial:Model={scope:'',controls:componentDefaults as Record<string,Control>,busy:false,error:''};let model=initial,owner:symbol|undefined;
const listeners=new Set<()=>void>();
export const componentInspectorState={getSnapshot:()=>model,getServerSnapshot:()=>initial,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};}};
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
  const token=Symbol();owner=token;let controls:Record<string,Control>=structuredClone(initial.controls),scope='',busy=false,error='',generation=0,formIdentity='',draftBase='';
  const dirty=new Set<string>(),handlers=new Map<string,()=>unknown>(),changeHandlers=new Map<string,()=>void>();
  const active=()=>owner===token;
  const pageScope=()=>JSON.stringify([context.document().id,context.slide().id]);
  const control=(id:string)=>controls[id]??(controls[id]={});
  const value=(id:string)=>control(id).value??'';
  const number=(id:string)=>{const input=value(id);if(!input.trim()||!Number.isFinite(Number(input)))throw Error('请输入有效数字');return Number(input);};
  const set=(id:string,value:unknown)=>{if(!dirty.has(id))control(id).value=String(value??'');};
  const setChecked=(id:string,value:boolean)=>{if(!dirty.has(id))control(id).checked=value;};
  const options=(id:string,items:Array<[string,string]>,selected?:string)=>{control(id).options=items;control(id).value=selected!==undefined&&items.some(([key])=>key===selected)?selected:items.some(([key])=>key===value(id))?value(id):items[0]?.[0]??'';};
  const stateFields=['author-state-name','author-text-enabled','author-text','author-visible','author-style','author-color','author-background-color','author-opacity','author-native-value'];
  const layoutFields=['author-layout','author-gap','author-columns','author-width','author-height','author-width-value','author-height-value','author-padding','author-align','author-justify','author-wrap'];
  const savedFields:Record<string,string[]>={
   'author-patch-save':stateFields,
   'author-event-add':['author-event','author-from'],
   'author-event-remove':['author-events'],
   'author-step-save':['author-step'],
   'author-step-remove':['author-step'],
   'author-behavior-save':['author-component-name','author-state-name','author-duration','author-easing'],
   'author-library-publish':['author-component-name'],
   'author-override-save':['author-override-text-enabled','author-override-text','author-override-style'],
   'author-override-reset':['author-override-text-enabled','author-override-text','author-override-style'],
   'author-state-override-reset':stateFields,
   'author-layout-save':layoutFields,
   'author-child-layout-save':[...layoutFields,'author-child-width','author-child-height','author-grow'],
  };
  const on=(id:string,fn:()=>unknown)=>{handlers.set(id,fn);};
  function publishInitial(){model=initial;listeners.forEach(fn=>fn());}
  function publish(){
   if(!active())return;const stamp=generation,captured=scope;
   model={scope,controls:structuredClone(controls),busy,error,
    change:(id,next)=>{if(!active()||busy||stamp!==generation||captured!==pageScope()||control(id).disabled)return;if(typeof next==='boolean')control(id).checked=next;else control(id).value=next;if(!dirty.size)draftBase=contentKey();dirty.add(id);error='';
     const property=id.slice('author-'.length);if(styleFields.includes(property as typeof styleFields[number]))changedStyles.add(property as typeof styleFields[number]);
     if(changeHandlers.has(id)){if(id==='author-component'){dirty.clear();draftBase='';}else for(const field of stateFields)dirty.delete(field);dirty.delete(id);generation++;changeHandlers.get(id)!();}publish();},
    run:async id=>{if(!active()||busy||stamp!==generation||captured!==pageScope()||control(id).disabled)return;const action=handlers.get(id);if(!action)return;if(dirty.size&&draftBase&&draftBase!==contentKey()&&!['author-state-preview','author-target-select','author-parent-select','author-library-edit','author-source-return'].includes(id)){error='组件内容已变化，请载入最新内容后再编辑。';publish();return;}busy=true;error='';publish();
     try{await action();if(active()&&generation===stamp){if(!['author-state-preview','author-target-select','author-parent-select'].includes(id)){for(const field of savedFields[id]??[])dirty.delete(field);draftBase=dirty.size?contentKey():'';key='';render();}}}
     catch(cause){if(active()&&generation===stamp){error=cause instanceof Error?cause.message:String(cause);context.error(cause);}}
     finally{busy=false;if(active())publish();}
    },
    reset:()=>{if(!active()||busy||stamp!==generation)return;dirty.clear();key='';error='';render();},
   };listeners.forEach(fn=>fn());
  }
  function render(){if(!active())return;const next=pageScope();if(next!==scope){scope=next;generation++;dirty.clear();controls=structuredClone(initial.controls);key='';error='';}renderContents();publish();}
  function fill(){fillContents();publish();}
  const styleFields = ['color', 'background-color', 'opacity'] as const;
  const changedStyles = new Set<(typeof styleFields)[number]>();

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
  const contentKey=()=>JSON.stringify([current(),context.slide().constraints?.[current()?.root??'']],(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value);
  const state = () => current()?.states.find((state) => state.id === value('author-state'));
  const save = (component: InteractiveComponent) =>
    context.commands([
      {
        type: 'component.set',
        slideId: context.slide().id,
        component: componentSchema.parse(component),
      },
    ]);
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
  function renderContents() {
    if (sourceReturn?.documentId !== context.document().id) sourceReturn = undefined;
    control('author-source-return').hidden = !sourceReturn;
    control('author-source-status').hidden = !sourceReturn;
    control('author-source-status').text = '正在编辑共享源。修改后发布更新，再返回原实例检查。';
    const library = context.document().componentLibrary ?? [],
      previousLibrary = value('author-library');
    options(
      'author-library',
      library.map((item) => [item.id, item.name]),
      library.some((item) => item.id === previousLibrary) ? previousLibrary : library[0]?.id,
    );
    control('author-library-insert').disabled = !library.length;
    control('author-component-create').disabled = context.selected().length !== 1;
    const components = context.slide().components ?? [],
      selected = context.selected()[0],
      previous = value('author-component');
    const candidates = components.filter((component) => inside(selected, component.root));
    const component =
      candidates.find(
        (candidate) =>
          !candidates.some((other) => other !== candidate && inside(other.root, candidate.root)),
      ) ?? components.find((c) => c.id === previous);
    const identity=JSON.stringify([scope,component?.id]);if(identity!==formIdentity){formIdentity=identity;generation++;dirty.clear();draftBase='';changedStyles.clear();for(const [id,initial]of Object.entries(componentDefaults)){if(id==='author-library')continue;const defaults=initial as Control;if(defaults.value!==undefined)control(id).value=defaults.value;if(defaults.checked!==undefined)control(id).checked=defaults.checked;}key='';}
    if (component?.instance) set('author-library', component.instance.definitionId);
    control('author-library-edit').disabled = !library.length;
    control('author-library-publish').disabled = !!component?.instance;
    const definition = library.find(item => item.source.components?.find(c => c.id === item.componentId)?.root === component?.root);
    const usages = definition ? context.document().slides.flatMap(page => page.components ?? []).filter(c => c.instance?.definitionId === definition.id).length : 0;
    control('author-library-publish').text = definition ? `发布更新 · 同步 ${usages} 个实例` : '发布为共享组件';
    for (const id of ['author-component-name', 'author-state-name', 'author-state-add', 'author-state-remove', 'author-duration', 'author-easing', 'author-behavior-save', 'author-event-add', 'author-event-remove'])
      (control(id) as HTMLInputElement | HTMLButtonElement).disabled = !!component?.instance;
    const stateId = value('author-state'),
      target = value('author-target');
    options(
      'author-component',
      components.map((c) => [c.id, c.name]),
      component?.id,
    );
    control('author-component-edit').hidden = !component;
    if (!component) {
      key = '';
      return;
    }
    const next =
      JSON.stringify([component,context.slide().constraints?.[component.root]]) +
      '/' +
      context.slide().id +
      JSON.stringify(
        context.objects().map((object) => [object.id, object.parent, object.text.slice(0, 35)]),
      );
    if (key === next && control('author-target').options?.length) return;
    key = next;
    control('author-instance-status').text = component.instance
      ? `共享实例 · ${library.find((item) => item.id === component.instance!.definitionId)?.name ?? ''}`
      : definition ? `共享源 · ${usages} 个关联实例` : '独立组件';
    control('author-library-unlink').disabled = !component.instance;
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
      setChecked('author-wrap', layout.wrap);
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
    control('author-step-list').text = component.steps
      .map(
        (step) =>
          `${step.step} → ${component.states.find((state) => state.id === step.state)?.name}`,
      )
      .join('；');
    fill();
  }
  function fillContents() {
    const selected = state(),
      patch = selected?.patches[value('author-target')];
    set('author-state-name', selected?.name ?? '');
    setChecked('author-text-enabled', patch?.text !== undefined);
    set('author-text', patch?.text ?? '');
    const textAllowed = canReplaceText(value('author-target'));
    control('author-text-enabled').disabled = !textAllowed;
    control('author-text').disabled = !textAllowed;
    control('author-text-hint').hidden = textAllowed;
    set('author-visible', patch?.visible === undefined ? '' : String(patch.visible));
    set('author-style', JSON.stringify(patch?.style ?? {}, null, 2));
    for(const property of styleFields)if(!dirty.has('author-'+property))changedStyles.delete(property);
    for (const property of styleFields) set('author-' + property, patch?.style?.[property] ?? '');
    set('author-native-value', patch?.nativeChartValue ?? '');
    const component = current(),
      instance = component?.instance,
      source = Object.entries(instance?.objects ?? {}).find(
        ([, id]) => id === value('author-target'),
      )?.[0],
      override = source ? instance?.overrides[source] : undefined;
    setChecked('author-override-text-enabled', override?.text !== undefined);
    set('author-override-text', override?.text ?? '');
    set('author-override-style', JSON.stringify(override?.style ?? {}, null, 2));
    control('author-state-override-reset').hidden = !instance;
    control('author-state-override-reset').disabled = !source || !instance?.stateOverrides[value('author-state')]?.[source];
    control('author-patch-save').text = instance ? '仅保存此实例的对象状态' : '保存对象状态';
    const child =
      component && context.slide().constraints?.[component.root]?.children[value('author-target')];
    set('author-child-width', child?.width ?? 'fixed');
    set('author-child-height', child?.height ?? 'hug');
    set('author-grow', child?.grow ?? 0);
  }
  changeHandlers.set('author-component',()=>{const component=current();if(component){key='';context.choose(component.root);render();}});
  changeHandlers.set('author-state',fill);
  changeHandlers.set('author-target',fill);
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
    if (!active() || context.document() !== sourceDocument || context.slide().id !== slideId)
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
    if(!active()||context.document().id!==origin.documentId||context.slide().id!==origin.pageId) return;
    if (origin.pageId !== pageId) sourceReturn = origin;
    await context.openPage(pageId);
    if(!active()||context.document().id!==origin.documentId||context.slide().id!==pageId)return;
    context.choose(component.root);
    render();
  });
  on('author-source-return', async () => {
    const origin = sourceReturn;
    if (!origin || origin.documentId !== context.document().id) return;
    if (!context.document().slides.some(page => page.id === origin.pageId)) throw new Error('原页面已删除，请在页面列表中选择其他实例');
    await context.openPage(origin.pageId);
    if(!active()||context.document().id!==origin.documentId||context.slide().id!==origin.pageId)return;
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
            ...(control('author-override-text-enabled').checked
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
    const scopeBefore=pageScope(),componentId=component.id;
    await save(component);
    if(!active()||pageScope()!==scopeBefore||current()?.id!==componentId)return;
    for(const field of stateFields)dirty.delete(field);
    dirty.delete('author-state');set('author-state', id);
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
    if (control('author-text-enabled').checked && !canReplaceText(value('author-target')))
      throw new Error('请选择内部的纯文字对象，容器和原生控件不能整体替换文字');
    selected.patches[value('author-target')] = {
      style: stateStyle(),
      ...(control('author-text-enabled').checked
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
    component.duration = number('author-duration');
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
      const step = number('author-step');
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
        (item) => item.step !== number('author-step'),
      );
      return save(component);
    }
  });
  const layoutSpec = () =>
    containerLayoutSchema.parse({
      ...(context.slide().constraints?.[current()!.root] ?? {}),
      mode: value('author-layout'),
      gap: number('author-gap'),
      columns: number('author-columns'),
      width: value('author-width'),
      height: value('author-height'),
      padding: number('author-padding'),
      align: value('author-align'),
      justify: value('author-justify'),
      wrap: control('author-wrap').checked,
      ...(value('author-width-value') ? { widthValue: number('author-width-value') } : {}),
      ...(value('author-height-value')
        ? { heightValue: number('author-height-value') }
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
      grow: number('author-grow'),
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
  publishInitial();
  return {render,dispose(){if(active()){publishInitial();owner=undefined;}}};
}
