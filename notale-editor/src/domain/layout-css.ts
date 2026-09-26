import postcss, { type Root, type ChildNode, type Node } from 'postcss';
import selectorParser from 'postcss-selector-parser';
import valueParser from 'postcss-value-parser';
import { posix } from 'node:path';
import { invariant, DomainError } from './model.js';
import { rebaseCss } from './urls.js';
export type Stylesheets = Readonly<Record<string, string>>;
export function parseCss(css: string): Root {
  try {
    return postcss.parse(css);
  } catch (error) {
    throw new DomainError(
      'INVALID_CSS',
      error instanceof Error ? error.message : 'Invalid layout CSS',
    );
  }
}
function resource(url: string, from: string) {
  invariant(
    !/^(?:[a-z][\w+.-]*:|\/)/i.test(url),
    'EXTERNAL_STYLESHEET',
    'Shared-layout stylesheets must be imported into the document resource bundle',
  );
  let path = url.split(/[?#]/)[0];
  try {
    path = decodeURIComponent(path);
  } catch {}
  return posix.normalize(posix.join(posix.dirname(from), path));
}
export function expandCss(
  css: string,
  from: string,
  to: string,
  sheets: Stylesheets,
  stack: string[] = [],
): Root {
  invariant(stack.length < 30, 'CSS_IMPORT_DEPTH', 'Stylesheet imports exceed 30 levels');
  const root = parseCss(css);
  root.walkAtRules(/^import$/i, (rule) => {
    const params = valueParser(rule.params),
      nodes = params.nodes.filter((n) => n.type !== 'space' && n.type !== 'comment'),
      first = nodes.shift();
    const url =
      first?.type === 'string'
        ? first.value
        : first?.type === 'function' && first.value === 'url'
          ? valueParser.stringify(first.nodes).replace(/^["']|["']$/g, '')
          : undefined;
    invariant(url, 'INVALID_CSS_IMPORT', 'Stylesheet import needs a URL');
    const path = resource(url, from);
    invariant(!stack.includes(path), 'CSS_IMPORT_CYCLE', `Cyclic stylesheet import: ${path}`);
    invariant(
      sheets[path] !== undefined,
      'MISSING_STYLESHEET',
      `Stylesheet ${path} is unavailable`,
    );
    let children: ChildNode[] = expandCss(sheets[path], path, to, sheets, [...stack, path]).nodes;
    const wrappers: { name: string; params: string }[] = [];
    if (nodes[0]?.type === 'word' && nodes[0].value === 'layer') {
      nodes.shift();
      wrappers.push({ name: 'layer', params: '' });
    } else if (nodes[0]?.type === 'function' && nodes[0].value === 'layer') {
      const n = nodes.shift() as valueParser.FunctionNode;
      wrappers.push({ name: 'layer', params: valueParser.stringify(n.nodes) });
    }
    if (nodes[0]?.type === 'function' && nodes[0].value === 'supports') {
      const n = nodes.shift() as valueParser.FunctionNode;
      wrappers.push({ name: 'supports', params: `(${valueParser.stringify(n.nodes)})` });
    }
    // Keep original spaces in the trailing media query by taking its source suffix.
    if (nodes.length)
      wrappers.push({ name: 'media', params: rule.params.slice(nodes[0].sourceIndex) });
    for (const wrapper of wrappers.reverse()) {
      const at = postcss.atRule(wrapper);
      at.append(children);
      children = [at];
    }
    rule.replaceWith(...children);
  });
  // Imports above already rebased their own declarations; mark before recursion.
  root.walkDecls((decl) => {
    if (!(decl as any).__notaleRebased) {
      decl.value = rebaseCss(decl.value, from, to);
      (decl as any).__notaleRebased = true;
    }
  });
  return root;
}
export function linkedCss(url: string, from: string, to: string, sheets: Stylesheets, media = '') {
  const path = resource(url, from);
  invariant(sheets[path] !== undefined, 'MISSING_STYLESHEET', `Stylesheet ${path} is unavailable`);
  const root = expandCss(sheets[path], path, to, sheets, [path]);
  if (!media) return root.toString();
  return `@media ${media}{${root.toString()}}`;
}
export function scopeCss(
  css: string,
  scope: string,
  ids: ReadonlyMap<string, string>,
  inlineStyles: string[] = [],
) {
  const root = parseCss(css),
    names = new Map<string, string>(),
    fonts = new Map<string, string>();
  root.walkAtRules((rule) => {
    if (/keyframes$/i.test(rule.name)) {
      const name = rule.params.replace(/^["']|["']$/g, '');
      names.set(name, `${scope}-${name}`);
      rule.params = names.get(name)!;
    }
    if (rule.name.toLowerCase() === 'font-face')
      rule.walkDecls('font-family', (decl) => {
        const name = decl.value.replace(/^["']|["']$/g, '');
        fonts.set(name, `${scope}-${name}`);
        decl.value = JSON.stringify(fonts.get(name));
      });
    if (rule.name.toLowerCase() === 'layer' && rule.params)
      rule.params = rule.params
        .split(',')
        .map((name) => `${scope}-${name.trim()}`)
        .join(',');
  });
  root.walkRules((rule) => {
    let parent: Node | undefined = rule.parent,
      nested = false;
    while (parent) {
      if (parent.type === 'atrule' && 'name' in parent && /keyframes$/i.test(String(parent.name)))
        return;
      if (parent.type === 'rule') nested = true;
      parent = parent.parent;
    }
    // Native nested rules are already contained by their scoped outer rule.

    rule.selector = selectorParser((selectors) => {
      selectors.walkIds((id) => {
        if (ids.has(id.value)) id.value = ids.get(id.value)!;
      });
      selectors.each((selector) => {
        if (nested) return;
        const prefix = selectorParser.attribute({
          attribute: 'data-notale-layout-scope',
          operator: '=',
          value: scope,
          quoteMark: '"',
          raws: {},
        });
        const first = selector.nodes[0];
        if (
          first &&
          ((first.type === 'tag' && ['html', 'body'].includes(first.value)) ||
            (first.type === 'pseudo' && [':root', ':scope'].includes(first.value)))
        ) {
          first.replaceWith(prefix);
          const nodes = selector.nodes;
          if (
            nodes[1]?.type === 'combinator' &&
            nodes[2]?.type === 'tag' &&
            nodes[2].value === 'body'
          ) {
            nodes[2].remove();
            nodes[1].remove();
          }
        } else {
          selector.prepend(selectorParser.combinator({ value: ' ' }));
          selector.prepend(prefix);
        }
      });
    }).processSync(rule.selector);
  });
  const rewrite = (sheet: Root) =>
    sheet.walkDecls((decl) => {
      decl.value = rebaseCss(decl.value, 'page.html', 'page.html', ids);
      if (/^font(?:-family)?$/i.test(decl.prop)) {
        const value = valueParser(decl.value),
          nodes = value.nodes,
          options = [...fonts].sort((a, b) => b[0].length - a[0].length);
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          if (node.type === 'string') {
            const found = options.find(([name]) => name.toLowerCase() === node.value.toLowerCase());
            if (found) node.value = found[1];
            continue;
          }
          if (node.type !== 'word') continue;
          for (const [name, replacement] of options) {
            const words = name.toLowerCase().split(/\s+/);
            let at = i,
              matched = true,
              last = i;
            for (const word of words) {
              while (nodes[at]?.type === 'space' || nodes[at]?.type === 'comment') at++;
              const candidate = nodes[at];
              if (candidate?.type !== 'word' || candidate.value.toLowerCase() !== word) {
                matched = false;
                break;
              }
              last = at++;
            }
            let after = last + 1;
            while (nodes[after]?.type === 'space' || nodes[after]?.type === 'comment') after++;
            if (matched && nodes[after]?.type !== 'word') {
              nodes.splice(i, last - i + 1, ...valueParser(JSON.stringify(replacement)).nodes);
              break;
            }
          }
        }
        decl.value = value.toString();
        return;
      }
      const mapping = /^(?:-webkit-)?animation(?:-name)?$/i.test(decl.prop)
        ? names
        : /^font(?:-family)?$/.test(decl.prop)
          ? fonts
          : undefined;
      if (mapping) {
        const value = valueParser(decl.value);
        value.walk((n) => {
          if ((n.type === 'word' || n.type === 'string') && mapping.has(n.value))
            n.value = mapping.get(n.value)!;
        });
        decl.value = value.toString();
      }
    });
  rewrite(root);
  const styles = inlineStyles.map((style) => {
    if (!style) return '';
    const sheet = parseCss('x{' + style + '}');
    rewrite(sheet);
    const rule = sheet.first as postcss.Rule;
    return rule.nodes.map((n) => n.toString()).join(';');
  });
  return { css: root.toString(), styles };
}
