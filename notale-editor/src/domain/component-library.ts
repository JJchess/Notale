import type { Command, DeckDocument, Slide } from './model.js';
import { invariant, slideSchema } from './model.js';
import { type InteractiveComponent, type ComponentPatch } from './components.js';
import { applyContainerLayout } from './container-layout-commands.js';
import { transferObjects } from './clipboard.js';
import {
  parse,
  serialize,
  elements,
  findElement,
  attr,
  NODE_ID,
  removeElement,
  patchStyle,
  setText,
  setAttr,
  parseStyle,
  normalizeHtml,
} from './html.js';

type Definition = NonNullable<DeckDocument['componentLibrary']>[number];
export function libraryDefinition(doc: DeckDocument, id: string) {
  const definition = doc.componentLibrary?.find((item) => item.id === id);
  invariant(definition, 'COMPONENT_LIBRARY_NOT_FOUND', 'Shared component does not exist');
  return definition;
}
function sourceComponent(definition: Definition) {
  const component = definition.source.components?.find(
    (item) => item.id === definition.componentId,
  );
  invariant(component, 'INVALID_COMPONENT_LIBRARY', 'Shared component source is missing');
  return component;
}
function assertUnlocked(slide: Slide, rootId: string) {
  const root = parse(slide.html),
    node = findElement(root, rootId);
  invariant(
    !elements(node).some((item) => slide.locked.includes(attr(item, NODE_ID) ?? '')),
    'LOCKED',
    'Component instance contains a locked object',
  );
  for (
    let item: typeof node | undefined = node;
    item;
    item = item.parentNode && 'tagName' in item.parentNode ? item.parentNode : undefined
  )
    invariant(
      !slide.locked.includes(attr(item, NODE_ID) ?? ''),
      'LOCKED',
      'Component instance container is locked',
    );
}
function applyPatch(slide: Slide, target: string, patch: ComponentPatch) {
  const tree = parse(slide.html),
    node = findElement(tree, target);
  if (patch.text !== undefined) {
    invariant(
      !node.childNodes.some((child) => 'tagName' in child) &&
        ![
          'script',
          'style',
          'canvas',
          'iframe',
          'input',
          'textarea',
          'select',
          'img',
          'video',
          'audio',
        ].includes(node.tagName),
      'INVALID_COMPONENT',
      'Text override requires a text-only object',
    );
    setText(node, patch.text);
  }
  if (patch.style) patchStyle(node, patch.style);
  if (patch.visible !== undefined)
    patchStyle(node, {
      visibility: patch.visible ? 'visible' : 'hidden',
      'pointer-events': patch.visible ? 'auto' : 'none',
    });
  if (patch.nativeChartValue !== undefined) {
    invariant(
      slide.nativeCharts[target]?.interaction,
      'INVALID_COMPONENT',
      'Native value override requires an adopted chart',
    );
    slide.nativeCharts[target].interaction!.value = patch.nativeChartValue;
  }
  slide.html = serialize(tree);
}
function overrides(slide: Slide, component: InteractiveComponent) {
  const instance = component.instance!;
  if (instance.initial) {
    invariant(
      component.states.some((state) => state.id === instance.initial),
      'COMPONENT_OVERRIDE_REMOVED',
      'The shared update removed the instance initial state',
    );
    component.initial = instance.initial;
    component.steps = component.steps.map((step) =>
      step.step === 0 ? { ...step, state: instance.initial! } : step,
    );
  }
  if (instance.steps) {
    invariant(
      instance.steps.every((step) => component.states.some((state) => state.id === step.state)),
      'COMPONENT_OVERRIDE_REMOVED',
      'Shared update removed a teaching step state',
    );
    component.steps = structuredClone(instance.steps);
  }
  for (const [source, layout] of Object.entries(instance.layouts)) {
    invariant(
      instance.objects[source],
      'COMPONENT_OVERRIDE_REMOVED',
      'Shared update removed a constrained object',
    );
    const mapped = {
      ...layout,
      children: Object.fromEntries(
        Object.entries(layout.children).map(([id, spec]) => {
          invariant(
            instance.objects[id],
            'COMPONENT_OVERRIDE_REMOVED',
            'Shared update removed a constrained child',
          );
          return [instance.objects[id], spec];
        }),
      ),
    };
    applyContainerLayout(slide, instance.objects[source], mapped);
  }
  for (const [source, patch] of Object.entries(instance.overrides)) {
    invariant(
      instance.objects[source],
      'COMPONENT_OVERRIDE_REMOVED',
      'A shared update removed an overridden object; reset the override or detach the instance first',
    );
    applyPatch(slide, instance.objects[source], patch);
  }
  for (const [source, transform] of Object.entries(instance.transforms)) {
    invariant(
      instance.objects[source],
      'COMPONENT_OVERRIDE_REMOVED',
      'Shared update removed a transformed object',
    );
    slide.transforms[instance.objects[source]] = structuredClone(transform);
  }
  for (const [state, patches] of Object.entries(instance.stateOverrides)) {
    const targetState = component.states.find((item) => item.id === state);
    invariant(
      targetState,
      'COMPONENT_OVERRIDE_REMOVED',
      'A shared update removed an overridden state',
    );
    for (const [source, patch] of Object.entries(patches)) {
      invariant(
        instance.objects[source],
        'COMPONENT_OVERRIDE_REMOVED',
        'A shared update removed an overridden object',
      );
      const id = instance.objects[source],
        inherited = targetState.patches[id] ?? {};
      targetState.patches[id] = {
        ...inherited,
        ...patch,
        ...(patch.style ? { style: { ...inherited.style, ...patch.style } } : {}),
      };
    }
  }
}
export function instantiateComponent(
  doc: DeckDocument,
  slide: Slide,
  definition: Definition,
  offset: { x: number; y: number },
) {
  const source = sourceComponent(definition);
  const copied = transferObjects(structuredClone(definition.source), slide, {
    type: 'elements.transfer',
    slideId: slide.id,
    sourceSlideId: definition.source.id,
    targets: [source.root],
    mode: 'copy',
    offset,
    rectangles: definition.rectangles,
    computedStyles: definition.computedStyles,
  });
  const component = slide.components!.find((item) => item.root === copied.objects[source.root])!;
  component.instance = {
    definitionId: definition.id,
    objects: copied.objects,
    overrides: {},
    stateOverrides: {},
    layouts: {},
    transforms: {},
  };
  return component;
}
export function refreshInstance(doc: DeckDocument, slide: Slide, component: InteractiveComponent) {
  assertUnlocked(slide, component.root);
  const order = new Map((slide.components ?? []).map((item, index) => [item.id, index]));
  const instance = structuredClone(component.instance!),
    definition = libraryDefinition(doc, instance.definitionId),
    source = sourceComponent(definition);
  const tree = parse(slide.html),
    node = findElement(tree, component.root),
    parent = node.parentNode!,
    index = parent.childNodes.indexOf(node);
  const sourceTree = parse(definition.source.html),
    sourceNodes = elements(sourceTree);
  const localIds = new Set(
    elements(node)
      .map((item) => attr(item, NODE_ID))
      .filter((id): id is string => !!id),
  );
  const domIds: Record<string, string> = {},
    metadata: Record<string, string> = {};
  for (const item of sourceNodes) {
    const id = attr(item, NODE_ID),
      domId = attr(item, 'id');
    if (id && domId && instance.objects[id] && localIds.has(instance.objects[id])) {
      const local = findElement(tree, instance.objects[id]);
      if (attr(local, 'id')) domIds[domId] = attr(local, 'id')!;
    }
  }
  for (const original of definition.source.components ?? []) {
    const existing = slide.components?.find(
      (item) => item.root === instance.objects[original.root],
    );
    if (existing) metadata[original.id] = existing.id;
  }
  const placement = Object.fromEntries(
    [...parseStyle(attr(node, 'style') ?? '')].filter(([key]) =>
      [
        'position',
        'left',
        'top',
        'right',
        'bottom',
        'translate',
        'transform',
        'transform-origin',
        'rotate',
        'scale',
      ].includes(key),
    ),
  );
  const rootTransform = slide.transforms[component.root];
  if (rootTransform?.width) placement.width = `${rootTransform.width}px`;
  if (rootTransform?.height) placement.height = `${rootTransform.height}px`;
  // Remove only definition-owned content; references elsewhere keep their stable target IDs.
  removeElement(node);
  slide.html = serialize(tree);
  slide.components = slide.components?.filter((item) => !localIds.has(item.root));
  slide.animations = slide.animations.filter((item) => !localIds.has(item.target));
  slide.bindings = slide.bindings.filter((item) => !localIds.has(item.target));
  slide.groups = slide.groups.filter((item) => !item.members.every((id) => localIds.has(id)));
  slide.connectors = slide.connectors.filter((item) => !localIds.has(item.id));
  for (const id of localIds) {
    delete slide.nativeCharts[id];
    delete slide.transforms[id];
    if (slide.constraints) delete slide.constraints[id];
  }
  const copied = transferObjects(
    structuredClone(definition.source),
    slide,
    {
      type: 'elements.transfer',
      slideId: slide.id,
      sourceSlideId: definition.source.id,
      targets: [source.root],
      mode: 'copy',
      offset: { x: 0, y: 0 },
      rectangles: definition.rectangles,
      computedStyles: definition.computedStyles,
    },
    { objects: instance.objects, domIds, metadata },
  );
  const refreshed = slide.components!.find((item) => item.root === copied.objects[source.root])!;
  refreshed.instance = { ...instance, objects: copied.objects };
  slide.components!.sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
  // Keep the authored instance's position, size, layer order and containing layout.
  const updated = parse(slide.html),
    replacement = findElement(updated, refreshed.root);
  const parentId = 'tagName' in parent ? attr(parent, NODE_ID) : undefined;
  const destination = parentId
    ? findElement(updated, parentId)
    : elements(updated).find((item) => item.tagName === 'body')!;
  removeElement(replacement);
  replacement.parentNode = destination;
  destination.childNodes.splice(index, 0, replacement);
  patchStyle(replacement, placement);
  slide.html = serialize(updated);
  if (rootTransform) slide.transforms[refreshed.root] = rootTransform;
  overrides(slide, refreshed);
  return refreshed;
}
export function applyLibraryCommand(doc: DeckDocument, cmd: Command): boolean {
  if (cmd.type === 'component.checkout') {
    const definition = libraryDefinition(doc, cmd.definitionId),
      source = sourceComponent(definition);
    invariant(!doc.slides.some((item) => item.id === cmd.newId), 'DUPLICATE_SLIDE', 'Slide exists');
    invariant(
      !doc.slides.some((item) =>
        item.components?.some((component) => !component.instance && component.root === source.root),
      ),
      'COMPONENT_SOURCE_EXISTS',
      'Open the existing source page to edit this definition',
    );
    const page = slideSchema.parse({
      id: cmd.newId,
      sourcePath: `components/${cmd.newId}.html`,
      name: `组件 · ${definition.name}`,
      hidden: true,
      html: normalizeHtml('<main id="stage"></main>'),
    });
    const objectIds = Object.fromEntries(
      elements(parse(definition.source.html))
        .map((item) => attr(item, NODE_ID))
        .filter((id): id is string => !!id)
        .map((id) => [id, id]),
    );
    const metadata = Object.fromEntries(
      (definition.source.components ?? []).map((item) => [item.id, item.id]),
    );
    transferObjects(
      structuredClone(definition.source),
      page,
      {
        type: 'elements.transfer',
        slideId: page.id,
        sourceSlideId: definition.source.id,
        targets: [source.root],
        mode: 'copy',
        offset: { x: 0, y: 0 },
        rectangles: definition.rectangles,
        computedStyles: definition.computedStyles,
      },
      { objects: objectIds, metadata },
    );
    doc.slides.push(page);
    return true;
  }

  if (cmd.type === 'component.library-remove') {
    invariant(
      !doc.slides.some((slide) =>
        slide.components?.some((item) => item.instance?.definitionId === cmd.definitionId),
      ),
      'COMPONENT_LIBRARY_IN_USE',
      'Detach instances before removing their shared definition',
    );
    doc.componentLibrary = doc.componentLibrary?.filter((item) => item.id !== cmd.definitionId);
    return true;
  }
  if (
    ![
      'component.publish',
      'component.instantiate',
      'component.override',
      'component.unlink',
    ].includes(cmd.type)
  )
    return false;
  invariant('slideId' in cmd, 'SLIDE_NOT_FOUND', 'A slide is required');
  const slide = doc.slides.find((item) => item.id === cmd.slideId)!;
  invariant(slide, 'SLIDE_NOT_FOUND', 'Slide does not exist');
  if (cmd.type === 'component.publish') {
    const component = slide.components?.find((item) => item.id === cmd.id);
    invariant(component, 'COMPONENT_NOT_FOUND', 'Select a component to publish');
    invariant(
      !component.instance,
      'COMPONENT_LIBRARY_SOURCE',
      'Detach this instance before publishing it as a source',
    );
    const previous = doc.componentLibrary?.find((item) => item.id === cmd.definitionId);
    invariant(
      !previous || sourceComponent(previous).root === component.root,
      'COMPONENT_LIBRARY_SOURCE',
      'Update this shared definition from its original component',
    );
    const original = structuredClone(slide);
    for (const item of original.components ?? []) delete item.instance;
    const source = slideSchema.parse({
      id: slide.id,
      name: cmd.name,
      sourcePath: slide.sourcePath,
      html: normalizeHtml('<main id="stage"></main>'),
    });
    const objectIds = Object.fromEntries(
      elements(findElement(parse(slide.html), component.root))
        .map((item) => attr(item, NODE_ID))
        .filter((id): id is string => !!id)
        .map((id) => [id, id]),
    );
    const metadata = Object.fromEntries(
      (original.components ?? []).map((item) => [item.id, item.id]),
    );
    transferObjects(
      original,
      source,
      {
        type: 'elements.transfer',
        slideId: source.id,
        sourceSlideId: original.id,
        targets: [component.root],
        mode: 'copy',
        offset: { x: 0, y: 0 },
        rectangles: cmd.rectangles,
        computedStyles: cmd.computedStyles,
      },
      { objects: objectIds, metadata },
    );
    const definition: Definition = {
      id: cmd.definitionId,
      name: cmd.name,
      source,
      componentId: component.id,
      rectangles: cmd.rectangles,
      computedStyles: {},
    };
    // Run the established clipboard adapter now so unsupported source families cannot enter a library.
    const probe = structuredClone(slide);
    instantiateComponent(doc, probe, definition, { x: 0, y: 0 });
    doc.componentLibrary = [
      ...(doc.componentLibrary ?? []).filter((item) => item.id !== definition.id),
      definition,
    ];
    for (const target of doc.slides)
      for (const instance of [...(target.components ?? [])])
        if (instance.instance?.definitionId === definition.id)
          refreshInstance(doc, target, instance);
  } else if (cmd.type === 'component.instantiate')
    instantiateComponent(doc, slide, libraryDefinition(doc, cmd.definitionId), cmd.offset);
  else if (cmd.type === 'component.override' || cmd.type === 'component.unlink') {
    const component = slide.components?.find((item) => item.id === cmd.id);
    invariant(component?.instance, 'COMPONENT_INSTANCE_NOT_FOUND', 'Select a linked instance');
    assertUnlocked(slide, component.root);
    if (cmd.type === 'component.unlink') delete component.instance;
    else {
      const source = Object.entries(component.instance.objects).find(
        ([, id]) => id === cmd.target,
      )?.[0];
      invariant(source, 'INVALID_COMPONENT', 'Override target is outside the instance');
      const patches = cmd.state
        ? (component.instance.stateOverrides[cmd.state] ??= {})
        : component.instance.overrides;
      if (cmd.patch === null) {
        delete patches[source];
        if (cmd.state && !Object.keys(patches).length)
          delete component.instance.stateOverrides[cmd.state];
        if (!cmd.state) delete component.instance.transforms[source];
      } else patches[source] = cmd.patch;
      refreshInstance(doc, slide, component);
    }
  }
  return true;
}
export function validateLibrary(doc: DeckDocument) {
  const library = doc.componentLibrary ?? [];
  invariant(
    new Set(library.map((item) => item.id)).size === library.length,
    'INVALID_COMPONENT_LIBRARY',
    'Shared component IDs must be unique',
  );
  for (const definition of library) sourceComponent(definition);
  for (const slide of doc.slides)
    for (const component of slide.components ?? [])
      if (component.instance) {
        const definition = libraryDefinition(doc, component.instance.definitionId),
          original = sourceComponent(definition),
          root = findElement(parse(slide.html), component.root);
        const inside = new Set(elements(root).map((item) => attr(item, NODE_ID)));
        const sourceIds = new Set(
          elements(findElement(parse(definition.source.html), original.root)).map((item) =>
            attr(item, NODE_ID),
          ),
        );
        invariant(
          Object.keys(component.instance.objects).every((id) => sourceIds.has(id)),
          'INVALID_COMPONENT_INSTANCE',
          'Instance map contains an unknown source object',
        );
        for (const id of [
          ...Object.keys(component.instance.overrides),
          ...Object.keys(component.instance.layouts),
          ...Object.keys(component.instance.transforms),
          ...Object.values(component.instance.stateOverrides).flatMap((patches) =>
            Object.keys(patches),
          ),
        ])
          invariant(
            component.instance.objects[id],
            'INVALID_COMPONENT_INSTANCE',
            'Override references an unmapped object',
          );
        invariant(
          Object.keys(component.instance.stateOverrides).every((id) =>
            component.states.some((state) => state.id === id),
          ),
          'INVALID_COMPONENT_INSTANCE',
          'Override references an unavailable state',
        );
        invariant(
          component.instance.objects[original.root] === component.root &&
            Object.values(component.instance.objects).every((id) => inside.has(id)) &&
            new Set(Object.values(component.instance.objects)).size ===
              Object.keys(component.instance.objects).length,
          'INVALID_COMPONENT_INSTANCE',
          'Instance mappings must identify distinct objects inside its root',
        );
      }
}

export function recordInstancePatch(
  slide: Slide,
  target: string,
  patch: Extract<Command, { type: 'element.patch' }>['patch'],
) {
  for (const component of slide.components ?? [])
    if (component.instance) {
      const source = Object.entries(component.instance.objects).find(
        ([, id]) => id === target,
      )?.[0];
      if (!source) continue;
      invariant(
        patch.richText === undefined && patch.attributes === undefined,
        'COMPONENT_INSTANCE_EDIT',
        'Detach the instance before restructuring content or attributes',
      );
      const existing = component.instance.overrides[source] ?? {};
      component.instance.overrides[source] = {
        ...existing,
        ...(patch.text !== undefined ? { text: patch.text } : {}),
        ...(patch.style ? { style: { ...existing.style, ...patch.style } } : {}),
      };
    }
}

export function recordInstanceLayout(slide: Slide, target: string) {
  for (const component of slide.components ?? [])
    if (component.instance) {
      const instance = component.instance,
        reverse = Object.fromEntries(
          Object.entries(instance.objects).map(([source, local]) => [local, source]),
        );
      if (reverse[target]) {
        const layout = slide.constraints![target];
        instance.layouts[reverse[target]] = {
          ...structuredClone(layout),
          children: Object.fromEntries(
            Object.entries(layout.children).map(([id, spec]) => [reverse[id], spec]),
          ),
        };
      }
    }
}

export function recordInstanceTransform(slide: Slide, target: string) {
  for (const component of slide.components ?? [])
    if (component.instance && component.root !== target) {
      const source = Object.entries(component.instance.objects).find(
        ([, id]) => id === target,
      )?.[0];
      if (!source) continue;
      const node = findElement(parse(slide.html), target),
        style = Object.fromEntries(
          [...parseStyle(attr(node, 'style') ?? '')].filter(([key]) =>
            ['transform', 'translate', 'rotate', 'scale', 'width', 'height'].includes(key),
          ),
        );
      recordInstancePatch(slide, target, { style });
      component.instance.transforms[source] = structuredClone(slide.transforms[target]);
    }
}
