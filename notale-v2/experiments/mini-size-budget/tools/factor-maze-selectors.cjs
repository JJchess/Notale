// Factor only simple tails with identical specificity. Declaration order and
// selector matching remain unchanged; :is() contributes that same specificity.
const postcss = require('/tmp/notale-size-tools/node_modules/postcss');
module.exports = css => {
  const root = postcss.parse(css);
  root.walkRules(rule => {
    if (rule.parent.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
    // These shorthands end in the existing font-family variable. Fold later
    // size/line-height overrides into them without resetting any other field.
    const font = rule.nodes.find(d => d.prop === 'font');
    const parts = font?.value.match(/^(.*?)(\d+(?:\.\d+)?px)(?:\/([\d.]+))? (var\(--[\w-]+\))$/);
    if (parts) {
      let size = parts[2], height = parts[3];
      for (const declaration of [...rule.nodes].slice(rule.nodes.indexOf(font) + 1)) {
        if (declaration.important !== font.important) continue;
        if (declaration.prop === 'font-size' && /^\d+(?:\.\d+)?px$/.test(declaration.value)) {
          size = declaration.value;
          declaration.remove();
        }
        if (declaration.prop === 'line-height' && /^[\d.]+$/.test(declaration.value)) {
          height = declaration.value;
          declaration.remove();
        }
      }
      font.value = parts[1] + size + (height ? '/' + height : '') + ' ' + parts[4];
    }
    let selectors = rule.selectors;
    for (const mode of ['prefix', 'tail']) {
      const groups = new Map();
      for (const [index, selector] of selectors.entries()) {
        const match = mode === 'prefix'
          ? selector.match(/^(.*[ >+~])([.#][\w-]+(?::hover)?)$/)
          : selector.match(/^([.#][\w-]+)([ >+~].+)$/);
        if (!match) continue;
        const variable = match[mode === 'prefix' ? 2 : 1];
        const fixed = match[mode === 'prefix' ? 1 : 2];
        const specificity = [variable.startsWith('#') ? 1 : 0, variable.startsWith('.') ? 1 : 0, variable.endsWith(':hover') ? 1 : 0].join();
        const key = fixed + '\n' + specificity;
        if (!groups.has(key)) groups.set(key, { fixed, entries: [] });
        groups.get(key).entries.push({ index, variable });
      }
      const replacements = new Map(), removed = new Set();
      for (const { fixed, entries } of groups.values()) {
        const alternatives = ':is(' + entries.map(e => e.variable).join(',') + ')';
        const combined = mode === 'prefix' ? fixed + alternatives : alternatives + fixed;
        if (entries.length < 2 || combined.length >= entries.map(e => selectors[e.index]).join(',').length) continue;
        replacements.set(entries[0].index, combined);
        for (const e of entries.slice(1)) removed.add(e.index);
      }
      selectors = selectors.flatMap((s, i) => removed.has(i) ? [] : [replacements.get(i) || s]);
    }
    rule.selectors = selectors;
  });
  return root.toString();
};
