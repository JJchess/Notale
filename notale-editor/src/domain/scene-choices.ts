import { ancestor } from 'acorn-walk';
import type { SceneScalar } from './scene-schema.js';

export type SceneChoice = { value: SceneScalar; label: string };

// Resolve literal lookup tables and const aliases without evaluating source code.
// Bindings are lexical: an unrelated callback's `state` or `tasks` must not
// impose constraints on the startup object being edited.
export function sceneChoiceInspector(ast: any) {
  const chains = new Map<any, any[]>();
  const bindings = new Map<any, Map<string, any>>();
  const accesses: any[] = [];
  const constants = new Set<any>();
  const mutations: Array<{ node: any; chain: any[] }> = [];
  const escapes: Array<{ node: any; chain: any[] }> = [];
  const isFunction = (n: any) =>
    ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(n.type);
  const isScope = (n: any) =>
    n.type === 'Program' ||
    n.type === 'BlockStatement' ||
    isFunction(n) ||
    ['CatchClause', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'SwitchStatement'].includes(
      n.type,
    );
  function bind(scope: any, pattern: any, declaration: any) {
    if (!scope || !pattern) return;
    if (pattern.type === 'Identifier') {
      const names = bindings.get(scope) ?? new Map();
      names.set(pattern.name, names.has(pattern.name) ? null : declaration);
      bindings.set(scope, names);
    } else if (pattern.type === 'RestElement') bind(scope, pattern.argument, null);
    else if (pattern.type === 'AssignmentPattern') bind(scope, pattern.left, null);
    else if (pattern.type === 'ArrayPattern')
      pattern.elements.forEach((p: any) => bind(scope, p, null));
    else if (pattern.type === 'ObjectPattern')
      pattern.properties.forEach((p: any) =>
        bind(scope, p.type === 'RestElement' ? p.argument : p.value, null),
      );
  }
  const enclosing = (chain: any[], variable = false) =>
    [...chain]
      .reverse()
      .find((n) => (variable ? n.type === 'Program' || isFunction(n) : isScope(n)));
  ancestor(ast, {
    VariableDeclarator(n: any, _: any, chain: any[]) {
      chains.set(n, [...chain]);
      const kind = chain.at(-2).kind;
      bind(enclosing(chain.slice(0, -2), kind === 'var'), n.id, n);
      if (kind === 'const') constants.add(n);
    },
    Function(n: any, _: any, chain: any[]) {
      n.params.forEach((p: any) => bind(n, p, null));
      if (n.type === 'FunctionDeclaration') bind(enclosing(chain.slice(0, -1)), n.id, null);
      else if (n.id) bind(n, n.id, null);
    },
    CatchClause(n: any) {
      bind(n, n.param, null);
    },
    ImportDeclaration(n: any, _: any, chain: any[]) {
      n.specifiers.forEach((s: any) => bind(enclosing(chain.slice(0, -1)), s.local, null));
    },
    MemberExpression(n: any, _: any, chain: any[]) {
      chains.set(n, [...chain]);
      if (n.computed) accesses.push(n);
    },
    AssignmentExpression(n: any, _: any, chain: any[]) {
      mutations.push({ node: n.left, chain: [...chain] });
    },
    UpdateExpression(n: any, _: any, chain: any[]) {
      mutations.push({ node: n.argument, chain: [...chain] });
    },
    UnaryExpression(n: any, _: any, chain: any[]) {
      if (n.operator === 'delete') mutations.push({ node: n.argument, chain: [...chain] });
    },
    CallExpression(n: any, _: any, chain: any[]) {
      // A method call or passing the table to unknown code may change its keys.
      if (n.callee.type === 'MemberExpression')
        escapes.push({ node: n.callee.object, chain: [...chain] });
      for (const arg of n.arguments) escapes.push({ node: arg, chain: [...chain] });
    },
  });
  function binding(name: string, chain: any[]) {
    for (const scope of [...chain].reverse()) {
      const names = bindings.get(scope);
      if (names?.has(name)) return names.get(name);
    }
  }
  function rootBinding(n: any, chain: any[]) {
    while (n?.type === 'MemberExpression') n = n.object;
    return n?.type === 'Identifier' ? binding(n.name, chain) : undefined;
  }
  const mutable = new Set<any>();
  function markMutable(mutation: { node: any; chain: any[] }) {
    let d = rootBinding(mutation.node, mutation.chain);
    // Follow aliases back to their source table, including selected branches.
    while (d && !mutable.has(d)) {
      mutable.add(d);
      d = rootBinding(d.init, chains.get(d)!);
    }
  }
  for (const mutation of mutations) markMutable(mutation);
  for (const escape of escapes) {
    const values = resolve(escape.node, escape.chain);
    if (
      values?.length &&
      values.every(
        (v) => v.type === 'Literal' && ['number', 'string', 'boolean'].includes(typeof v.value),
      )
    )
      continue;
    markMutable(escape);
  }
  function entries(n: any): Array<{ key: string | number; value: any }> | undefined {
    if (
      n?.type === 'ArrayExpression' &&
      n.elements.length <= 100 &&
      n.elements.every((e: any) => e && e.type !== 'SpreadElement')
    )
      return n.elements.map((value: any, key: number) => ({ key, value }));
    if (n?.type !== 'ObjectExpression' || n.properties.length > 100) return;
    const result: Array<{ key: string; value: any }> = [];
    for (const p of n.properties) {
      const key = p.key?.name ?? p.key?.value;
      if (
        p.type !== 'Property' ||
        p.computed ||
        p.method ||
        p.kind !== 'init' ||
        typeof key !== 'string' ||
        ['__proto__', 'constructor', 'prototype'].includes(key) ||
        result.some((e) => e.key === key)
      )
        return;
      result.push({ key, value: p.value });
    }
    return result;
  }
  function resolve(n: any, chain: any[], seen = new Set<any>()): any[] | undefined {
    if (!n || seen.has(n) || seen.size > 20) return;
    seen = new Set(seen).add(n);
    if (['ObjectExpression', 'ArrayExpression', 'Literal'].includes(n.type)) return [n];
    if (n.type === 'Identifier') {
      const d = binding(n.name, chain);
      return constants.has(d) && !mutable.has(d)
        ? resolve(d.init, chains.get(d)!, seen)
        : undefined;
    }
    if (n.type !== 'MemberExpression') return;
    const bases = resolve(n.object, chain, seen);
    if (!bases) return;
    const key = n.computed
      ? n.property.type === 'Literal'
        ? n.property.value
        : undefined
      : n.property.name;
    const values: any[] = [];
    for (const base of bases) {
      const table = entries(base);
      if (!table?.length) return;
      const selected =
        key === undefined ? table : table.filter((e) => String(e.key) === String(key));
      if (!selected.length) return;
      for (const entry of selected) {
        // Nested table branches must themselves be literals. Resolving a name
        // here in the caller's scope could misbind a shadowed table member.
        if (!['ObjectExpression', 'ArrayExpression', 'Literal'].includes(entry.value.type)) return;
        const found = resolve(entry.value, chain, seen);
        if (!found) return;
        values.push(...found);
        if (values.length > 100) return;
      }
    }
    return values;
  }
  return (declaration: any, key: string, initial: SceneScalar): SceneChoice[] | undefined => {
    let choices: SceneChoice[] | undefined;
    for (const access of accesses) {
      const field = access.property,
        chain = chains.get(access)!;
      if (
        field.type !== 'MemberExpression' ||
        field.object.type !== 'Identifier' ||
        (field.computed ? field.property.value : field.property.name) !== key ||
        binding(field.object.name, chain) !== declaration
      )
        continue;
      const tables = resolve(access.object, chain);
      if (!tables) continue;
      for (const table of tables) {
        const fields = entries(table);
        if (!fields?.length) continue;
        const candidates = fields
          .map((entry) => {
            const title = entries(entry.value)?.find((e) =>
              ['title', 'label', 'name'].includes(String(e.key)),
            )?.value;
            return {
              value: entry.key,
              label:
                title?.type === 'Literal' && typeof title.value === 'string'
                  ? title.value.slice(0, 100)
                  : String(entry.key),
            };
          })
          .filter((c) => typeof c.value === typeof initial);
        choices = choices
          ? choices.filter((c) => candidates.some((v) => v.value === c.value))
          : candidates;
      }
    }
    return choices?.some((c) => c.value === initial) ? choices : undefined;
  };
}
