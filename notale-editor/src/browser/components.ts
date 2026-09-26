import type { InteractiveComponent } from '../domain/components.js';
export function componentController(
  components: InteractiveComponent[],
  nativeValue: (target: string, value: '1.0' | '0.1' | '0.02') => void,
  notify: (id: string, state: string) => void,
  nativeInitial: (target: string) => '1.0' | '0.1' | '0.02' | undefined,
) {
  const get = (id: string) =>
    document.querySelector<HTMLElement>(`[data-notale-id="${CSS.escape(id)}"]`);
  type Baseline = {
    node: HTMLElement;
    text: string;
    inline: Record<string, [string, string]>;
    computed: Record<string, string>;
    native?: '1.0' | '0.1' | '0.02';
  };
  const baselines = new Map<string, Map<string, Baseline>>(),
    values = new Map<string, string>(),
    animations = new Map<string, Animation[]>();
  const cleanups = new Map<string, Array<() => void>>();
  const eventSources = new WeakMap<Event, Map<string, string>>();
  function select(id: string, stateId: string, animate = true) {
    const component = components.find((c) => c.id === id),
      state = component?.states.find((s) => s.id === stateId),
      base = baselines.get(id);
    if (!component || !state || !base) return false;
    animations.get(id)?.forEach((animation) => animation.cancel());
    const running: Animation[] = [];
    for (const [target, snapshot] of base) {
      const { node } = snapshot,
        patch = state.patches[target];
      const previous = getComputedStyle(node),
        from: Record<string, string> = {};
      for (const property of Object.keys(snapshot.inline))
        from[property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] =
          previous.getPropertyValue(property);
      for (const [property, [value, priority]] of Object.entries(snapshot.inline)) {
        if (value) node.style.setProperty(property, value, priority);
        else node.style.removeProperty(property);
      }
      if (component.states.some((s) => s.patches[target]?.text !== undefined))
        node.textContent = patch?.text ?? snapshot.text;
      for (const [property, value] of Object.entries(patch?.style ?? {}))
        node.style.setProperty(property, value);
      if (patch?.visible !== undefined) {
        node.style.setProperty('visibility', patch.visible ? 'visible' : 'hidden', 'important');
        node.style.setProperty(
          'pointer-events',
          patch.visible ? snapshot.computed['pointer-events'] || 'auto' : 'none',
          'important',
        );
      }
      const chartValue = patch?.nativeChartValue ?? snapshot.native;
      if (chartValue) nativeValue(target, chartValue);
      if (
        animate &&
        component.duration &&
        !matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        const final = getComputedStyle(node),
          to: Record<string, string> = {};
        for (const property of Object.keys(snapshot.inline))
          to[property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] =
            final.getPropertyValue(property);
        if (Object.keys(to).length)
          running.push(
            node.animate([from, to], { duration: component.duration, easing: component.easing }),
          );
      }
    }
    animations.set(id, running);
    values.set(id, stateId);
    notify(id, stateId);
    return true;
  }
  function start(items = components, initialize = true) {
    for (const component of items) {
      const base = new Map<string, Baseline>();
      for (const state of component.states)
        for (const [target, patch] of Object.entries(state.patches)) {
          const node = get(target);
          if (!node) continue;
          let entry = base.get(target);
          if (!entry) {
            entry = { node, text: node.textContent ?? '', inline: {}, computed: {} };
            base.set(target, entry);
          }
          if (patch.nativeChartValue !== undefined) entry.native = nativeInitial(target);
          const computed = getComputedStyle(node);
          for (const property of [
            ...Object.keys(patch.style ?? {}),
            ...(patch.visible !== undefined ? ['visibility', 'pointer-events'] : []),
          ])
            if (!(property in entry.inline)) {
              entry.inline[property] = [
                node.style.getPropertyValue(property),
                node.style.getPropertyPriority(property),
              ];
              entry.computed[property] = computed.getPropertyValue(property);
            }
        }
      baselines.set(component.id, base);
      for (const event of component.events) {
        const node = get(event.target);
        if (!node) continue;
        const handle = (signal: Event) => {
          if (document.documentElement.dataset.notaleMode === 'edit') return;
          const nearest = signal
            .composedPath()
            .find(
              (candidate) =>
                candidate instanceof Element &&
                component.events.some(
                  (binding) => binding.event === event.event && get(binding.target) === candidate,
                ),
            );
          if (nearest !== node) return;
          let sources = eventSources.get(signal);
          if (!sources) {
            sources = new Map();
            eventSources.set(signal, sources);
          }
          if (!sources.has(component.id)) sources.set(component.id, values.get(component.id)!);
          if (!event.from || sources.get(component.id) === event.from)
            select(component.id, event.to);
        };
        node.addEventListener(event.event, handle);
        const list=cleanups.get(component.id)??[];list.push(() => node.removeEventListener(event.event, handle));cleanups.set(component.id,list);
      }
    }
    if(initialize)seek(0, false);
  }
  function seek(step: number, animate = false) {
    for (const component of components) {
      const selected =
        [...component.steps]
          .sort((a, b) => a.step - b.step)
          .filter((item) => item.step <= step)
          .at(-1)?.state ?? component.initial;
      select(component.id, selected, animate);
    }
  }
  function capture(selected: Set<string>) {
    const states: Record<string, string> = {},
      styles: Record<string, Record<string, string>> = {},
      nativeValues: Record<string, '1.0' | '0.1' | '0.02'> = {};
    for (const component of components)
      if (selected.has(component.root)) {
        states[component.id] = values.get(component.id) ?? component.initial;
        for (const [target, entry] of baselines.get(component.id) ?? []) {
          styles[target] = { ...styles[target], ...entry.computed };
          if (component.states.some((state) => state.patches[target]?.text !== undefined)) {
            styles[target].width = entry.node.style.width || 'auto';
            styles[target].height = entry.node.style.height || 'auto';
          }
          if (entry.native) nativeValues[target] = entry.native;
        }
      }
    return { states, styles, nativeValues };
  }
  function withBaseline<T>(ids: string[], callback: () => T): T {
    const roots = ids.map(get).filter((node): node is HTMLElement => !!node);
    const snapshots: Array<{ node: HTMLElement; style: string | null; text?: string }> = [];
    const suspended: Array<{
      animation: Animation;
      time: CSSNumberish | null;
      state: AnimationPlayState;
    }> = [];
    for (const component of components)
      if (roots.some((root) => root.contains(get(component.root)))) {
        for (const animation of animations.get(component.id) ?? []) {
          suspended.push({ animation, time: animation.currentTime, state: animation.playState });
          animation.cancel();
        }
        for (const [target, entry] of baselines.get(component.id) ?? []) {
          const text = component.states.some((state) => state.patches[target]?.text !== undefined)
            ? (entry.node.textContent ?? '')
            : undefined;
          snapshots.push({ node: entry.node, style: entry.node.getAttribute('style'), text });
          for (const [property, [value, priority]] of Object.entries(entry.inline)) {
            if (value) entry.node.style.setProperty(property, value, priority);
            else entry.node.style.removeProperty(property);
          }
          entry.node.style.transition = 'none';
          if (text !== undefined) entry.node.textContent = entry.text;
        }
      }
    try {
      return callback();
    } finally {
      for (const snapshot of snapshots.reverse()) {
        if (snapshot.style === null) snapshot.node.removeAttribute('style');
        else snapshot.node.setAttribute('style', snapshot.style);
        if (snapshot.text !== undefined) snapshot.node.textContent = snapshot.text;
      }
      for (const { animation, time, state } of suspended)
        if (state === 'running' || state === 'paused') {
          animation.play();
          animation.currentTime = time;
          if (state === 'paused') animation.pause();
        }
    }
  }
  function stop() {
    for(const list of cleanups.values())list.forEach(cleanup=>cleanup());cleanups.clear();
    for (const list of animations.values()) list.forEach((animation) => animation.cancel());
  }
  function update(next: InteractiveComponent[]) {
    const changed=next.filter(c=>JSON.stringify(c)!==JSON.stringify(components.find(old=>old.id===c.id)));
    const ids=new Set([...changed.map(c=>c.id),...components.filter(c=>!next.some(n=>n.id===c.id)).map(c=>c.id)]);
    for(const id of ids){cleanups.get(id)?.forEach(fn=>fn());cleanups.delete(id);animations.get(id)?.forEach(a=>a.cancel());animations.delete(id);baselines.delete(id);}
    components=next;start(changed,false);
    for(const c of changed)select(c.id,c.states.some(s=>s.id===values.get(c.id))?values.get(c.id)!:c.initial,false);
    for(const id of [...values.keys()])if(!next.some(c=>c.id===id))values.delete(id);
  }
  return {
    update,
    start,
    stop,
    seek,
    select,
    capture,
    withBaseline,
    state: () => Object.fromEntries(values),
  };
}
