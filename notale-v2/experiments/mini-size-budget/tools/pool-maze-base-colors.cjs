const postcss = require('/tmp/notale-size-tools/node_modules/postcss');
const csso = require('/tmp/notale-maze-css-opt/node_modules/csso');
module.exports = css => {
  // Insert at the first occurrence so equal-specificity fade declarations keep
  // their later position. Moving these groups to the end changes fact hover.
  for (const [prop, value] of [['color', '#1c1246'], ['border', 'var(--b)'], ['cursor', 'pointer'], ['border-bottom', 'none'], ['border', '0'], ['font-style', 'italic'], ['line-height', '1.15'], ['font-weight', '500'], ['padding', '.25rem']]) {
    const root = postcss.parse(css), declarations = [];
    root.walkDecls(prop, declaration => {
      if (declaration.value === value && !declaration.important && declaration.parent.type === 'rule' && declaration.parent.parent.type === 'root') declarations.push(declaration);
    });
    if (declarations.length < 2) continue;
    const selectors = [...new Set(declarations.flatMap(d => d.parent.selectors))];
    const group = postcss.rule({selector: selectors.join(',')}).append({prop, value});
    declarations[0].parent.before(group);
    for (const declaration of declarations) {
      const rule = declaration.parent;
      declaration.remove();
      if (!rule.nodes.length) rule.remove();
    }
    const next = csso.minify(root.toString()).css;
    if (next.length < css.length) css = next;
  }
  return css;
};
