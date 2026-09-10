const postcss = require('/tmp/notale-size-tools/node_modules/postcss');
const assert = require('assert');

// Only commute unrelated declaration families. Broad families deliberately
// exclude some safe opportunities rather than risk crossing a shorthand reset.
const family = property => {
  if (/^(font|line-height)/.test(property)) return 'font';
  if (/^(top|right|bottom|left|inset)(-|$)/.test(property)) return 'inset';
  if (/^(grid|gap|row-gap|column-gap)(-|$)/.test(property)) return 'grid';
  if (/^(transform|translate|rotate|scale)(-|$)/.test(property)) return 'transform';
  const prefix = property.split('-')[0];
  return ['border','margin','padding','background','overflow','flex','text','column','animation','transition','outline','scrollbar'].includes(prefix) ? prefix : property;
};
const eligible = rule => rule?.type === 'rule' && rule.nodes.length &&
  rule.nodes.every(d => d.type === 'decl' && d.prop !== 'all' && !d.prop.startsWith('--'));
const families = rule => new Set(rule.nodes.map(d => family(d.prop)));
const overlap = (a,b) => [...a].some(x=>b.has(x));

// For each declaration family, preserve the complete ordered sequence of
// assignments. Adjacent identical assignments may union their selectors.
function canonical(root) {
  const result = new Map();
  let context = 0;
  for (const rule of root.nodes) {
    if (rule.type !== 'rule') { context++; continue; }
    for (const d of rule.nodes) {
      if (d.type !== 'decl') continue;
      const f=family(d.prop),key=JSON.stringify([context,d.prop,d.value,!!d.important]);
      if(!result.has(f))result.set(f,[]);
      const entries=result.get(f);
      if(entries.at(-1)?.key!==key)entries.push({key,selectors:new Set()});
      for(const selector of rule.selectors)entries.at(-1).selectors.add(selector);
    }
  }
  return [...result].sort(([a],[b])=>a.localeCompare(b)).map(([f,entries])=>[f,entries.map(e=>[e.key,[...e.selectors].sort()])]);
}

module.exports = (css, tokens) => {
  const root=postcss.parse(css),set=new Set(tokens);
  // Each alternative is one class, so expanding :is preserves specificity.
  // Expose these selectors to intersections with neighboring layout groups.
  let expandedIs=0;
  root.walkRules(rule=>{
    rule.selectors=rule.selectors.flatMap(selector=>{
      const match=selector.match(/:is\(([^()]+)\)/);
      if(!match)return [selector];
      const alternatives=match[1].split(',');
      if(!alternatives.every(s=>/^\.[\p{L}\d_-]+$/u.test(s)))return [selector];
      expandedIs++;
      return alternatives.map(s=>selector.replace(match[0],s));
    });
  });
  const before=canonical(root);
  const fragments=tokens.filter(t=>!t.endsWith(':')).sort((a,b)=>b.length-a.length);
  const length=value=>fragments.reduce((v,t)=>v.split(t).join('xxxx'),value).length;
  const cost=rule=>length(rule.selector)+2+rule.nodes.reduce((n,d)=>n+(set.has(d.prop+':')?4:d.prop.length+1)+length(d.value)+(d.important?10:0)+1,0)-1;
  let merges=0,estimatedSaved=0;
  for(let pass=0;pass<100;pass++){
    let best;
    for(let i=0;i<root.nodes.length;i++){
      const a=root.nodes[i];if(!eligible(a))continue;
      const fa=families(a),crossed=new Set();
      for(let j=i+1;j<root.nodes.length;j++){
        const b=root.nodes[j];if(!eligible(b))break;
        const fb=families(b);
        if(!overlap(fa,fb)&&!overlap(fb,crossed)){
          const common=a.selectors.filter(s=>b.selectors.includes(s));
          if(common.length){
            const remainingA=a.selectors.filter(s=>!common.includes(s)),remainingB=b.selectors.filter(s=>!common.includes(s));
            const merged=a.clone({selector:common.join(','),nodes:[]});
            merged.append(...a.nodes.map(d=>d.clone()),...b.nodes.map(d=>d.clone()));
            const ra=remainingA.length?a.clone({selector:remainingA.join(',')}):null,rb=remainingB.length?b.clone({selector:remainingB.join(',')}):null;
            const saved=cost(a)+cost(b)-cost(merged)-(ra?cost(ra):0)-(rb?cost(rb):0);
            if(saved>0&&(!best||saved>best.saved))best={a,b,merged,ra,rb,saved};
          }
        }
        for(const f of fb)crossed.add(f);
      }
    }
    if(!best)break;
    const {a,b,merged,ra,rb,saved}=best;
    a.replaceWith(...(ra?[ra,merged]:[merged]));
    if(rb)b.replaceWith(rb);else b.remove();
    merges++;estimatedSaved+=saved;
  }
  assert.deepStrictEqual(canonical(root),before,'Declaration-family cascade changed');
  return {css:root.toString(),merges,expandedIs,estimatedSaved,canonicalCascadeEqual:true};
};
