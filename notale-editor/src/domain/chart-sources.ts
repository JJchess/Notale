import { createHash } from 'node:crypto';
import { parse as parseScript } from 'acorn';
import { simple } from 'acorn-walk';
import { posix } from 'node:path';
import { parse, serialize, elements, attr, textOf, setText, setAttr, NODE_ID } from './html.js';
import type { Slide } from './model.js';
import type { NativeChartSource } from './native-charts.js';

// Reviewed source families: configuration/data code is separable from DOM
// ownership. Every factory invocation creates fresh data and callback closures.
const recipes: Record<
  string,
  {
    targets: Record<string, string>;
    instances: Record<string, string>;
    initializationTry?: string;
    omit: string[];
    functions?: string[];
  }
> = {
  '34a41e55a4e27656f8c2c9547b770c00ef927245e6557924c1e5f503e82dc4e7': {
    targets: { chart: 'option' },
    instances: { chart: 'chart' },
    omit: ['host', 'chart'],
  },
  e0c9725f677dfb8351fa4ccfa4a2caad680059a207bb71b35daae4a05f4fcb02: {
    targets: { 'chart-trees': 'optTrees', 'chart-features': 'optFeat' },
    instances: { 'chart-trees': 'chartTrees', 'chart-features': 'chartFeat' },
    omit: ['cTreesEl', 'cFeatEl', 'chartTrees', 'chartFeat'],
  },
  d06703df03c3929a0491e60e9e29fc52525c551829c29288ec75bc77d893be53: {
    targets: { chart: 'updateOption(currentLr)' },
    instances: { chart: 'chart' },
    initializationTry: 'chart',
    omit: ['chartHost', 'chart'],
    functions: ['updateOption'],
  },
};

// Only the disposable render projection changes. Deleted original hosts must
// not abort sibling initialization or be reported as a library-loading failure.
export function instrumentChartLifecycle(slide: Slide): string {
  const root = parse(slide.html),
    nodes = elements(root);
  const domIds = new Set(nodes.map((el) => attr(el, 'id')));
  // An adopted component keeps its source IDs, while its new controller owns
  // initialization. Treat that original instance like a removed one in the projection.
  for (const node of nodes)
    if (slide.nativeCharts[attr(node, NODE_ID) ?? '']?.interaction) domIds.delete(attr(node, 'id'));
  const ownedRoots = new Set(
    Object.values(slide.nativeCharts).flatMap((chart) =>
      chart.interaction ? [chart.interaction.root] : [],
    ),
  );
  for (const node of nodes)
    if (ownedRoots.has(attr(node, NODE_ID)!)) setAttr(node, 'data-notale-chart-component', '');
  for (const script of nodes.filter((el) => el.tagName === 'script' && !attr(el, 'src'))) {
    const source = textOf(script),
      recipe = recipes[createHash('sha256').update(source).digest('hex')];
    if (!recipe) continue;
    const missing = new Set(
      Object.entries(recipe.instances)
        .filter(([id]) => !domIds.has(id))
        .map(([, instance]) => instance),
    );
    const scopeControls = recipe.initializationTry === 'chart' && ownedRoots.size > 0;
    if (!missing.size && !scopeControls) continue;
    const changes: Array<{ start: number; end: number; text: string }> = [];
    const isInit = (node: any) =>
      node?.type === 'CallExpression' &&
      node.callee?.object?.name === 'echarts' &&
      node.callee?.property?.name === 'init';
    const ast = parseScript(source, { ecmaVersion: 'latest' });
    simple(ast, {
      VariableDeclarator(node: any) {
        if (missing.has(node.id.name) && isInit(node.init))
          changes.push({ start: node.init.start, end: node.init.end, text: 'null' });
      },
      CallExpression(node: any) {
        if (
          scopeControls &&
          node.callee?.object?.name === 'document' &&
          node.callee?.property?.name === 'querySelectorAll' &&
          node.arguments[0]?.value === '.tab-btn'
        )
          changes.push({
            start: node.start,
            end: node.end,
            text: `Array.from(document.querySelectorAll('.tab-btn')).filter(button=>!button.closest('[data-notale-chart-component]'))`,
          });
        if (
          missing.has(node.callee?.object?.name) &&
          ['setOption', 'resize'].includes(node.callee?.property?.name)
        )
          changes.push({ start: node.start, end: node.end, text: 'void 0' });
      },
      TryStatement(node: any) {
        if (!recipe.initializationTry || !missing.has(recipe.initializationTry)) return;
        let ownsInitialization = false;
        simple(node.block, {
          AssignmentExpression(assignment: any) {
            if (assignment.left?.name === recipe.initializationTry && isInit(assignment.right))
              ownsInitialization = true;
          },
        });
        if (ownsInitialization) changes.push({ start: node.start, end: node.end, text: ';' });
      },
    });
    let rendered = source;
    for (const change of changes
      .filter(
        (edit) =>
          !changes.some(
            (other) => other !== edit && other.start <= edit.start && other.end >= edit.end,
          ),
      )
      .sort((a, b) => b.start - a.start))
      rendered = rendered.slice(0, change.start) + change.text + rendered.slice(change.end);
    setText(script, rendered);
  }
  return serialize(root);
}
function sourceConfiguration(source: NativeChartSource) {
  const hash = createHash('sha256').update(source.script).digest('hex'),
    recipe = recipes[hash];
  if (!recipe || !Object.hasOwn(recipe.targets, source.domId)) return;
  const ast: any = parseScript(source.script, { ecmaVersion: 'latest' });
  const body = ast.body.find((s: any) => s.expression?.callee?.body)?.expression.callee.body.body;
  if (!body) return;
  const statements = body.filter(
    (s: any) =>
      (s.type === 'VariableDeclaration' &&
        s.declarations.every((d: any) => !recipe.omit.includes(d.id.name))) ||
      s.type === 'ForStatement' ||
      (s.type === 'FunctionDeclaration' && recipe.functions?.includes(s.id.name)),
  );
  return {
    body: statements.map((s: any) => source.script.slice(s.start, s.end)).join('\n'),
    expression: recipe.targets[source.domId],
    recipe,
  };
}
export function chartFactory(source: NativeChartSource): string | undefined {
  const config = sourceConfiguration(source);
  return config && `()=>{${config.body}\nreturn ${config.expression};}`;
}
export function chartInteractionFactory(source: NativeChartSource): string | undefined {
  const config = sourceConfiguration(source);
  if (config?.recipe.initializationTry !== 'chart' || source.domId !== 'chart') return;
  return `()=>{${config.body}\nreturn(value)=>{const p=profiles[value];return {option:updateOption(value),metrics:{optM:p.optM+' 轮',minErr:p.minErr,overfit:p.overfit,verdict:p.verdict}}};}`;
}
export function inspectChartSources(slide: Slide): Map<string, NativeChartSource> {
  const nodes = elements(parse(slide.html)),
    out = new Map<string, NativeChartSource>();
  const external = nodes.find(
    (el) => el.tagName === 'script' && /(?:^|\/)echarts(?:\.min)?\.js$/.test(attr(el, 'src') ?? ''),
  );
  if (external) {
    const library = posix.normalize(
      posix.join(posix.dirname(slide.sourcePath), attr(external, 'src')!),
    );
    for (const script of nodes.filter((el) => el.tagName === 'script' && !attr(el, 'src'))) {
      const text = textOf(script),
        recipe = recipes[createHash('sha256').update(text).digest('hex')];
      if (!recipe) continue;
      for (const domId of Object.keys(recipe.targets)) {
        const host = nodes.find((el) => attr(el, 'id') === domId),
          id = host && attr(host, NODE_ID);
        if (id) out.set(id, { script: text, domId, library });
      }
    }
  }
  for (const [id, chart] of Object.entries(slide.nativeCharts))
    if (chart.source) out.set(id, chart.source);
  return out;
}
