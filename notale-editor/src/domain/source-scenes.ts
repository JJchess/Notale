import { inspectCanvasSources, canvasSceneDescriptor } from './canvas-instances.js';
import { parse as parseScript } from 'acorn';
import { ancestor } from 'acorn-walk';
import { createHash } from 'node:crypto';
import {
  parse,
  serialize,
  elements,
  attr,
  textOf,
  setText,
  NODE_ID,
  type Element,
} from './html.js';
import { invariant, type Slide } from './model.js';
import { sceneScalarSchema, type SceneScalar } from './scene-schema.js';
import { sceneChoiceInspector, type SceneChoice } from './scene-choices.js';
import { checkpointAdapter, checkpointHooks } from './scene-checkpoints.js';

export type SceneParameter = {
  key: string;
  label: string;
  value: SceneScalar;
  choices?: SceneChoice[];
  readonly?: boolean;
  control?: {
    target: string;
    event: 'input' | 'change';
    min?: number;
    max?: number;
    step?: number;
  };
};
export type SourceScene = {
  id: string;
  root?: string;
  name: string;
  targets: string[];
  parameters: SceneParameter[];
  checkpoint?: 'bootstrap-forest-v1';
};
type Site = SourceScene & {
  script: Element;
  variable: string;
  insertAt: number;
  checkpointAt?: number;
  fields: Record<string, { start: number; end: number }>;
};
const namePattern = /^[a-zA-Z_$][\w$]{0,79}$/;
const scalar = (node: any): SceneScalar | undefined => {
  const value =
    node?.type === 'Literal'
      ? node.value
      : node?.type === 'UnaryExpression' &&
          ['-', '+'].includes(node.operator) &&
          typeof node.argument?.value === 'number'
        ? (node.operator === '-' ? -1 : 1) * node.argument.value
        : undefined;
  const result = sceneScalarSchema.safeParse(value);
  return result.success ? result.data : undefined;
};
function scopeOf(chain: any[]) {
  for (let i = chain.length - 1; i >= 0; i--) {
    const node = chain[i];
    if (
      ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)
    )
      return chain[i - 1]?.type === 'CallExpression' && chain[i - 1].callee === node
        ? node
        : undefined;
    if (node.type === 'Program') return node;
  }
}
function sites(root: Parameters<typeof elements>[0]): Site[] {
  const nodes = elements(root),
    output: Site[] = [];
  const scripts = nodes.filter(
    (e) =>
      e.tagName === 'script' &&
      !attr(e, 'src') &&
      [undefined, '', 'text/javascript', 'application/javascript', 'module'].includes(
        attr(e, 'type'),
      ),
  );
  scripts.forEach((script, index) => {
    const source = textOf(script),
      hash = createHash('sha256').update(source).digest('hex');
    let ast;
    try {
      ast = parseScript(source, {
        ecmaVersion: 'latest',
        sourceType: attr(script, 'type') === 'module' ? 'module' : 'script',
      });
    } catch {
      return;
    }
    const declarations: Array<{ node: any; statement: any; scope: any }> = [],
      calls: Array<{ node: any; scope: any }> = [];
    ancestor(ast, {
      VariableDeclarator(node: any, _state: any, chain: any[]) {
        const statement = chain.at(-2),
          parent = chain.at(-3),
          scope = scopeOf(chain);
        if (
          scope &&
          node.id.type === 'Identifier' &&
          namePattern.test(node.id.name) &&
          statement?.type === 'VariableDeclaration' &&
          parent === (scope.type === 'Program' ? scope : scope.body)
        )
          declarations.push({ node, statement, scope });
      },
      CallExpression(node: any, _state: any, chain: any[]) {
        const scope = scopeOf(chain);
        if (
          scope &&
          chain.at(-2)?.type === 'ExpressionStatement' &&
          chain.at(-3) === (scope.type === 'Program' ? scope : scope.body)
        )
          calls.push({ node, scope });
      },
    });
    const choicesFor = sceneChoiceInspector(ast);
    for (const declaration of declarations) {
      const { node, statement, scope } = declaration;
      if (node.init?.type !== 'ObjectExpression') continue;
      const dom = new Map<string, Element>();
      for (const d of declarations.filter((d) => d.scope === scope)) {
        const init = d.node.init;
        if (
          init?.type === 'CallExpression' &&
          init.callee?.object?.name === 'document' &&
          init.arguments.length === 1 &&
          typeof init.arguments[0]?.value === 'string'
        ) {
          const method = init.callee.property?.name,
            query = init.arguments[0].value;
          const id =
            method === 'getElementById'
              ? query
              : method === 'querySelector' && /^#[\w-]+$/.test(query)
                ? query.slice(1)
                : undefined;
          const el = id ? nodes.find((e) => attr(e, 'id') === id) : undefined;
          if (el && attr(el, NODE_ID)) dom.set(d.node.id.name, el);
        }
      }
      if (![...dom.values()].some((el) => el.tagName === 'canvas')) continue;
      const fields: Site['fields'] = {},
        parameters: SceneParameter[] = [],
        keys = new Set<string>();
      let duplicate = false;
      for (const property of node.init.properties) {
        const key = property.key?.name ?? property.key?.value;
        if (
          typeof key !== 'string' ||
          !namePattern.test(key) ||
          ['__proto__', 'constructor', 'prototype'].includes(key)
        )
          continue;
        if (keys.has(key)) duplicate = true;
        keys.add(key);
        if (
          property.type !== 'Property' ||
          property.computed ||
          property.kind !== 'init' ||
          property.method
        )
          continue;
        const value = scalar(property.value);
        if (value === undefined) continue;
        fields[key] = { start: property.value.start, end: property.value.end };
        const parameter: SceneParameter = { key, label: key, value };
        const choices = choicesFor(node, key, value);
        if (choices) parameter.choices = choices;
        for (const call of calls.filter((c) => c.scope === scope)) {
          const c = call.node,
            control = dom.get(c.callee?.object?.name),
            event = c.arguments[0]?.value,
            handler = c.arguments[1];
          if (
            !control ||
            !['input', 'select', 'textarea'].includes(control.tagName) ||
            c.callee?.property?.name !== 'addEventListener' ||
            !['input', 'change'].includes(event) ||
            !['ArrowFunctionExpression', 'FunctionExpression'].includes(handler?.type) ||
            handler.params.length !== 1 ||
            handler.params[0].type !== 'Identifier'
          )
            continue;
          const argument = handler.params[0].name;
          if (argument === node.id.name) continue;
          const body = handler.body.type === 'BlockStatement' ? handler.body.body : [];
          if (
            body.some(
              (s: any) =>
                s.type === 'VariableDeclaration' &&
                s.declarations.some((d: any) => d.id.name === node.id.name),
            )
          )
            continue;
          for (const s of body) {
            const assignment = s.type === 'ExpressionStatement' ? s.expression : undefined,
              left = assignment?.left;
            if (
              assignment?.type !== 'AssignmentExpression' ||
              assignment.operator !== '=' ||
              left?.type !== 'MemberExpression' ||
              left.computed ||
              left.object?.name !== node.id.name ||
              left.property?.name !== key
            )
              continue;
            let rhs = assignment.right;
            if (
              rhs.type === 'CallExpression' &&
              ['Number', 'parseFloat', 'parseInt'].includes(rhs.callee?.name)
            )
              rhs = rhs.arguments[0];
            if (
              rhs?.type !== 'MemberExpression' ||
              !['value', 'checked'].includes(rhs.property?.name) ||
              rhs.object?.property?.name !== 'target' ||
              rhs.object?.object?.name !== argument
            )
              continue;
            const numeric = (name: string) => {
              const value = attr(control, name);
              return value !== undefined && value !== '' && Number.isFinite(Number(value))
                ? Number(value)
                : undefined;
            };
            parameter.control = {
              target: attr(control, NODE_ID)!,
              event,
              min: numeric('min'),
              max: numeric('max'),
              step: numeric('step'),
            };
            const parent = control.parentNode;
            const label =
              parent && 'tagName' in parent
                ? elements(parent).find((e) => e.tagName === 'label' || e.tagName === 'span')
                : undefined;
            parameter.label = label ? textOf(label).trim().slice(0, 100) : key;
          }
        }
        parameters.push(parameter);
      }
      if (duplicate || !parameters.length || parameters.length > 100) continue;
      const checkpoint = checkpointAdapter(hash, node.id.name);
      if (checkpoint) {
        for (const parameter of parameters) {
          if (parameter.key === 'm')
            parameter.choices = [3, 5, 10, 25].map((value) => ({ value, label: `${value} 棵树` }));
          else parameter.readonly = true;
        }
        // Include dynamically queried controls/labels in this adapter's lock boundary.
        for (const el of nodes) {
          const id = attr(el, 'id');
          if (id && (source.includes(`"${id}"`) || source.includes(`"#${id}`)))
            dom.set(`id:${id}`, el);
        }
      }
      output.push({
        id: `scene-${index}-${hash}-${node.start}`,
        name: node.id.name,
        targets: [...new Set([...dom.values()].map((e) => attr(e, NODE_ID)!))],
        parameters,
        ...(checkpoint ? { checkpoint, checkpointAt: scope.body.end - 1 } : {}),
        script,
        variable: node.id.name,
        insertAt: statement.end,
        fields,
      });
    }
  });
  return output;
}
export function inspectSourceScenes(slide: Slide): SourceScene[] {
  const sources = inspectCanvasSources(slide);
  const original = sites(parse(slide.html)).map(({ id, name, targets, parameters, checkpoint }) => {
    const root = Object.keys(sources).find(
      (root) =>
        !slide.canvasInstances?.[root] &&
        targets.some((target) => Object.values(sources[root].members).includes(target)),
    );
    return {
      id,
      name,
      targets: root ? [root, ...Object.values(sources[root].members)] : targets,
      parameters,
      ...(root ? { root } : {}),
      ...(checkpoint ? { checkpoint } : {}),
    };
  });
  return [
    ...original,
    ...Object.entries(slide.canvasInstances ?? {}).map(([root, instance]) =>
      canvasSceneDescriptor(root, instance),
    ),
  ];
}
export function validateSceneValues(scene: SourceScene, values: Record<string, SceneScalar>) {
  for (const [key, value] of Object.entries(values)) {
    const parameter = scene.parameters.find((p) => p.key === key);
    invariant(
      parameter && typeof parameter.value === typeof value,
      'INVALID_SCENE_VALUE',
      `Unknown or mistyped scene parameter ${key}`,
    );
    invariant(
      !parameter.readonly,
      'INVALID_SCENE_VALUE',
      `${key} is derived runtime state; capture a scene checkpoint`,
    );
    const bounds = parameter.control;
    invariant(
      !parameter.choices || parameter.choices.some((choice) => choice.value === value),
      'INVALID_SCENE_VALUE',
      `${key} is not one of the native scene choices`,
    );
    if (typeof value === 'number' && bounds) {
      invariant(
        (bounds.min === undefined || value >= bounds.min) &&
          (bounds.max === undefined || value <= bounds.max),
        'INVALID_SCENE_VALUE',
        `${key} is outside its native control range`,
      );
      if (bounds.step && bounds.step > 0)
        invariant(
          Math.abs(
            (value - (bounds.min ?? 0)) / bounds.step -
              Math.round((value - (bounds.min ?? 0)) / bounds.step),
          ) < 1e-7,
          'INVALID_SCENE_VALUE',
          `${key} does not match its native control step`,
        );
    }
  }
}
export function instrumentSourceScenes(slide: Slide): string {
  const root = parse(slide.html),
    found = sites(root),
    edits = new Map<Element, Array<{ start: number; end: number; text: string }>>();
  const json = (value: unknown) => JSON.stringify(value).replaceAll('<', '\\u003c');
  for (const scene of found) {
    const changes = edits.get(scene.script) ?? [];
    if (scene.checkpoint && scene.checkpointAt !== undefined)
      changes.push({
        start: scene.checkpointAt,
        end: scene.checkpointAt,
        text: checkpointHooks(scene.id),
      });
    changes.push({
      start: scene.insertAt,
      end: scene.insertAt,
      text: `\n;(window.__NOTALE_SCENES__??={})[${json(scene.id)}]=()=>({${scene.parameters.map((p) => `${json(p.key)}:${scene.variable}[${json(p.key)}]`).join(',')}});\n`,
    });
    const settings = slide.scenes?.find((s) => s.id === scene.id);
    for (const [key, value] of Object.entries(settings?.values ?? {})) {
      const field = scene.fields[key];
      if (!field) continue;
      changes.push({ ...field, text: json(value) });
    }
    edits.set(scene.script, changes);
  }
  for (const [script, changes] of edits) {
    let source = textOf(script);
    for (const edit of changes.sort((a, b) => b.start - a.start))
      source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
    setText(script, source);
  }
  return serialize(root);
}
