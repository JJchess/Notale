import { cloneChart } from './chart-authoring.js';
import { inspectCanvasSources, canvasSceneDescriptor } from './canvas-instances.js';
import { inspectSourceScenes, validateSceneValues } from './source-scenes.js';
import { applyContainerLayout } from './container-layout-commands.js';
import { svgReferenceValue } from './svg-references.js';
import { inspectChartSources } from './chart-sources.js';
import { inspectChartComponents, interactionMembers } from './chart-components.js';
import { componentTargets } from './components.js';
import { type Command, type Slide, invariant } from './model.js';
import {
  parse,
  serialize,
  serializeOuter,
  elements,
  findElement,
  attr,
  setAttr,
  NODE_ID,
  uid,
  appendHtml,
  patchStyle,
  removeElement,
  normalizeHtml,
} from './html.js';
import { rebaseElements } from './layouts.js';

type Transfer = Extract<Command, { type: 'elements.transfer' }>;
export function transferObjects(
  source: Slide,
  target: Slide,
  command: Transfer,
  stable: {
    objects?: Record<string, string>;
    domIds?: Record<string, string>;
    metadata?: Record<string, string>;
  } = {},
) {
  const metadataIds = new Map<string, string>();
  const metadataId = (id: string) => {
    const next = stable.metadata?.[id] ?? uid();
    metadataIds.set(id, next);
    return next;
  };
  const sourceRoot = parse(source.html),
    destRoot = source === target ? sourceRoot : parse(target.html);
  const all = elements(sourceRoot),
    requested = [...new Set(command.targets)].map((id) => findElement(sourceRoot, id));
  const roots = requested.filter(
    (el) => !requested.some((parent) => parent !== el && elements(parent).includes(el)),
  );
  const sourceNodes = roots.flatMap(elements),
    selected = new Set(sourceNodes.map((el) => attr(el, NODE_ID)!));
  const canvasSources = inspectCanvasSources(source),
    canvasScenes = inspectSourceScenes(source);
  const allowedCanvases = new Set<string>();
  for (const [root, instance] of Object.entries(canvasSources)) {
    const members = Object.values(instance.members);
    if (!members.some((id) => selected.has(id))) continue;
    invariant(
      selected.has(root) && members.every((id) => selected.has(id)),
      'CANVAS_BOUNDARY',
      'Copy or move the complete Canvas interactive region',
    );
    for (const id of members) allowedCanvases.add(id);
  }
  for (const [root, values] of Object.entries(command.canvasSceneStates ?? {})) {
    invariant(
      selected.has(root) && canvasSources[root],
      'INVALID_CLIPBOARD',
      'Captured Canvas state is outside the selection',
    );
    validateSceneValues(canvasSceneDescriptor(root, canvasSources[root]), values);
  }
  const chartSources = inspectChartSources(source);
  const components = inspectChartComponents(source);
  for (const component of source.components ?? [])
    if (componentTargets(component).some((id) => selected.has(id)))
      invariant(
        selected.has(component.root),
        'COMPONENT_BOUNDARY',
        'Transfer the complete component root',
      );
  for (const [id, state] of Object.entries(command.componentStates ?? {})) {
    const component = source.components?.find((component) => component.id === id);
    invariant(
      component &&
        selected.has(component.root) &&
        component.states.some((candidate) => candidate.id === state),
      'INVALID_CLIPBOARD',
      'Captured component state is unavailable or outside the selection',
    );
  }
  for (const id of Object.keys(command.nativeChartStates ?? {}))
    invariant(
      selected.has(id) &&
        components.has(id) &&
        interactionMembers(components.get(id)!).every((member) => selected.has(member)),
      'INVALID_CLIPBOARD',
      'Captured component state is outside the selection or unavailable',
    );
  for (const [id, chart] of Object.entries(source.nativeCharts))
    if (
      chart.interaction &&
      [id, ...interactionMembers(chart.interaction)].some((member) => selected.has(member))
    )
      invariant(
        selected.has(id) &&
          interactionMembers(chart.interaction).every((member) => selected.has(member)),
        'COMPONENT_BOUNDARY',
        'Copy or move the complete interactive component',
      );
  for (const id of command.nativeChartTargets ?? []) {
    invariant(selected.has(id), 'INVALID_CLIPBOARD', 'Captured chart is outside the selection');
    invariant(
      chartSources.has(id) || !!source.nativeCharts[id]?.authoring,
      'INTERACTION_CLONE',
      'This native chart needs a source adapter before object copying; duplicate its page to preserve the original runtime',
    );
  }
  for (const node of sourceNodes) {
    const id = attr(node, NODE_ID)!;
    if (chartSources.has(id) && !source.nativeCharts[id]?.source)
      invariant(
        roots.includes(node) ||
          (!!components.get(id) &&
            interactionMembers(components.get(id)!).every((member) => selected.has(member))),
        'INTERACTION_CLONE',
        'Select the native chart host itself; surrounding native controls need their own instance adapter',
      );
  }
  invariant(
    !sourceNodes.some(
      (el) =>
        (['script', 'canvas'].includes(el.tagName) &&
          !(el.tagName === 'canvas' && allowedCanvases.has(attr(el, NODE_ID)!))) ||
        (source.nativeCharts[attr(el, NODE_ID) ?? ''] &&
          !chartSources.has(attr(el, NODE_ID) ?? '') && !source.nativeCharts[attr(el,NODE_ID)??'']?.authoring),
    ),
    'INTERACTION_CLONE',
    'This interactive subtree needs a content-type adapter; duplicate its page to keep the full script context',
  );
  if (command.mode === 'cut')
    for (const el of sourceNodes) {
      let current: typeof el | undefined = el;
      while (current) {
        invariant(
          !source.locked.includes(attr(current, NODE_ID) ?? ''),
          'LOCKED',
          'Cannot cut a locked object',
        );
        current =
          current.parentNode && 'tagName' in current.parentNode ? current.parentNode : undefined;
      }
    }
  const parent =
    elements(destRoot).find((el) => attr(el, 'id') === 'stage') ??
    elements(destRoot).find((el) => el.tagName === 'body')!;
  const mappings = new Map<string, string>(),
    domIds = new Map<string, string>();
  const newRoots = [];
  const flattenedSvg = new Map<string, number[]>();
  for (const root of roots) {
    const rect = command.rectangles.find((r) => r.id === attr(root, NODE_ID));
    const svgChild = root.namespaceURI === 'http://www.w3.org/2000/svg' && root.tagName !== 'svg';
    let container = parent;
    if (svgChild) {
      invariant(
        rect?.geometry?.center && rect.svgViewport,
        'SVG_GEOMETRY_REQUIRED',
        'Copy this SVG object with its current viewport and geometry capture',
      );
      container = appendHtml(
        parent,
        `<svg data-notale-clipboard-svg="" width="${Math.max(1, rect.width)}" height="${Math.max(1, rect.height)}" viewBox="0 0 ${rect.svgViewport.width} ${rect.svgViewport.height}" preserveAspectRatio="none" style="position:absolute;left:${rect.x + command.offset.x}px;top:${rect.y + command.offset.y}px;width:${Math.max(1, rect.width)}px;height:${Math.max(1, rect.height)}px;max-width:none;max-height:none;margin:0;padding:0;border:0;transform:none;translate:none;rotate:none;scale:none;overflow:visible"></svg>`,
      ).find((n) => 'tagName' in n)! as typeof root;
    }
    const fragment = appendHtml(container, serializeOuter(root), undefined, false),
      copy = fragment.find((n) => 'tagName' in n)! as typeof root;
    newRoots.push(copy);
    for (const el of elements(copy)) {
      const old = attr(el, NODE_ID);
      if (old) {
        const next = stable.objects?.[old] ?? uid();
        mappings.set(old, next);
        setAttr(el, NODE_ID, next);
        if (command.computedStyles[old]) patchStyle(el, command.computedStyles[old]);
      }
      const domId = attr(el, 'id');
      if (domId) {
        const nextDom = stable.domIds?.[domId] ?? `copy-${uid()}`;
        domIds.set(domId, nextDom);
        setAttr(el, 'id', nextDom);
      }
    }
    if (svgChild && rect?.geometry?.center && rect.svgViewport) {
      const p = rect.geometry.parent,
        l = rect.geometry.local,
        c = rect.geometry.center;
      const a = p[0] * l[0] + p[2] * l[1],
        b = p[1] * l[0] + p[3] * l[1],
        d = p[0] * l[2] + p[2] * l[3],
        e = p[1] * l[2] + p[3] * l[3];
      const sx = Math.max(1, rect.width) / rect.svgViewport.width,
        sy = Math.max(1, rect.height) / rect.svgViewport.height;
      const matrix = [
        a / sx,
        b / sy,
        d / sx,
        e / sy,
        (rect.width / 2 - a * c[0] - d * c[1]) / sx,
        (rect.height / 2 - b * c[0] - e * c[1]) / sy,
      ];
      invariant(
        [...matrix, rect.x + command.offset.x, rect.y + command.offset.y].every(Number.isFinite),
        'INVALID_GEOMETRY',
        'SVG capture or offset exceeds finite geometry',
      );
      flattenedSvg.set(attr(root, NODE_ID)!, matrix);
      patchStyle(copy, {
        transform: `matrix(${matrix.join(',')})`,
        'transform-origin': '0px 0px',
        translate: 'none',
        rotate: 'none',
        scale: 'none',
      });
    } else if (rect) {
      const width = rect.matrix && rect.baseWidth ? rect.baseWidth : rect.width,
        height = rect.matrix && rect.baseHeight ? rect.baseHeight : rect.height;
      patchStyle(copy, {
        position: 'absolute',
        left: `${rect.x + (rect.width - width) / 2 + command.offset.x}px`,
        top: `${rect.y + (rect.height - height) / 2 + command.offset.y}px`,
        width: `${width}px`,
        height: `${height}px`,
        margin: '0',
        translate: 'none',
        ...(rect.matrix
          ? {
              transform: `matrix(${rect.matrix.join(',')},0,0)`,
              'transform-origin': '50% 50%',
              rotate: 'none',
              scale: 'none',
            }
          : {}),
      });
    } else {
      const old = source.transforms[attr(root, NODE_ID)!];
      patchStyle(copy, {
        translate: `${(old?.x ?? 0) + command.offset.x}px ${(old?.y ?? 0) + command.offset.y}px`,
      });
    }
  }
  // Resolve the complete dependency graph, including quoted URLs and href
  // chains. Cycles terminate because IDs are assigned before dependencies scan.
  const copies = newRoots.flatMap(elements);
  let defs: typeof parent | undefined;
  for (let i = 0; i < copies.length; i++) {
    const el = copies[i];
    for (const a of el.attrs)
      svgReferenceValue(el.tagName, a.name, a.value, (id) => {
        if (domIds.has(id)) return id;
        const definition = all.find((node) => attr(node, 'id') === id);
        invariant(definition, 'MISSING_DEFINITION', `SVG definition ${id} is unavailable`);
        invariant(
          !elements(definition).some((node) =>
            ['script', 'canvas'].includes(node.tagName),
          ),
          'INTERACTION_CLONE',
          'Referenced SVG subtree needs an interaction adapter',
        );
        if (!defs) {
          const holder = appendHtml(
            parent,
            '<svg data-notale-clipboard-defs="" aria-hidden="true" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden;pointer-events:none"><defs></defs></svg>',
          ).find((n) => 'tagName' in n)!;
          defs = elements(holder).find((n) => n.tagName === 'defs')!;
        }
        const nodes = appendHtml(defs, serializeOuter(definition), undefined, true).flatMap(
          elements,
        );
        const originalNodes = elements(definition);
        nodes.forEach((node, index) => {
          const originalId = attr(originalNodes[index], NODE_ID);
          if (originalId && command.computedStyles[originalId])
            patchStyle(node, command.computedStyles[originalId]);
          const domId = attr(node, 'id');
          if (domId) {
            const next = `copy-${uid()}`;
            domIds.set(domId, next);
            setAttr(node, 'id', next);
          }
        });
        copies.push(...nodes);
        return id;
      });
  }
  for (const el of copies)
    for (const a of el.attrs) {
      a.value = svgReferenceValue(el.tagName, a.name, a.value, (id) => domIds.get(id) ?? id);
      if (a.name === 'href' && a.value.startsWith('#') && domIds.has(a.value.slice(1)))
        a.value = '#' + domIds.get(a.value.slice(1));
      if (['for', 'aria-labelledby', 'aria-describedby', 'aria-controls'].includes(a.name))
        a.value = a.value
          .split(/\s+/)
          .map((id) => domIds.get(id) ?? id)
          .join(' ');
    }
  rebaseElements(copies, source.sourcePath, target.sourcePath);
  const chartIds=new Map<string,string>();
  for(const [id,chart] of Object.entries(source.nativeCharts))if(selected.has(id)&&chart.authoring){
    const cloned=cloneChart(chart.authoring,uid);for(const [old,next] of cloned.ids)chartIds.set(old,next);
    target.nativeCharts[mappings.get(id)!]={...structuredClone(chart),authoring:cloned.model};
  }
  for (const [id, sourceRecipe] of chartSources)
    if (selected.has(id)) {
      const mapped = mappings.get(id)!;
      target.nativeCharts[mapped] = {
        ...target.nativeCharts[mapped],
        adapter: 'echarts',
        option: structuredClone(source.nativeCharts[id]?.option ?? {}),
        source: structuredClone(sourceRecipe),
      };
      const interaction = components.get(id);
      if (interaction && interactionMembers(interaction).every((member) => selected.has(member))) {
        const remap = (record: Record<string, string>) =>
          Object.fromEntries(
            Object.entries(record).map(([key, value]) => [key, mappings.get(value)!]),
          );
        target.nativeCharts[mapped].interaction = {
          ...structuredClone(interaction),
          ...structuredClone(command.nativeChartStates?.[id] ?? {}),
          root: mappings.get(interaction.root)!,
          controls: remap(interaction.controls) as typeof interaction.controls,
          metrics: remap(interaction.metrics) as typeof interaction.metrics,
        };
      }
    }
  for (const component of [...(source.components ?? [])])
    if (selected.has(component.root)) {
      target.components ??= [];
      target.components.push({
        ...structuredClone(component),
        id: metadataId(component.id),
        ...(component.instance
          ? {
              instance: {
                ...structuredClone(component.instance),
                ...(component.instance.steps
                  ? {
                      steps: component.instance.steps.map((step) =>
                        step.step === 0
                          ? {
                              ...step,
                              state: command.componentStates?.[component.id] ?? step.state,
                            }
                          : step,
                      ),
                    }
                  : {}),
                ...(command.componentStates?.[component.id]
                  ? { initial: command.componentStates[component.id] }
                  : {}),
                objects: Object.fromEntries(
                  Object.entries(component.instance.objects).map(([key, value]) => [
                    key,
                    mappings.get(value)!,
                  ]),
                ),
              },
            }
          : {}),
        root: mappings.get(component.root)!,
        initial: command.componentStates?.[component.id] ?? component.initial,
        steps: component.steps.map((step) =>
          step.step === 0
            ? { ...step, state: command.componentStates?.[component.id] ?? step.state }
            : step,
        ),
        states: component.states.map((state) => ({
          ...structuredClone(state),
          patches: Object.fromEntries(
            Object.entries(state.patches).map(([target, patch]) => [
              mappings.get(target)!,
              structuredClone(patch),
            ]),
          ),
        })),
        events: component.events.map((event) => ({
          ...event,
          target: mappings.get(event.target)!,
        })),
      });
    }
  const canvasBoundControls = new Set<string>();
  for (const [root, instance] of Object.entries(canvasSources))
    if (selected.has(root)) {
      const next = mappings.get(root)!;
      target.canvasInstances ??= {};
      target.canvasInstances[next] = {
        ...structuredClone(instance),
        members: Object.fromEntries(
          Object.entries(instance.members).map(([key, id]) => [key, mappings.get(id)!]),
        ),
      };
      const scene = canvasScenes.find((scene) => scene.root === root);
      const values = { ...source.scenes?.find((settings) => settings.id === scene?.id)?.values };
      for (const parameter of scene?.parameters ?? []) {
        const binding = source.bindings.find(
          (binding) => binding.target === parameter.control?.target,
        );
        if (binding)
          values[parameter.key] =
            typeof parameter.value === 'number' ? Number(binding.value) : binding.value;
      }
      Object.assign(values, command.canvasSceneStates?.[root] ?? {});
      validateSceneValues(canvasSceneDescriptor(next, target.canvasInstances[next]), values);
      target.scenes ??= [];
      target.scenes.push({ id: next, values });
      for (const parameter of scene?.parameters ?? [])
        if (parameter.control && Object.hasOwn(values, parameter.key))
          canvasBoundControls.add(mappings.get(parameter.control.target)!);
    }
  for (const c of [...source.connectors])
    if (selected.has(c.id)) {
      invariant(
        source.id === target.id ||
          [c.start, c.end].every((endpoint) => !endpoint.target || mappings.has(endpoint.target)),
        'CONNECTOR_CLONE',
        'Select all bound endpoint objects with this connector for cross-page copying',
      );
      target.connectors.push({
        ...structuredClone(c),
        id: mappings.get(c.id)!,
        start: c.start.target
          ? { ...c.start, target: mappings.get(c.start.target) ?? c.start.target }
          : structuredClone(c.start),
        end: c.end.target
          ? { ...c.end, target: mappings.get(c.end.target) ?? c.end.target }
          : structuredClone(c.end),
      });
    }
  for (const a of [...source.animations])
    if (selected.has(a.target) && (!a.triggerTarget || selected.has(a.triggerTarget)))
      target.animations.push({
        ...structuredClone(a),
        ...(a.chartStateId?{chartStateId:chartIds.get(a.chartStateId)??a.chartStateId}:{}),
        id: metadataId(a.id),
        target: mappings.get(a.target)!,
        ...(a.triggerTarget ? { triggerTarget: mappings.get(a.triggerTarget)! } : {}),
      });
  for (const b of [...source.bindings])
    if (selected.has(b.target) && !canvasBoundControls.has(mappings.get(b.target)!))
      target.bindings.push({
        ...structuredClone(b),
        id: metadataId(b.id),
        target: mappings.get(b.target)!,
      });
  for (const g of [...source.groups])
    if (g.members.every((id) => selected.has(id)))
      target.groups.push({
        ...g,
        id: metadataId(g.id),
        members: g.members.map((id) => mappings.get(id)!),
      });
  for (const [id, t] of Object.entries({ ...source.transforms }))
    if (mappings.has(id)) {
      const isRoot = roots.some((el) => attr(el, NODE_ID) === id),
        hasPlacement = command.rectangles.some((r) => r.id === id);
      const flattened = command.rectangles.find((r) => r.id === id)?.matrix;
      target.transforms[mappings.get(id)!] = {
        ...t,
        x: isRoot && hasPlacement ? 0 : t.x + (isRoot ? command.offset.x : 0),
        y: isRoot && hasPlacement ? 0 : t.y + (isRoot ? command.offset.y : 0),
        ...(isRoot && flattened ? { rotate: 0, scaleX: 1, scaleY: 1, matrix: undefined } : {}),
      };
    }
  for (const [id, matrix] of flattenedSvg)
    target.transforms[mappings.get(id)!] = {
      x: 0,
      y: 0,
      rotate: 0,
      scaleX: 1,
      scaleY: 1,
      matrix: matrix as [number, number, number, number, number, number],
    };
  for (const [id, layout] of Object.entries(source.constraints ?? {}))
    if (mappings.has(id)) {
      target.constraints ??= {};
      target.constraints[mappings.get(id)!] = {
        ...structuredClone(layout),
        children: Object.fromEntries(
          Object.entries(layout.children)
            .filter(([child]) => mappings.has(child))
            .map(([child, spec]) => [mappings.get(child)!, spec]),
        ),
      };
    }
  if (command.mode === 'cut') for (const el of roots) removeElement(el);
  target.html = normalizeHtml(serialize(destRoot));
  for (const id of mappings.values())
    if (target.constraints?.[id]) applyContainerLayout(target, id, target.constraints[id]);
  if (source !== target && command.mode === 'cut') source.html = serialize(sourceRoot);
  return {
    objects: Object.fromEntries(mappings),
    domIds: Object.fromEntries(domIds),
    metadata: Object.fromEntries(metadataIds),
  };
}
