import { cleanChartReferences, mergeChartEdit, newChart } from './chart-authoring.js';
import { applyVectorCommand } from './vector-commands.js';
import { validateCanvasInstances, correlationHash } from './canvas-instances.js';
import { applyLayoutAuthoring } from './layout-authoring.js';
import { applyStepCommand, ensureStepPlan } from './teaching-steps.js';
import {
  applyLibraryCommand,
  validateLibrary,
  recordInstancePatch,
  recordInstanceLayout,
  recordInstanceTransform,
} from './component-library.js';
import { applyContainerLayout } from './container-layout-commands.js';
import { inspectSourceScenes, validateSceneValues } from './source-scenes.js';
import { chartFactory, chartInteractionFactory, inspectChartSources } from './chart-sources.js';
import { interactionMembers, inspectChartComponents } from './chart-components.js';
import { validateComponents } from './component-validation.js';
import { componentTargets } from './components.js';
import { connectorSvg } from './connectors.js';
import { posix } from 'node:path';
import { rebaseTheme } from './urls.js';
import { parseCss, type Stylesheets } from './layout-css.js';
import { type Command, type DeckDocument, type Slide, documentSchema, invariant } from './model.js';
import {
  assertStatic,
  materializeLayout,
  layoutPlaceholders,
  layoutImageSlots,
} from './layouts.js';
import { arrangeCommands } from './arrange.js';
import { transferObjects } from './clipboard.js';
import { orderSvgObjects } from './svg-order.js';
import { editTable } from './tables.js';
import { mediaSettingsSchema } from './media.js';
import { chartMarkup, chartDataSchema } from './charts.js';
import {
  type Element,
  parse,
  serialize,
  elements,
  editableElements,
  attr,
  setAttr,
  NODE_ID,
  uid,
  findElement,
  normalizeHtml,
  setInner,
  setText,
  patchStyle,
  appendHtml,
  removeElement,
  serializeOuter,
} from './html.js';

export function validateDocument(input: unknown): DeckDocument {
  const doc = documentSchema.parse(input);
  validateLibrary(doc);
  for (const definition of doc.componentLibrary ?? [])
    validateDocument({ ...doc, componentLibrary: undefined, slides: [definition.source] });
  invariant(
    new Set(doc.layouts.map((l) => l.id)).size === doc.layouts.length,
    'DUPLICATE_LAYOUT',
    'Layout IDs must be unique',
  );
  for (const layout of doc.layouts) {
    assertStatic(layout.html);
    parseCss(layout.css);
    layoutPlaceholders(layout.html);
    layoutImageSlots(layout.html);
  }
  invariant(
    new Set(doc.slides.map((s) => s.id)).size === doc.slides.length,
    'DUPLICATE_SLIDE',
    'Slide IDs must be unique',
  );
  invariant(
    new Set(doc.slides.map((s) => s.sourcePath)).size === doc.slides.length,
    'DUPLICATE_PATH',
    'Slide paths must be unique',
  );
  const layoutSources = doc.slides.flatMap((page) =>
    page.layoutSourceId ? [page.layoutSourceId] : [],
  );
  invariant(
    new Set(layoutSources).size === layoutSources.length,
    'LAYOUT_SOURCE_EXISTS',
    'A master can have only one editing page',
  );
  for (const s of doc.slides) {
    for (const [id, images] of Object.entries(s.layoutImages ?? {})) {
      const layout = doc.layouts.find((item) => item.id === id);
      invariant(layout, 'LAYOUT_NOT_FOUND', 'Image values reference a missing master');
      const keys = new Set(layoutImageSlots(layout.html).map((slot) => slot.id));
      for (const [key, image] of Object.entries(images)) {
        invariant(
          keys.has(key),
          'PLACEHOLDER_IN_USE',
          'A shared update removed an image slot with page content',
        );
        invariant(
          doc.assets[image.path]?.mime.startsWith('image/'),
          'MISSING_RESOURCE',
          'A page image must reference an available image asset',
        );
      }
    }

    for (const [id, values] of Object.entries(s.layoutValues ?? {})) {
      const layout = doc.layouts.find((item) => item.id === id);
      invariant(layout, 'LAYOUT_NOT_FOUND', 'Page content references a missing master');
      const keys = new Set(layoutPlaceholders(layout.html).map((field) => field.id));
      invariant(
        Object.keys(values).every((key) => keys.has(key)),
        'PLACEHOLDER_IN_USE',
        'A shared update removed a placeholder with page content; reset that value first',
      );
    }

    invariant(
      !s.layoutSourceId ||
        (doc.layouts.some((layout) => layout.id === s.layoutSourceId) && !s.layoutId),
      'INVALID_LAYOUT_SOURCE',
      'A layout editing page must reference an existing master and cannot inherit a layout',
    );
    invariant(
      !s.layoutId || doc.layouts.some((l) => l.id === s.layoutId),
      'LAYOUT_NOT_FOUND',
      'Slide references a missing layout',
    );
    invariant(!doc.assets[s.sourcePath], 'PATH_COLLISION', 'A slide and asset share a path');
    const root = parse(s.html),
      all = editableElements(root),
      ids = new Set(all.map((e) => attr(e, NODE_ID)));
    invariant(
      ids.size === all.length && !ids.has(undefined),
      'INVALID_OBJECT_IDS',
      'All editable source elements need unique stable identifiers',
    );
    for (const list of [s.animations, s.bindings, s.groups, s.connectors])
      invariant(
        new Set(list.map((x) => x.id)).size === list.length,
        'DUPLICATE_ID',
        'Metadata IDs must be unique',
      );
    for(const a of s.animations)if(a.effect==='chart-state')invariant(!!a.chartStateId&&s.nativeCharts[a.target]?.authoring?.states.some(state=>state.id===a.chartStateId),'INVALID_CHART_STATE','Animation references a missing chart state');
    const targets = [
      ...s.animations.flatMap((a) => [a.target, ...(a.triggerTarget ? [a.triggerTarget] : [])]),
      ...s.bindings.map((b) => b.target),
      ...s.groups.flatMap((g) => g.members),
      ...s.connectors.flatMap((c) => [
        c.id,
        ...[c.start, c.end].flatMap((endpoint) => (endpoint.target ? [endpoint.target] : [])),
      ]),
      ...s.locked,
      ...Object.keys(s.transforms),
      ...Object.keys(s.nativeCharts),
    ];
    for (const id of targets)
      invariant(ids.has(id), 'DANGLING_OBJECT', `Metadata points to missing object ${id}`);
    for (const el of all) {
      const data = attr(el, 'data-notale-media');
      if (data) {
        let settings;
        try {
          settings = JSON.parse(data);
        } catch {
          invariant(false, 'INVALID_MEDIA', 'Media settings must be JSON');
        }
        mediaSettingsSchema.parse(settings);
      }
    }
    invariant(
      all
        .filter((el) => attr(el, 'data-notale-connector') !== undefined)
        .every((el) => s.connectors.some((c) => c.id === attr(el, NODE_ID))),
      'INVALID_CONNECTOR',
      'Owned connector source requires connector metadata',
    );
    for (const c of s.connectors) {
      const graphic = findElement(root, c.id);
      invariant(
        graphic.tagName === 'svg' &&
          attr(graphic, 'data-notale-connector') !== undefined &&
          ['data-connector-line', 'data-connector-arrows'].every((name) =>
            graphic.childNodes.some(
              (n) => 'tagName' in n && n.tagName === 'path' && attr(n, name) !== undefined,
            ),
          ),
        'INVALID_CONNECTOR',
        'Connector requires its owned SVG source object',
      );
      for (const endpoint of [c.start, c.end]) {
        if (!endpoint.target) continue;
        const target = findElement(root, endpoint.target);
        invariant(
          attr(target, 'data-notale-connector') === undefined &&
            !elements(target).includes(findElement(root, c.id)),
          'INVALID_CONNECTOR',
          'Connector endpoints must be independent content objects',
        );
      }
    }
    const componentRoots: Element[] = [];
    const knownChartHosts = Object.values(s.nativeCharts).some((chart) => chart.interaction)
      ? new Set([...Object.keys(s.nativeCharts), ...inspectChartSources(s).keys()])
      : new Set<string>();
    for (const id of Object.keys(s.nativeCharts)) {
      const host = findElement(root, id);
      invariant(
        ['div', 'canvas'].includes(host.tagName),
        'INVALID_NATIVE_CHART',
        'Native charts require a source div or canvas host',
      );
      const source = s.nativeCharts[id].source;
      const interaction = s.nativeCharts[id].interaction;
      if (interaction) {
        invariant(
          source && chartInteractionFactory(source),
          'INVALID_COMPONENT',
          'Component source is unavailable',
        );
        const members = [id, ...interactionMembers(interaction)],
          container = findElement(root, interaction.root),
          inside = new Set(elements(container).map((node) => attr(node, NODE_ID)));
        invariant(
          new Set(members).size === members.length && members.every((member) => inside.has(member)),
          'INVALID_COMPONENT',
          'Component members must be distinct and contained in their root',
        );
        invariant(
          !componentRoots.some(
            (other) => elements(other).includes(container) || elements(container).includes(other),
          ),
          'INVALID_COMPONENT',
          'Independent component roots cannot overlap',
        );
        componentRoots.push(container);
        invariant(
          [...knownChartHosts].every((other) => other === id || !inside.has(other)),
          'INVALID_COMPONENT',
          'An independent component cannot contain another native chart',
        );
        const contentMembers = members.filter((member) => member !== interaction.root);
        invariant(
          contentMembers.every(
            (member) =>
              !elements(findElement(root, member)).some((node) => {
                const child = attr(node, NODE_ID);
                return child !== member && contentMembers.includes(child ?? '');
              }),
          ),
          'INVALID_COMPONENT',
          'Chart, controls and metrics must not contain one another',
        );
        for (const [value, control] of Object.entries(interaction.controls)) {
          const button = findElement(root, control);
          invariant(
            button.tagName === 'button' && attr(button, 'data-lr') === value,
            'INVALID_COMPONENT',
            'Component control does not match its value',
          );
        }
      }
      if (source) {
        invariant(
          chartFactory(source),
          'INVALID_CHART_SOURCE',
          'Native chart source is not a reviewed independent factory',
        );
        invariant(
          doc.assets[source.library],
          'MISSING_ASSET',
          'Native chart library is unavailable',
        );
      }
    }
    validateCanvasInstances(s);
    if (s.scenes?.length) {
      const available = inspectSourceScenes(s);
      invariant(
        new Set(s.scenes.map((scene) => scene.id)).size === s.scenes.length,
        'DUPLICATE_ID',
        'Scene IDs must be unique',
      );
      for (const settings of s.scenes) {
        const scene = available.find((scene) => scene.id === settings.id);
        invariant(scene, 'SCENE_NOT_FOUND', 'Scene source changed or is unavailable');
        validateSceneValues(scene, settings.values);
        if (settings.checkpoint)
          invariant(
            scene.checkpoint === settings.checkpoint.adapter,
            'INVALID_SCENE_CHECKPOINT',
            'Checkpoint adapter does not match the source scene',
          );
      }
    }
    for (const b of s.bindings) {
      const el = findElement(root, b.target);
      invariant(
        ['input', 'select', 'textarea'].includes(el.tagName),
        'INVALID_BINDING',
        'Defaults bind to an existing form control',
      );
    }
    if (s.steps)
      invariant(
        new Set(s.steps.map((step) => step.id)).size === s.steps.length,
        'DUPLICATE_STEP',
        'Teaching step IDs must be unique',
      );
    validateComponents(s);
    for (const [id, layout] of Object.entries(s.constraints ?? {})) {
      const container = findElement(root, id);
      for (const child of Object.keys(layout.children))
        invariant(
          findElement(root, child).parentNode === container,
          'INVALID_LAYOUT',
          'Layout child must remain in its container',
        );
    }
    for (const g of s.groups)
      invariant(
        new Set(g.members).size === g.members.length,
        'INVALID_GROUP',
        'Group has repeated members',
      );
  }
  return doc;
}
function slideOf(doc: DeckDocument, id: string) {
  const s = doc.slides.find((s) => s.id === id);
  invariant(s, 'SLIDE_NOT_FOUND', `Slide ${id} not found`, 404);
  return s;
}
function assertContentParent(parent: Element, slide: Slide) {
  for (
    let node: Element | undefined = parent;
    node;
    node = node.parentNode && 'tagName' in node.parentNode ? node.parentNode : undefined
  ) {
    invariant(
      attr(node, 'data-notale-connector') === undefined,
      'DERIVED_GEOMETRY',
      'Connector paths are owned geometry; edit their endpoints and line settings',
    );
    invariant(
      !slide.locked.includes(attr(node, NODE_ID) ?? ''),
      'LOCKED',
      'Destination container is locked',
    );
  }
}
function cleanMetadata(s: Slide, cascadedConnectors: Set<string>) {
  const root = parse(s.html),
    existing = new Set(editableElements(root).map((e) => attr(e, NODE_ID)));
  let removedSource = false;
  s.connectors = s.connectors.filter((c) => {
    if (
      existing.has(c.id) &&
      [c.start, c.end].every((endpoint) => !endpoint.target || existing.has(endpoint.target))
    )
      return true;
    invariant(
      !s.locked.includes(c.id),
      'LOCKED',
      'Deleting this object would remove a locked connector',
    );
    if (existing.has(c.id)) {
      const graphic = findElement(root, c.id);
      for (
        let node: typeof graphic | undefined = graphic;
        node;
        node = node.parentNode && 'tagName' in node.parentNode ? node.parentNode : undefined
      )
        invariant(
          !s.locked.includes(attr(node, NODE_ID) ?? ''),
          'LOCKED',
          'Removing this connection would modify a locked container',
        );
      removeElement(graphic);
      cascadedConnectors.add(`${s.id}/${c.id}`);
      existing.delete(c.id);
      removedSource = true;
    }
    return false;
  });
  if (removedSource) s.html = serialize(root);
  const ids = existing;
  s.animations = s.animations.filter(
    (a) => ids.has(a.target) && (!a.triggerTarget || ids.has(a.triggerTarget)),
  );
  s.bindings = s.bindings.filter((b) => ids.has(b.target));
  s.nativeCharts = Object.fromEntries(Object.entries(s.nativeCharts).filter(([id]) => ids.has(id)));
  const previousCanvasRoots = new Set(Object.keys(s.canvasInstances ?? {}));
  if (s.canvasInstances)
    s.canvasInstances = Object.fromEntries(
      Object.entries(s.canvasInstances).filter(([root]) => ids.has(root)),
    );
  if (s.scenes)
    s.scenes = s.scenes.filter(
      (scene) =>
        !(previousCanvasRoots.has(scene.id) && !ids.has(scene.id)) &&
        !(
          scene.id.includes(correlationHash) &&
          !elements(parse(s.html)).some((node) => attr(node, 'id') === 'matrix-canvas')
        ),
    );
  if (s.components)
    s.components = s.components
      .filter((component) => ids.has(component.root))
      .map((component) => ({
        ...component,
        events: component.events.filter((event) => ids.has(event.target)),
        states: component.states.map((state) => ({
          ...state,
          patches: Object.fromEntries(
            Object.entries(state.patches).filter(([target]) => ids.has(target)),
          ),
        })),
      }));
  if (s.constraints)
    s.constraints = Object.fromEntries(
      Object.entries(s.constraints)
        .filter(([id]) => ids.has(id))
        .map(([id, layout]) => [
          id,
          {
            ...layout,
            children: Object.fromEntries(
              Object.entries(layout.children).filter(([child]) => ids.has(child)),
            ),
          },
        ]),
    );
  s.locked = s.locked.filter((id) => ids.has(id));
  s.groups = s.groups
    .map((g) => ({ ...g, members: g.members.filter((id) => ids.has(id)) }))
    .filter((g) => g.members.length > 1);
  s.transforms = Object.fromEntries(Object.entries(s.transforms).filter(([id]) => ids.has(id)));
}
export function applyCommands(
  input: DeckDocument,
  commands: Command[],
  options: { stylesheets?: Stylesheets } = {},
): DeckDocument {
  const doc = documentSchema.parse(input);
  const queue = [...commands];
  const cascadedConnectors = new Set<string>();
  const forgetPageCascades = (id: string) => {
    for (const key of cascadedConnectors)
      if (key.startsWith(`${id}/`)) cascadedConnectors.delete(key);
  };
  for (let index = 0; index < queue.length; index++) {
    const cmd = queue[index];
    if (cmd.type === 'layout.checkout' || cmd.type === 'layout.publish') {
      applyLayoutAuthoring(doc, cmd, options.stylesheets);
      continue;
    }
    if (
      cmd.type === 'component.checkout' ||
      cmd.type === 'component.publish' ||
      cmd.type === 'component.instantiate' ||
      cmd.type === 'component.override' ||
      cmd.type === 'component.unlink' ||
      cmd.type === 'component.library-remove'
    ) {
      applyLibraryCommand(doc, cmd);
      continue;
    }
    if (cmd.type === 'deck.update') {
      const { type, ...rest } = cmd;
      Object.assign(doc, rest);
      continue;
    }
    if (cmd.type === 'layout.set') {
      const at = doc.layouts.findIndex((l) => l.id === cmd.layout.id),
        layout = { ...cmd.layout, html: normalizeHtml(cmd.layout.html) };
      assertStatic(layout.html);
      if (at < 0) doc.layouts.push(layout);
      else doc.layouts[at] = layout;
      continue;
    }
    if (cmd.type === 'layout.remove') {
      invariant(
        !doc.slides.some(
          (s) =>
            s.layoutId === cmd.id ||
            s.layoutSourceId === cmd.id ||
            s.layoutValues?.[cmd.id] ||
            s.layoutImages?.[cmd.id],
        ),
        'LAYOUT_IN_USE',
        'Detach or change the pages using this layout first',
      );
      doc.layouts = doc.layouts.filter((l) => l.id !== cmd.id);
      continue;
    }
    if (cmd.type === 'comment.set') {
      invariant(doc.slides.some((s) => s.id === cmd.comment.slideId), 'SLIDE_NOT_FOUND', 'Comment page missing');
      const at = doc.comments.findIndex((c) => c.id === cmd.comment.id);
      if (at < 0) doc.comments.push(cmd.comment);
      else doc.comments[at] = cmd.comment;
      continue;
    }
    if (cmd.type === 'comment.remove') {
      doc.comments = doc.comments.filter((c) => c.id !== cmd.id);
      continue;
    }
    if (cmd.type === 'asset.put') {
      doc.assets[cmd.path] = cmd.asset;
      continue;
    }
    if (cmd.type === 'asset.remove') {
      delete doc.assets[cmd.path];
      continue;
    }
    if (cmd.type === 'slide.insert') {
      forgetPageCascades(cmd.slide.id);
      invariant(!doc.slides.some((s) => s.id === cmd.slide.id), 'DUPLICATE_SLIDE', 'Slide exists');
      const index = cmd.after === null ? -1 : doc.slides.findIndex((s) => s.id === cmd.after);
      invariant(cmd.after === null || index >= 0, 'SLIDE_NOT_FOUND', 'Insertion anchor missing');
      doc.slides.splice(index + 1, 0, { ...cmd.slide, html: normalizeHtml(cmd.slide.html) });
      continue;
    }
    const s = slideOf(doc, cmd.slideId);
    if(cmd.type==='svg.patch'||cmd.type==='svg.structure'||cmd.type==='svg.import'){
      applyVectorCommand(s,cmd);cleanMetadata(s,cascadedConnectors);continue;
    }
    if (cmd.type === 'layout.image') {
      const layout = doc.layouts.find((item) => item.id === cmd.id);
      invariant(layout, 'LAYOUT_NOT_FOUND', 'Shared layout does not exist');
      invariant(
        layoutImageSlots(layout.html).some((slot) => slot.id === cmd.key),
        'INVALID_PLACEHOLDER',
        'Unknown image slot',
      );
      const images = new Map(Object.entries(s.layoutImages?.[cmd.id] ?? {}));
      if (cmd.image === null) images.delete(cmd.key);
      else images.set(cmd.key, cmd.image);
      s.layoutImages = { ...s.layoutImages, [cmd.id]: Object.fromEntries(images) };
      if (!images.size) delete s.layoutImages[cmd.id];
      if (!Object.keys(s.layoutImages).length) delete s.layoutImages;
      continue;
    }
    if (cmd.type === 'layout.values') {
      const layout = doc.layouts.find((item) => item.id === cmd.id);
      invariant(layout, 'LAYOUT_NOT_FOUND', 'Shared layout does not exist');
      const keys = new Set(layoutPlaceholders(layout.html).map((field) => field.id));
      invariant(
        Object.keys(cmd.values).every((key) => keys.has(key)),
        'INVALID_PLACEHOLDER',
        'Unknown placeholder',
      );
      const values = new Map(Object.entries(s.layoutValues?.[cmd.id] ?? {}));
      for (const [key, value] of Object.entries(cmd.values)) {
        if (value === null) values.delete(key);
        else values.set(key, value);
      }
      s.layoutValues = { ...s.layoutValues, [cmd.id]: Object.fromEntries(values) };
      if (!values.size) delete s.layoutValues[cmd.id];
      if (!Object.keys(s.layoutValues).length) delete s.layoutValues;
      continue;
    }

    if (cmd.type === 'layout.detach') {
      const layout = doc.layouts.find((l) => l.id === s.layoutId);
      s.html = materializeLayout(doc, s, true, options.stylesheets);
      s.theme = {
        ...rebaseTheme(layout?.theme ?? {}, layout?.sourcePath ?? 'layout.html', s.sourcePath),
        ...s.theme,
      };
      if (s.layoutId && s.layoutValues) {
        delete s.layoutValues[s.layoutId];
        if (!Object.keys(s.layoutValues).length) delete s.layoutValues;
      }
      if (s.layoutId && s.layoutImages) {
        delete s.layoutImages[s.layoutId];
        if (!Object.keys(s.layoutImages).length) delete s.layoutImages;
      }
      s.layoutId = null;
      continue;
    }
    if (cmd.type === 'elements.arrange') {
      queue.splice(index + 1, 0, ...arrangeCommands(doc, s, cmd));
      continue;
    }
    if (cmd.type === 'connector.set') {
      const root = parse(s.html),
        c = cmd.connector;
      const old = s.connectors.find((connector) => connector.id === c.id);
      cascadedConnectors.delete(`${s.id}/${c.id}`);
      invariant(!s.locked.includes(c.id), 'LOCKED', 'Connector is locked');
      if (old) {
        const el = findElement(root, c.id);
        for (
          let parent: typeof el | undefined = el;
          parent;
          parent =
            parent.parentNode && 'tagName' in parent.parentNode ? parent.parentNode : undefined
        )
          invariant(
            !s.locked.includes(attr(parent, NODE_ID) ?? ''),
            'LOCKED',
            'Connector container is locked',
          );

        const replacement = parse(connectorSvg(c, doc.width, doc.height));
        const graphic = elements(replacement).find((e) => e.tagName === 'svg')!;
        el.childNodes = graphic.childNodes;
        for (const child of el.childNodes) child.parentNode = el;
        setAttr(el, 'width', String(doc.width));
        setAttr(el, 'height', String(doc.height));
        setAttr(el, 'viewBox', `0 0 ${doc.width} ${doc.height}`);
      } else {
        invariant(
          !editableElements(root).some((e) => attr(e, NODE_ID) === c.id),
          'DUPLICATE_ID',
          'Connector ID is already in use',
        );
        const parent =
          elements(root).find((e) => attr(e, 'id') === 'stage') ??
          elements(root).find((e) => e.tagName === 'body')!;
        invariant(!s.locked.includes(attr(parent, NODE_ID) ?? ''), 'LOCKED', 'Parent is locked');
        appendHtml(parent, connectorSvg(c, doc.width, doc.height), undefined, false);
      }
      s.connectors = [...s.connectors.filter((connector) => connector.id !== c.id), c];
      s.html = normalizeHtml(serialize(root));
      continue;
    }
    if (
      cmd.type === 'step.initialize' ||
      cmd.type === 'step.insert' ||
      cmd.type === 'step.update' ||
      cmd.type === 'step.duplicate' ||
      cmd.type === 'step.remove' ||
      cmd.type === 'step.move'
    ) {
      applyStepCommand(s, cmd);
      continue;
    }
    if (cmd.type === 'container.layout') {
      applyContainerLayout(s, cmd.target, cmd.layout);
      recordInstanceLayout(s, cmd.target);
      continue;
    }
    if (cmd.type === 'elements.order') {
      orderSvgObjects(s, cmd);
      continue;
    }
    if (
      cmd.type === 'component.set' ||
      cmd.type === 'component.remove' ||
      cmd.type === 'component.state'
    ) {
      const id = cmd.type === 'component.set' ? cmd.component.id : cmd.id;
      const existing = s.components?.find((component) => component.id === id);
      invariant(
        cmd.type === 'component.set' || existing,
        'COMPONENT_NOT_FOUND',
        'Component does not exist',
      );
      const root = parse(s.html);
      const affected = new Set([
        ...(existing ? componentTargets(existing) : []),
        ...(cmd.type === 'component.set' ? componentTargets(cmd.component) : []),
      ]);
      for (const target of affected) {
        let node: Element | undefined = findElement(root, target);
        invariant(
          !elements(node).some((child) => s.locked.includes(attr(child, NODE_ID) ?? '')),
          'LOCKED',
          'Component contains a locked object',
        );
        while (node) {
          invariant(
            !s.locked.includes(attr(node, NODE_ID) ?? ''),
            'LOCKED',
            'Component object or container is locked',
          );
          node = node.parentNode && 'tagName' in node.parentNode ? node.parentNode : undefined;
        }
      }
      if (cmd.type === 'component.set' && existing?.instance)
        invariant(
          JSON.stringify(existing) === JSON.stringify(cmd.component),
          'COMPONENT_INSTANCE_EDIT',
          'Use instance overrides or detach before changing shared behavior',
        );
      if (cmd.type === 'component.set')
        s.components = [
          ...(s.components ?? []).filter((component) => component.id !== id),
          cmd.component,
        ];
      else if (cmd.type === 'component.remove')
        s.components = s.components!.filter((component) => component.id !== id);
      else {
        invariant(
          existing!.states.some((state) => state.id === cmd.state),
          'INVALID_COMPONENT',
          'State does not exist',
        );
        existing!.initial = cmd.state;
        if (existing!.instance) existing!.instance.initial = cmd.state;
        existing!.steps = existing!.steps.map((step) =>
          step.step === 0 ? { ...step, state: cmd.state } : step,
        );
      }
      continue;
    }
    if (cmd.type === 'elements.transfer') {
      const current = slideOf(doc, cmd.sourceSlideId),
        source =
          cmd.mode === 'copy' && cmd.sourceSnapshot ? structuredClone(cmd.sourceSnapshot) : current;
      invariant(
        !cmd.sourceSnapshot || cmd.sourceSnapshot.id === cmd.sourceSlideId,
        'INVALID_CLIPBOARD',
        'Clipboard source does not match',
      );
      if (cmd.mode === 'cut' && cmd.sourceSnapshot) {
        const original = parse(cmd.sourceSnapshot.html),
          live = parse(current.html),
          originalCharts = inspectChartSources(cmd.sourceSnapshot),
          liveCharts = inspectChartSources(current);
        for (const id of cmd.targets) {
          invariant(
            serializeOuter(findElement(original, id)) === serializeOuter(findElement(live, id)),
            'CLIPBOARD_CHANGED',
            'The cut selection changed; select it again before cutting',
          );
          for (const node of elements(findElement(original, id))) {
            const nodeId = attr(node, NODE_ID)!;
            invariant(
              JSON.stringify(
                (cmd.sourceSnapshot.components ?? []).filter(
                  (component) => component.root === nodeId,
                ),
              ) ===
                JSON.stringify(
                  (current.components ?? []).filter((component) => component.root === nodeId),
                ),
              'CLIPBOARD_CHANGED',
              'The cut component changed; capture it again',
            );
            invariant(
              JSON.stringify(cmd.sourceSnapshot.nativeCharts[nodeId]) ===
                JSON.stringify(current.nativeCharts[nodeId]),
              'CLIPBOARD_CHANGED',
              'The cut chart data or source changed; select it again before cutting',
            );
            invariant(
              JSON.stringify(originalCharts.get(nodeId)) === JSON.stringify(liveCharts.get(nodeId)),
              'CLIPBOARD_CHANGED',
              'The cut chart source changed; select it again before cutting',
            );
          }
        }
      }
      transferObjects(source, s, cmd);
      cleanMetadata(source, cascadedConnectors);
      if (source !== s) cleanMetadata(s, cascadedConnectors);
      continue;
    }
    if (cmd.type === 'slide.delete') {
      invariant(doc.slides.length > 1, 'LAST_SLIDE', 'Cannot remove the last slide');
      doc.slides = doc.slides.filter((x) => x !== s);
      // A deleted page takes its comments with it; they are page-anchored.
      doc.comments = doc.comments.filter((comment) => comment.slideId !== s.id);
      continue;
    }
    if (cmd.type === 'slide.move') {
      invariant(cmd.index < doc.slides.length, 'INVALID_INDEX', 'Slide index is out of range');
      doc.slides.splice(doc.slides.indexOf(s), 1);
      doc.slides.splice(cmd.index, 0, s);
      continue;
    }
    if (cmd.type === 'slide.duplicate') {
      forgetPageCascades(cmd.newId);
      invariant(!doc.slides.some((x) => x.id === cmd.newId), 'DUPLICATE_SLIDE', 'Slide exists');
      const copy = structuredClone(s);
      copy.id = cmd.newId;
      delete copy.layoutSourceId;
      copy.name += ' — copy';
      copy.sourcePath = s.sourcePath.replace(/[^/]+$/, `${cmd.newId}.html`);
      const root = parse(copy.html);
      for (const el of elements(root)) {
        const href = attr(el, 'href');
        if (!href || /^(#|[a-z][\w+.-]*:|\/)/i.test(href)) continue;
        const url = new URL(href, 'https://notale.invalid/' + s.sourcePath);
        if (decodeURIComponent(url.pathname.slice(1)) === s.sourcePath)
          setAttr(el, 'href', posix.basename(copy.sourcePath) + url.search + url.hash);
      }
      copy.html = serialize(root);
      doc.slides.splice(doc.slides.indexOf(s) + 1, 0, copy);
      continue;
    }
    if (cmd.type === 'slide.update') {
      Object.assign(s, cmd.patch);
      continue;
    }
    if (cmd.type === 'animation.set') {
      const at = s.animations.findIndex((a) => a.id === cmd.animation.id);
      if (at < 0) s.animations.push(cmd.animation);
      else s.animations[at] = cmd.animation;
      continue;
    }
    if (cmd.type === 'animation.remove') {
      s.animations = s.animations.filter((a) => a.id !== cmd.id);
      continue;
    }
    if (cmd.type === 'animation.reorder') {
      invariant(
        cmd.ids.length === s.animations.length &&
          new Set(cmd.ids).size === s.animations.length &&
          cmd.ids.every((id) => s.animations.some((a) => a.id === id)),
        'INVALID_ORDER',
        'Animation order must include every animation once',
      );
      s.animations = cmd.ids.map((id) => s.animations.find((a) => a.id === id)!);
      continue;
    }
    if (
      cmd.type === 'scene.set' ||
      cmd.type === 'scene.remove' ||
      cmd.type === 'scene.checkpoint'
    ) {
      const scene = inspectSourceScenes(s).find((scene) => scene.id === cmd.sceneId);
      invariant(scene, 'SCENE_NOT_FOUND', 'Scene source changed or is unavailable');
      const root = parse(s.html);
      for (const id of scene.targets) {
        const target = findElement(root, id);
        assertContentParent(target, s);
        invariant(
          !elements(target).some((el) => s.locked.includes(attr(el, NODE_ID) ?? '')),
          'LOCKED',
          'Scene would update a locked object',
        );
      }
      if (cmd.type === 'scene.checkpoint') {
        invariant(
          scene.checkpoint === cmd.checkpoint.adapter,
          'INVALID_SCENE_CHECKPOINT',
          'Checkpoint adapter does not match the source scene',
        );
        s.scenes = [
          ...(s.scenes ?? []).filter((entry) => entry.id !== scene.id),
          { id: scene.id, values: {}, checkpoint: cmd.checkpoint },
        ];
        s.bindings = s.bindings.filter((binding) => !scene.targets.includes(binding.target));
      } else if (cmd.type === 'scene.set') {
        validateSceneValues(scene, cmd.values);
        s.scenes = [
          ...(s.scenes ?? []).filter((entry) => entry.id !== scene.id),
          { id: scene.id, values: cmd.values },
        ];
        const owned = new Set(
          scene.parameters
            .filter((p) => p.control && Object.hasOwn(cmd.values, p.key))
            .map((p) => p.control!.target),
        );
        s.bindings = s.bindings.filter((binding) => !owned.has(binding.target));
      } else {
        s.scenes = s.scenes?.filter((entry) => entry.id !== scene.id);
        if (!s.scenes?.length) delete s.scenes;
      }
      continue;
    }
    if (cmd.type === 'binding.set') {
      if (s.scenes?.length) {
        for (const scene of inspectSourceScenes(s)) {
          const settings = s.scenes.find((entry) => entry.id === scene.id);
          if (settings?.checkpoint && scene.targets.includes(cmd.binding.target))
            delete settings.checkpoint;
          if (settings)
            for (const parameter of scene.parameters)
              if (parameter.control?.target === cmd.binding.target)
                delete settings.values[parameter.key];
        }
      }

      const at = s.bindings.findIndex((b) => b.id === cmd.binding.id);
      if (at < 0) s.bindings.push(cmd.binding);
      else s.bindings[at] = cmd.binding;
      continue;
    }
    if (cmd.type === 'binding.remove') {
      s.bindings = s.bindings.filter((b) => b.id !== cmd.id);
      continue;
    }
    if (cmd.type === 'group.set') {
      const root = parse(s.html),
        members = cmd.members.map((id) => findElement(root, id));
      invariant(
        !members.some((parent) =>
          members.some((child) => child !== parent && elements(parent).includes(child)),
        ),
        'NESTED_SELECTION',
        'A group cannot contain an object and its descendant',
      );
      s.groups = s.groups
        .filter((g) => g.id !== cmd.id)
        .map((g) => ({ ...g, members: g.members.filter((id) => !cmd.members.includes(id)) }))
        .filter((g) => g.members.length >= 2);
      s.groups.push({ id: cmd.id, name: cmd.name, members: cmd.members });
      continue;
    }
    if (cmd.type === 'group.remove') {
      s.groups = s.groups.filter((g) => g.id !== cmd.id);
      continue;
    }
    const root = parse(s.html);
    if(cmd.type==='native-chart.create') {
      invariant(!elements(root).some(e=>attr(e,NODE_ID)===cmd.target),'DUPLICATE_ID','Chart already exists');
      const parent=elements(root).find(e=>attr(e,'id')==='stage')??elements(root).find(e=>e.tagName==='body')!;
      assertContentParent(parent,s);
      appendHtml(parent,`<div data-notale-id="${cmd.target}" data-notale-authored-chart="" data-notale-name="图表" style="position:absolute;left:${cmd.x}px;top:${cmd.y}px;width:${cmd.width}px;height:${cmd.height}px"></div>`,undefined,false);
      s.nativeCharts[cmd.target]={adapter:'echarts',option:{},authoring:cmd.model};s.html=serialize(root);continue;
    }
    if (cmd.type === 'element.insert') {
      const parent = cmd.parent
        ? findElement(root, cmd.parent)
        : (elements(root).find((e) => attr(e, 'id') === 'stage') ??
          elements(root).find((e) => e.tagName === 'body')!);
      assertContentParent(parent, s);
      const fragment = appendHtml(parent, cmd.html, cmd.index);
      invariant(
        !fragment
          .flatMap(elements)
          .some(
            (e) =>
              ['script', 'base'].includes(e.tagName) ||
              e.attrs.some((a) => a.name.startsWith('on')),
          ),
        'EXECUTABLE_INSERT',
        'New objects cannot introduce scripts or event-handler attributes',
      );
      s.html = serialize(root);
      continue;
    }
    if (
      cmd.type === 'element.delete' &&
      cascadedConnectors.has(`${s.id}/${cmd.target}`) &&
      !s.connectors.some((c) => c.id === cmd.target) &&
      !editableElements(root).some((e) => attr(e, NODE_ID) === cmd.target)
    )
      continue; // Already removed by an earlier endpoint deletion in this same batch.
    const el = findElement(root, cmd.target);
    if (
      ['element.delete', 'element.content', 'element.duplicate'].includes(cmd.type) ||
      (cmd.type === 'element.patch' && cmd.patch.richText !== undefined)
    ) {
      const affected = new Set(elements(el).map((node) => attr(node, NODE_ID)));
      for (const [id, chart] of Object.entries(s.nativeCharts))
        if (
          chart.interaction &&
          [id, ...interactionMembers(chart.interaction)].some((member) => affected.has(member))
        )
          invariant(
            affected.has(chart.interaction.root) && cmd.type !== 'element.duplicate',
            'COMPONENT_BOUNDARY',
            'Delete or transfer the complete interactive component',
          );
    }
    if (cmd.type === 'element.lock') {
      s.locked = s.locked.filter((id) => id !== cmd.target);
      if (cmd.locked) s.locked.push(cmd.target);
      continue;
    }
    let ancestor: typeof el | undefined = el;
    while (ancestor) {
      invariant(
        !s.locked.includes(attr(ancestor, NODE_ID) ?? ''),
        'LOCKED',
        'Object or its container is locked',
      );
      ancestor =
        ancestor.parentNode && 'tagName' in ancestor.parentNode ? ancestor.parentNode : undefined;
    }
    if (
      [
        'element.delete',
        'element.content',
        'element.move',
        'element.transform',
        'element.patch',
        'table.edit',
        'chart.update',
        'native-chart.edit',
        'native-chart.convert',
        'native-chart.reset',
        'native-chart.set',
        'native-chart.remove',
        'native-chart.state',
        'native-chart.component',
        'native-chart.appearance',
      ].includes(cmd.type)
    )
      invariant(
        !elements(el).some((e) => s.locked.includes(attr(e, NODE_ID) ?? '')),
        'LOCKED',
        'Operation would modify a locked descendant',
      );
    if (
      attr(el, 'data-notale-connector') !== undefined &&
      !['element.delete', 'element.duplicate'].includes(cmd.type) &&
      !(
        cmd.type === 'element.patch' &&
        cmd.patch.text === undefined &&
        cmd.patch.richText === undefined &&
        !cmd.patch.attributes &&
        cmd.patch.style &&
        Object.keys(cmd.patch.style).every((key) =>
          ['z-index', 'opacity', 'visibility'].includes(key),
        )
      )
    )
      invariant(
        false,
        'DERIVED_GEOMETRY',
        'Edit connector endpoints and line settings with connector.set',
      );
    if(cmd.type==='native-chart.convert') {
      invariant(el.tagName==='svg'&&attr(el,'data-notale-chart'),'NOT_A_CHART','Choose a data-backed SVG chart');
      const legacy=chartDataSchema.parse(JSON.parse(attr(el,'data-notale-chart')!));
      const model=newChart(legacy.kind==='bar'?'column':legacy.kind),series=legacy.series??[{name:legacy.title||'系列 1',values:legacy.values}];
      model.columns=[{id:'label',name:'分类',type:'text'},...series.map((s,i)=>({id:`value_${i}`,name:s.name,type:'number' as const}))];
      model.series=series.map((s,i)=>({id:`series_${i}`,columnId:`value_${i}`,name:s.name,axis:'primary',style:{labels:legacy.showValues,width:legacy.lineWidth,symbolSize:legacy.pointRadius*2},points:{}}));
      model.rows=legacy.labels.map((label,i)=>({id:`row_${i}`,values:{label,...Object.fromEntries(series.map((s,j)=>[`value_${j}`,s.values[i]]))}}));
      model.bindings={label:'label'};model.appearance={title:legacy.title,palette:legacy.colors,fontSize:legacy.fontSize,textColor:legacy.textColor,background:legacy.background,legend:legacy.showLegend?'auto':'none',precision:legacy.valueDecimals};model.xAxis={rotate:legacy.labelAngle};model.yAxis={grid:legacy.showGrid};
      const viewBox=(attr(el,'viewBox')??'0 0 640 400').split(/\s+/).map(Number);
      el.tagName='div';el.nodeName='div';el.namespaceURI='http://www.w3.org/1999/xhtml' as typeof el.namespaceURI;
      const width=attr(el,'width')??String(viewBox[2]),height=attr(el,'height')??String(viewBox[3]);
      el.attrs=el.attrs.filter(a=>!['viewBox','xmlns','data-notale-chart','width','height'].includes(a.name));
      setInner(el,'');setAttr(el,'data-notale-authored-chart','');
      const style=attr(el,'style')??'';patchStyle(el,{...(!/(?:^|;)\s*width\s*:/.test(style)?{width:/^\d+(?:\.\d+)?$/.test(width)?width+'px':width}:{}),...(!/(?:^|;)\s*height\s*:/.test(style)?{height:/^\d+(?:\.\d+)?$/.test(height)?height+'px':height}:{}),...(!/(?:^|;)\s*position\s*:/.test(style)?{position:'relative'}:{})});
      s.nativeCharts[cmd.target]={adapter:'echarts',option:{},authoring:model};
    }
    if(cmd.type==='native-chart.edit') {
      const previous=s.nativeCharts[cmd.target];
      s.nativeCharts[cmd.target]={...previous,source:previous?.source??(cmd.model.origin==='native'?inspectChartSources(s).get(cmd.target):undefined),adapter:'echarts',option:previous?.option??{},authoring:previous?.authoring&&cmd.before?mergeChartEdit(previous.authoring,cmd.before,cmd.model):cleanChartReferences(structuredClone(cmd.model))};
      const states=new Set(cmd.model.states.map(state=>state.id));
      s.animations=s.animations.filter(a=>a.target!==cmd.target||a.effect!=='chart-state'||states.has(a.chartStateId??''));
    }
    if(cmd.type==='native-chart.reset') {
      const chart=s.nativeCharts[cmd.target];invariant(chart,'INVALID_NATIVE_CHART','Chart does not exist');
      if(chart.authoring) {
        if(cmd.scope==='appearance'||cmd.scope==='all'){chart.authoring.appearance={};chart.authoring.xAxis={};chart.authoring.yAxis={};chart.authoring.secondaryAxis={};for(const series of chart.authoring.series){series.style={};series.points={};}}
        if(cmd.scope==='data'||cmd.scope==='all'&&chart.source){invariant(chart.source,'INVALID_NATIVE_CHART','Manual chart has no dynamic source');chart.authoring.origin='native';}
      } else chart.option={};
    }
    if (cmd.type === 'native-chart.set')
      s.nativeCharts[cmd.target] = {
        ...s.nativeCharts[cmd.target],
        adapter: 'echarts',
        option: cmd.option,
      };
    if (cmd.type === 'native-chart.component') {
      const interaction = inspectChartComponents(s).get(cmd.target);
      const source = inspectChartSources(s).get(cmd.target);
      invariant(
        interaction && source,
        'COMPONENT_NOT_FOUND',
        'This source has no editable component adapter',
      );
      s.nativeCharts[cmd.target] = {
        ...s.nativeCharts[cmd.target],
        adapter: 'echarts',
        option: s.nativeCharts[cmd.target]?.option ?? {},
        source,
        interaction: { ...interaction, ...cmd.state },
      };
    }
    if (
      cmd.type === 'native-chart.state' ||
      cmd.type === 'native-chart.component' ||
      cmd.type === 'native-chart.appearance'
    ) {
      const interaction = s.nativeCharts[cmd.target]?.interaction;
      invariant(
        interaction,
        'COMPONENT_NOT_FOUND',
        'Choose an independent interactive chart component',
      );
      const affected =
        cmd.type === 'native-chart.appearance'
          ? Object.values(interaction.controls)
          : interactionMembers(interaction);
      for (const id of affected) {
        let member: typeof el | undefined = findElement(root, id);
        if (id !== interaction.root)
          invariant(
            !elements(member).some((node) => s.locked.includes(attr(node, NODE_ID) ?? '')),
            'LOCKED',
            'Component control or metric contains a locked descendant',
          );
        while (member) {
          invariant(
            !s.locked.includes(attr(member, NODE_ID)!),
            'LOCKED',
            'Component control or container is locked',
          );
          member =
            member.parentNode && 'tagName' in member.parentNode ? member.parentNode : undefined;
        }
      }
      if (cmd.type === 'native-chart.state') interaction.value = cmd.value;
      if (cmd.type === 'native-chart.appearance') Object.assign(interaction[cmd.state], cmd.patch);
    }
    if (cmd.type === 'native-chart.remove') {
      if (s.nativeCharts[cmd.target]?.source) s.nativeCharts[cmd.target].option = {};
      else delete s.nativeCharts[cmd.target];
    }
    if (cmd.type === 'table.edit') editTable(el, cmd);
    if (cmd.type === 'chart.update') {
      invariant(
        el.tagName === 'svg' && attr(el, 'data-notale-chart'),
        'NOT_A_CHART',
        'Choose a data-backed chart',
      );
      const chart = chartMarkup(cmd.data);
      setInner(el, chart.body);
      setAttr(el, 'data-notale-chart', JSON.stringify(chart.data));
      patchStyle(el, { background: 'transparent' });
    }
    if (cmd.type === 'media.update') {
      invariant(
        ['img', 'video', 'audio'].includes(el.tagName),
        'NOT_MEDIA',
        'Choose an image, video or audio object',
      );
      const existing = attr(el, 'data-notale-media');
      const settings = mediaSettingsSchema.parse({
        ...(existing
          ? JSON.parse(existing)
          : {
              controls: el.tagName === 'img' || attr(el, 'controls') !== undefined,
              muted: attr(el, 'muted') !== undefined,
              loop: attr(el, 'loop') !== undefined,
            }),
        ...cmd.patch.settings,
      });
      if (cmd.patch.src !== undefined) {
        setAttr(el, 'src', cmd.patch.src);
        setAttr(el, 'srcset', null);
        if (el.parentNode && 'tagName' in el.parentNode && el.parentNode.tagName === 'picture')
          for (const child of elements(el.parentNode).filter((n) => n.tagName === 'source'))
            setAttr(child, 'srcset', cmd.patch.src);
      }
      if (cmd.patch.poster !== undefined) {
        invariant(el.tagName === 'video', 'NOT_VIDEO', 'Only video has a poster');
        setAttr(el, 'poster', cmd.patch.poster);
      }
      if (cmd.patch.alt !== undefined) setAttr(el, 'alt', cmd.patch.alt);
      if (cmd.patch.settings || existing) {
        const c = settings.crop,
          p = cmd.patch.settings;
        patchStyle(el, {
          ...(p?.fit !== undefined ? { 'object-fit': settings.fit } : {}),
          ...(p?.positionX !== undefined || p?.positionY !== undefined
            ? { 'object-position': `${settings.positionX}% ${settings.positionY}%` }
            : {}),
          ...(p?.crop !== undefined
            ? {
                'clip-path':
                  c.top || c.right || c.bottom || c.left
                    ? `inset(${c.top}% ${c.right}% ${c.bottom}% ${c.left}%)`
                    : 'none',
              }
            : {}),
        });
        if (el.tagName !== 'img') {
          setAttr(el, 'controls', settings.controls ? '' : null);
          setAttr(el, 'muted', settings.muted ? '' : null);
          setAttr(el, 'autoplay', null);
          setAttr(el, 'loop', null);
          setAttr(el, 'preload', 'metadata');
          if (el.tagName === 'video') setAttr(el, 'playsinline', '');
        }
        setAttr(el, 'data-notale-media', JSON.stringify(settings));
      }
    }
    if (cmd.type === 'element.patch') {
      recordInstancePatch(s, cmd.target, cmd.patch);
      invariant(
        cmd.patch.text === undefined || cmd.patch.richText === undefined,
        'INVALID_TEXT',
        'Choose text or richText',
      );
      if (cmd.patch.text !== undefined || cmd.patch.richText !== undefined) {
        invariant(
          !elements(el).some((n) =>
            [
              'script',
              'canvas',
              'video',
              'audio',
              'iframe',
              'input',
              'select',
              'textarea',
            ].includes(n.tagName),
          ),
          'DESTRUCTIVE_TEXT',
          'Edit a text object without removing an interactive subtree',
        );
        if (cmd.patch.text !== undefined) setText(el, cmd.patch.text);
        if (cmd.patch.richText !== undefined) {
          setInner(el, cmd.patch.richText);
          invariant(
            elements(el).every(
              (n) =>
                n === el ||
                [
                  'b',
                  'strong',
                  'em',
                  'i',
                  'u',
                  's',
                  'span',
                  'br',
                  'sub',
                  'sup',
                  'a',
                  'p',
                  'ul',
                  'ol',
                  'li',
                ].includes(n.tagName),
            ),
            'INVALID_RICH_TEXT',
            'Unsupported rich text element',
          );
          invariant(
            elements(el).every((n) =>
              n.attrs.every((a) => !a.name.startsWith('on') && !/javascript:/i.test(a.value)),
            ),
            'INVALID_RICH_TEXT',
            'Executable rich text is not allowed',
          );
        }
      }
      if (cmd.patch.style) patchStyle(el, cmd.patch.style);
      if (cmd.patch.attributes)
        for (const [key, value] of Object.entries(cmd.patch.attributes)) {
          invariant(
            ![NODE_ID, 'id', 'style', 'data-notale-connector'].includes(key) &&
              !key.startsWith('on') &&
              !['srcdoc'].includes(key),
            'RESERVED_ATTRIBUTE',
            `Cannot patch ${key}`,
          );
          invariant(
            value === null || !/^\s*javascript:/i.test(value),
            'INVALID_URL',
            'Executable URL is not supported',
          );
          setAttr(el, key, value);
        }
    }
    if (cmd.type === 'element.content') {
      invariant(
        !elements(el).some((n) =>
          ['script', 'canvas', 'video', 'audio', 'iframe', 'input', 'select', 'textarea'].includes(
            n.tagName,
          ),
        ),
        'DESTRUCTIVE_CONTENT',
        'Cannot replace a script-owned interactive subtree',
      );
      setInner(el, cmd.html);
      invariant(
        !elements(el).some(
          (n) =>
            ['script', 'base', 'iframe'].includes(n.tagName) ||
            n.attrs.some((a) => a.name.startsWith('on') || /^\s*javascript:/i.test(a.value)),
        ),
        'EXECUTABLE_INSERT',
        'Replacement content cannot introduce executable code',
      );
    }
    if (cmd.type === 'element.delete') removeElement(el);
    if (cmd.type === 'element.duplicate') {
      invariant(
        !(s.components ?? []).some((component) =>
          elements(el).some((node) => attr(node, NODE_ID) === component.root),
        ),
        'COMPONENT_BOUNDARY',
        'Duplicate complete components with clipboard transfer',
      );
      invariant(
        !elements(el).some((e) => attr(e, 'data-notale-connector') !== undefined),
        'CONNECTOR_CLONE',
        'Copy connected objects together with the connector using the clipboard',
      );
      invariant(
        el.parentNode && 'tagName' in el.parentNode,
        'INVALID_PARENT',
        'Cannot duplicate root',
      );
      invariant(
        !elements(el).some(
          (e) =>
            ['script', 'canvas', 'iframe'].includes(e.tagName) ||
            s.nativeCharts[attr(e, NODE_ID) ?? ''] ||
            inspectChartSources(s).has(attr(e, NODE_ID) ?? ''),
        ),
        'INTERACTION_CLONE',
        'Duplicate the slide to preserve script-owned interactive instances',
      );
      const copies = appendHtml(
        el.parentNode,
        serializeOuter(el),
        el.parentNode.childNodes.indexOf(el) + 1,
      );
      const idMap = new Map<string, string>();
      for (const copy of copies)
        for (const n of elements(copy)) {
          const id = attr(n, 'id');
          if (id) {
            const next = `copy-${uid()}`;
            idMap.set(id, next);
            setAttr(n, 'id', next);
          }
        }
      for (const copy of copies)
        for (const n of elements(copy))
          for (const a of n.attrs)
            for (const [old, next] of idMap) {
              if (a.value === `#${old}`) a.value = `#${next}`;
              a.value = a.value.replaceAll(`url(#${old})`, `url(#${next})`);
            }
    }
    if (cmd.type === 'element.move') {
      const parent = findElement(root, cmd.parent);
      invariant(!elements(el).includes(parent), 'CYCLE', 'Cannot move an object inside itself');
      assertContentParent(parent, s);
      removeElement(el);
      el.parentNode = parent;
      parent.childNodes.splice(cmd.index, 0, el);
    }
    if (cmd.type === 'element.transform') {
      s.transforms[cmd.target] = cmd.transform;
      // Individual transform properties compose with the original CSS transform.
      const t = cmd.transform;
      patchStyle(el, {
        ...(t.matrix ? { transform: `matrix(${t.matrix.join(',')})` } : {}),
        translate: `${t.x}px ${t.y}px`,
        rotate: `${t.rotate}deg`,
        scale: `${t.scaleX} ${t.scaleY}`,
        ...(t.width === null ? { width: 'auto' } : t.width ? { width: `${t.width}px` } : {}),
        ...(t.height === null ? { height: 'auto' } : t.height ? { height: `${t.height}px` } : {}),
      });
    }
    s.html = normalizeHtml(serialize(root));
    if (cmd.type === 'element.transform') recordInstanceTransform(s, cmd.target);
    cleanMetadata(s, cascadedConnectors);
  }
  for (const slide of doc.slides) if (slide.steps) ensureStepPlan(slide);
  return validateDocument(doc);
}
