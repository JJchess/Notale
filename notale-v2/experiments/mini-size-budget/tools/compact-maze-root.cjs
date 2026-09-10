const postcss = require('/tmp/notale-size-tools/node_modules/postcss');
module.exports = (css, externalText = '') => {
  const root = postcss.parse(css), definitions = new Map();
  root.walkDecls(d => {
    if (d.prop.startsWith('--')) {
      if (!definitions.has(d.prop)) definitions.set(d.prop, []);
      definitions.get(d.prop).push(d);
    }
  });
  for (const [name, declarations] of definitions) {
    if (declarations.length !== 1 || declarations[0].parent.selector !== ':root') continue;
    if (externalText.includes(name) || css.includes('var(' + name + ',')) continue;
    const declaration = declarations[0], reference = 'var(' + name + ')';
    const count = root.toString().split(reference).length - 1;
    if (declaration.toString().length + 1 + count * (reference.length - declaration.value.length) <= 0) continue;
    if (/var\(/.test(declaration.value)) continue;
    root.walkDecls(d => { if (d !== declaration) d.value = d.value.split(reference).join(declaration.value); });
    declaration.remove();
  }
  const first = root.nodes.find(r => r.type === 'rule' && r.selector === ':root');
  for (const rule of [...root.nodes]) {
    if (rule === first || rule.type !== 'rule' || rule.selector !== ':root') continue;
    const names = new Set(rule.nodes.filter(d => d.type === 'decl').map(d => d.prop));
    const between = root.nodes.slice(root.nodes.indexOf(first) + 1, root.nodes.indexOf(rule));
    let conflict = false;
    for (const node of between) node.walkDecls?.(d => { if (names.has(d.prop)) conflict = true; });
    if (!conflict) { first.append(...rule.nodes); rule.remove(); }
  }
  root.walkDecls(d => {
    if (d.prop === '--s') d.value = d.value.replace('"National"', 'National');
    if (d.prop === '--f') d.value = d.value.replace('"Canela"', 'Canela');
  });
  // Every heading in this page has its own weight; h1-h3 also have explicit
  // component margins. Table cells inherit wrapping, and details is block.
  root.walkRules(rule => {
    const has = (prop, value) => rule.nodes.some(d => d.prop === prop && d.value === value);
    for (const declaration of [...rule.nodes]) {
      if (rule.selector === 'html' && declaration.prop === 'line-height' && declaration.value === '1.15' ||
          rule.selector === 'img' && declaration.prop === 'height' && declaration.value === 'auto' ||
          rule.selector === 'summary' && declaration.prop === 'display' && declaration.value === 'list-item' ||
          rule.selector === 'button,select' && declaration.prop === 'background-color' && declaration.value === '#cacaca') declaration.remove();
    }
    if (rule.selector === 'button:disabled:hover') rule.remove();
    if (has('overflow', 'visible')) rule.selectors = rule.selectors.filter(s => s !== 'button');
    if (has('display', 'inline-block')) rule.selectors = rule.selectors.filter(s => s !== 'select');
    // The universal author reset already covers these elements; none has a
    // competing component margin. Retain paragraph and heading overrides.
    if (has('margin', '0') && rule.selectors.includes('*')) rule.selectors = rule.selectors.filter(s => !['#P', '.T', 'button', 'select', '.D h2'].includes(s));
    if (has('font-weight', '500')) rule.selectors = rule.selectors.filter(s => !['h1', 'h2', 'h3', 'h4'].includes(s));
    if (has('margin', '16px 0')) rule.selectors = rule.selectors.filter(s => !['h1', 'h2', 'h3'].includes(s));
    if (has('overflow-wrap', 'break-word')) rule.selectors = rule.selectors.filter(s => !['td', 'th'].includes(s));
    // The story icon is a replaced img with no flex items; img already sets block.
    if (has('display', 'flex')) rule.selectors = rule.selectors.filter(s => s !== '.N');
    if (has('display', 'block')) rule.selectors = rule.selectors.filter(s => s !== 'details');
    if (!rule.selectors.length || !rule.nodes.length) rule.remove();
  });
  // These color-only components have no background image or layer settings.
  // Keep the transition property background-color: only shorten declarations.
  const colorOnly = new Set(['body', '::selection', '.L', '.y:hover .L', '.f button.j', '.d .e']);
  root.walkDecls('background-color', declaration => {
    if (colorOnly.has(declaration.parent.selector)) declaration.prop = 'background';
  });
  // The activity card, geographic tracker, and generated h3 headings each
  // occur in exactly one section. Their remaining selectors identify them.
  root.walkRules(rule=>{
    rule.selectors=rule.selectors.map(selector=>selector
      .replace(/^#P \.(p|y)(?=$|[: .])/,'.$1.$1')
      .replace(/^#M (?=h4(?:$|[: .]))/,'')
      .replace(/^#M (?=\.v\b)/,'')
      .replace(/^#D (?=\.s \.W\b)/,'')
      .replace(/^#G (?=h3(?:$|[: .]))/,''));
    // Keep the activity background above the generic button:hover rule.
    if(rule.selector==='.v'){
      const background=rule.nodes.find(d=>d.prop==='background');
      if(background){rule.after(postcss.rule({selector:'.v.v'}).append(background.clone()));background.remove()}
    }
  });
  // The card's final margin-bottom replaces its earlier shorthand component.
  const cardMargins=[];
  root.walkDecls(d=>{if(/^margin(?:-|$)/.test(d.prop)&&d.parent.selectors?.includes('.v'))cardMargins.push(d)});
  if(cardMargins.length===2){
    const [margin,bottom]=cardMargins;
    if(margin.prop==='margin'&&margin.value==='0 auto 5rem'&&bottom.prop==='margin-bottom'&&bottom.value==='28px'&&margin.important===bottom.important){
      margin.value='0 auto 28px';const rule=bottom.parent;bottom.remove();if(!rule.nodes.length)rule.remove();
    }
  }
  // The fixed 1600×900 page always confines scrolling to its inner regions.
  root.walkRules(rule=>{if(rule.selector==='body.υ')rule.selector='body'});
  root.walkAtRules('media',rule=>{
    if(rule.params.replace(/\s/g,'')==='screenand(prefers-reduced-motion:no-preference)')rule.params='screen and (not (prefers-reduced-motion))';
  });
  root.walkDecls(d=>{
    if(d.prop==='border-bottom'&&d.value==='none')d.value='0';
    if(d.prop==='stroke-width')d.value=d.value.replace(/px$/,'');
    d.value=d.value.replace(/\btransparent\b/g,'#0000');
  });
  // The authored fonts and explicit feature settings render identically
  // with the default text-rendering hint and default disabled onum feature.
  root.walkDecls(d=>{
    if(d.parent.selector!=='body')return;
    if(d.prop==='text-rendering'&&d.value==='optimizelegibility')d.remove();
    if(d.prop==='font-feature-settings')d.value=d.value.replace(/,"onum"0(?=,|$)/,'');
  });
  root.walkDecls('grid-template-columns',d=>{d.value=d.value.replace(/repeat\(([23]),1fr\)/g,(_,n)=>Array(+n).fill('1fr').join(' '))});
  // These are the browser defaults; the standalone page has no other sheet.
  // Keep the forced-colors reset, which overrides Firefox's thin scrollbar.
  root.walkAtRules('supports',rule=>{
    if(rule.params.replace(/\s/g,'')==='selector(::-webkit-scrollbar)')
      for(const child of [...rule.nodes])if(child.type==='rule'&&child.selector==='*'&&child.nodes.every(d=>d.value==='auto'&&['scrollbar-width','scrollbar-color'].includes(d.prop)))child.remove();
  });
  // Unknown WebKit pseudo-element rules are ignored. The later negative
  // support branch still overrides the universal defaults in Firefox.
  // Existing fallback colors precede color-mix; unsupported values are ignored.
  root.walkAtRules('supports',rule=>{
    const condition=rule.params.replace(/\s/g,'');
    if(condition==='selector(::-webkit-scrollbar)'||condition==='(color:color-mix(insrgb,black,transparent))')rule.replaceWith(...rule.nodes);
  });
  // These unique components need no ancestor or duplicate-class specificity
  // for layout. Keep the stronger color/background rules above button:hover.
  root.walkRules(rule=>{
    if(rule.nodes.every(d=>!['color','background','background-color'].includes(d.prop)))
      rule.selectors=rule.selectors.map(s=>s.replace(/\.(p|y)\.\1(?=$|[: .])/g,'.$1'));
    rule.selectors=rule.selectors.map(s=>s.replace(/^h4\.θ$/,'.θ').replace(/^\.b \.q svg$/,'.q svg'));
  });
  // Fold the final intro font sizes into their existing font shorthand.
  root.walkRules(rule=>{
    for(const [selector,oldSize,newSize] of [['.T a','14px','12px'],['.T p','16px','14px']]){
      if(rule.selector===selector)for(const d of rule.nodes)if(d.prop==='font')d.value=d.value.replace(oldSize,newSize);
      if(rule.nodes.length===1&&rule.nodes[0].prop==='font-size'&&rule.nodes[0].value===newSize){
        rule.selectors=rule.selectors.filter(s=>s!==selector);if(!rule.selectors.length)rule.remove();
      }
    }
  });
  // These exact selectors have disjoint declarations and no intervening
  // competing component declarations; generic resets have lower specificity.
  for(const selector of ['body','#P','.b','.η']){
    const rules=root.nodes.filter(r=>r.type==='rule'&&r.selector===selector);
    const seen=new Set();for(const r of rules)for(const d of r.nodes){if(seen.has(d.prop))throw Error('Duplicate property while merging '+selector);seen.add(d.prop)}
    if(rules.length>1)for(const rule of rules.slice(1)){rules[0].append(...rule.nodes);rule.remove()}
  }
  return root.toString();
};
