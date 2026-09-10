import type { CanvasInstance } from './canvas-schema.js';
export { canvasInstanceSchema, type CanvasInstance } from './canvas-schema.js';
import { createHash } from 'node:crypto';
import { parse as parseScript } from 'acorn';
import { simple } from 'acorn-walk';
import { parse, serialize, elements, attr, textOf, setText, NODE_ID } from './html.js';
import { invariant, type Slide } from './model.js';
import type { SourceScene } from './source-scenes.js';
export const correlationHash = '7d303cb0e07466311e4d90f30070c5e1a032db847928ee268ced300867beb647';
export const correlationIds = [
  'matrix-canvas',
  'curve-canvas',
  'rho-slider',
  'm-slider',
  'eps-slider',
  'rho-val',
  'm-val',
  'eps-val',
  'resample',
  'metric-base-err',
  'metric-ens-err',
  'metric-gain',
  'verdict-text',
];
const presetKeys = ['preset-0', 'preset-1', 'preset-2'];
export const correlationDefaults = { rho: 0, M: 21, eps: 0.35, seed: 42 };
export function isCorrelationSource(script: string) {
  return createHash('sha256').update(script).digest('hex') === correlationHash;
}
export function inspectCanvasSources(slide: Slide): Record<string, CanvasInstance> {
  const out = { ...slide.canvasInstances },
    nodes = elements(parse(slide.html));
  for (const script of nodes.filter(
    (node) => node.tagName === 'script' && !attr(node, 'src') && isCorrelationSource(textOf(node)),
  )) {
    const members = correlationIds.map((id) => nodes.find((node) => attr(node, 'id') === id));
    if (members.some((node) => !node)) continue;
    let root = members[0]!.parentNode;
    while (root && 'tagName' in root && !members.every((node) => elements(root!).includes(node!)))
      root = root.parentNode;
    if (!root || !('tagName' in root) || !attr(root, NODE_ID)) continue;
    const presets = elements(root).filter(
      (node) =>
        node.tagName === 'button' &&
        (attr(node, 'class') ?? '').split(/\s+/).includes('preset-btn'),
    );
    if (presets.length !== 3) continue;
    let languageNode: typeof root | undefined = root;
    while (languageNode && !attr(languageNode, 'lang'))
      languageNode =
        languageNode.parentNode && 'tagName' in languageNode.parentNode
          ? languageNode.parentNode
          : undefined;
    const lang = languageNode ? attr(languageNode, 'lang')! : 'zh';
    const id = attr(root, NODE_ID)!;
    if (!out[id])
      out[id] = {
        adapter: 'correlation-v1',
        lang,
        script: textOf(script),
        members: Object.fromEntries([
          ...correlationIds.map((key, i) => [key, attr(members[i]!, NODE_ID)!]),
          ...presetKeys.map((key, i) => [key, attr(presets[i], NODE_ID)!]),
        ]),
      };
  }
  return out;
}
export function canvasSceneDescriptor(root: string, instance: CanvasInstance): SourceScene {
  const control = (name: string, min: number, max: number, step: number) => ({
    target: instance.members[name],
    event: 'input' as const,
    min,
    max,
    step,
  });
  return {
    id: root,
    root,
    name: '相关性模拟',
    targets: [root, ...Object.values(instance.members)],
    parameters: [
      {
        key: 'rho',
        label: '基学习器相关度 ρ',
        value: 0,
        control: control('rho-slider', 0, 0.9, 0.05),
      },
      { key: 'M', label: '基学习器数量 M', value: 21, control: control('m-slider', 5, 35, 2) },
      {
        key: 'eps',
        label: '基学习器单体错误率 ε',
        value: 0.35,
        control: control('eps-slider', 0.1, 0.45, 0.05),
      },
      { key: 'seed', label: '采样种子', value: 42 },
    ],
  };
}
export function validateCanvasInstances(slide: Slide) {
  const nodes = elements(parse(slide.html)),
    byId = new Map(nodes.map((node) => [attr(node, NODE_ID), node]));
  const owned = new Set<string>();
  for (const [rootId, instance] of Object.entries(slide.canvasInstances ?? {})) {
    invariant(
      isCorrelationSource(instance.script),
      'INVALID_CANVAS_SOURCE',
      'Canvas source is not a reviewed factory',
    );
    const root = byId.get(rootId);
    invariant(root, 'CANVAS_BOUNDARY', 'Canvas component root is missing');
    invariant(
      Object.keys(instance.members).length === correlationIds.length + presetKeys.length,
      'CANVAS_BOUNDARY',
      'Canvas component member map changed',
    );
    for (const key of [...correlationIds, ...presetKeys]) {
      const member = byId.get(instance.members[key]);
      invariant(
        member && elements(root).includes(member) && !owned.has(instance.members[key]),
        'CANVAS_BOUNDARY',
        'Transfer or delete the complete Canvas component',
      );
      owned.add(instance.members[key]);
      const expected = key.endsWith('-canvas')
        ? 'canvas'
        : key.endsWith('-slider')
          ? 'input'
          : key.startsWith('preset-') || key === 'resample'
            ? 'button'
            : undefined;
      invariant(
        !expected || member.tagName === expected,
        'CANVAS_BOUNDARY',
        'Canvas control type changed',
      );
      if (key.startsWith('preset-'))
        invariant(
          attr(member, 'data-rho') === ['0.0', '0.3', '0.75'][presetKeys.indexOf(key)],
          'CANVAS_BOUNDARY',
          'Canvas preset value changed',
        );
    }
  }
  for (const script of nodes.filter(
    (node) => node.tagName === 'script' && !attr(node, 'src') && isCorrelationSource(textOf(node)),
  )) {
    const count = correlationIds.filter((id) =>
      nodes.some((node) => attr(node, 'id') === id),
    ).length;
    invariant(
      count === 0 || count === correlationIds.length,
      'CANVAS_BOUNDARY',
      'Delete or transfer the complete original Canvas component',
    );
    if (count)
      invariant(
        Object.entries(inspectCanvasSources(slide)).some(
          ([rootId, instance]) =>
            !slide.canvasInstances?.[rootId] && instance.script === textOf(script),
        ),
        'CANVAS_BOUNDARY',
        'Original Canvas controls are incomplete',
      );
  }
}
/** Render-only lifecycle edits precede scalar source instrumentation. */
export function instrumentCanvasLifecycle(slide: Slide, html = slide.html): string {
  const root = parse(html),
    nodes = elements(root);
  const originals = elements(parse(slide.html)).filter((node) => node.tagName === 'script');
  const scripts = nodes.filter((node) => node.tagName === 'script');
  for (const [index, original] of originals.entries()) {
    if (attr(original, 'src') || !isCorrelationSource(textOf(original))) continue;
    const script = scripts[index];
    if (!nodes.some((node) => attr(node, 'id') === 'matrix-canvas'))
      setText(script, 'if(window.Deck) Deck.init({index:7,total:32});');
    // Copies remap their IDs but keep classes. The original must query only its workspace.
    else
      setText(
        script,
        textOf(script).replace(
          "document.querySelectorAll('.preset-btn')",
          "document.getElementById('matrix-canvas').closest('.workspace').querySelectorAll('.preset-btn')",
        ),
      );
  }
  return serialize(root);
}
export function canvasFactory(instance: CanvasInstance): string {
  invariant(
    isCorrelationSource(instance.script),
    'INVALID_CANVAS_SOURCE',
    'Canvas factory is unavailable',
  );
  let end = -1;
  simple(parseScript(instance.script, { ecmaVersion: 'latest' }), {
    VariableDeclaration(node: any) {
      if (
        node.declarations.some(
          (declaration: any) =>
            declaration.id.name === 'state' && declaration.init?.type === 'ObjectExpression',
        )
      )
        end = node.end;
    },
  });
  invariant(end >= 0, 'INVALID_CANVAS_SOURCE', 'Canvas state initializer is missing');
  const source =
    instance.script.slice(0, end) +
    '\nObject.assign(state, initial); view.read=()=>({...state});\n' +
    instance.script.slice(end);
  return `function(document,Deck,initial,view){${source}\n}`;
}
