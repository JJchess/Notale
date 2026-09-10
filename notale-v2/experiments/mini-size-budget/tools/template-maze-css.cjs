// Plain CSS template interpolation, analogous to the inline HTML helpers.
// Property names remain explicit strings, with no decoder or encoded payload.
const fs = require('fs'), postcss = require('/tmp/notale-size-tools/node_modules/postcss');
const terser = require('/tmp/notale-size-tools/node_modules/terser');
const babel = require('/tmp/notale-waveform-build/node_modules/@babel/core');
(async () => {
  if (process.env.MAZE_SKIP_CSS_TEMPLATE === '1') return;
  const minimumGain = Number(process.env.MAZE_CSS_TEMPLATE_GAIN ?? 0);
  const base = 'experiments/mini-size-budget/', file = base + 'combined/state-maze-stories/index.html';
  const html = fs.readFileSync(file, 'utf8');
  let css = html.match(/<style>(.*?)<\/style>/s)?.[1];
  if (!css) throw Error('Build the static stylesheet before applying CSS templates');
  // These root tokens have no element-local overrides or script consumers.
  // Expand them into ordinary inline CSS constants; keep the media-dependent --t.
  const staticRoot = postcss.parse(css), rootValues = new Map();
  staticRoot.walkDecls(d=>{
    if(['--d','--e','--g','--s','--f'].includes(d.prop)){
      if(rootValues.has(d.prop)||d.parent.selector!==':root')throw Error('Unexpected root token override');
      rootValues.set(d.prop,d);
    }
  });
  for(const [name,d] of rootValues){
    const reference='var('+name+')';
    if(html.replace(/<style>.*?<\/style>/s,'').includes(name))throw Error('Root token has a script consumer');
    staticRoot.walkDecls(other=>{if(other!==d)other.value=other.value.split(reference).join(d.value)});
    d.remove();
  }
  css=staticRoot.toString();
  function collect(css) {
  const root = postcss.parse(css), groups = new Map();
  function occurrence(token, offset) {
    if (css.slice(offset, offset + token.length) !== token) throw Error('CSS token offset differs');
    if (!groups.has(token)) groups.set(token, []);
    groups.get(token).push(offset);
  }
  root.walkDecls(d => {
    const token = d.prop + ':', offset = d.source.start.offset;
    if (css.slice(offset, offset + token.length) !== token) return;
    occurrence(token, offset);
    const occupied=new Set();
    for(const value of [...rootValues.values()].map(d=>d.value).sort((a,b)=>b.length-a.length)){
      let start=0,index;
      while((index=d.value.indexOf(value,start))>=0){
        if(Array.from({length:value.length},(_,i)=>index+i).every(i=>!occupied.has(i))){
          occurrence(value,offset+token.length+index);
          for(let i=index;i<index+value.length;i++)occupied.add(i);
        }
        start=index+value.length;
      }
    }
    for (const match of d.value.matchAll(/color-mix\(in srgb,|translateY\(|minmax\(0,1fr\)|var\(--[\w-]+\)|#[\da-f]{6,8}\b|\b(?:transparent|currentcolor|center|inherit|solid|ease-in-out)\b/gi)) {
      if(Array.from({length:match[0].length},(_,i)=>match.index+i).every(i=>!occupied.has(i)))
        occurrence(match[0], offset + token.length + match.index);
    }
  });
  root.walkRules(rule => {
    for (const match of rule.selector.matchAll(/:focus-visible\b|:hover\b/g)) occurrence(match[0], rule.source.start.offset + match.index);
  });
  // Compare full values against their already shared color/function pieces.
  // Choose only substitutions that reduce the complete constant-list estimate.
  const values=new Map();
  root.walkDecls(d=>{
    const offset=d.source.start.offset+d.prop.length+1,value=d.value;
    if(value.length<=4||groups.has(value)||css.slice(offset,offset+value.length)!==value)return;
    if(!values.has(value))values.set(value,[]);
    values.get(value).push(offset);
  });
  const estimate=entries=>profitable(entries).reduce((n,[value,offsets])=>n+value.length+2-offsets.length*(value.length-4),css.length);
  let total=estimate(groups);
  for(const [value,offsets] of [...values].sort((a,b)=>b[0].length*b[1].length-a[0].length*a[1].length)){
    if(offsets.length<2)continue;
    const next=new Map([...groups].map(([token,positions])=>[token,positions.filter(position=>!offsets.some(offset=>position>=offset&&position+token.length<=offset+value.length))]));
    next.set(value,offsets);
    const size=estimate(next);
    if(size<total){groups.clear();for(const entry of next)groups.set(...entry);total=size}
  }
  return groups;
  }
  const profitable = groups => [...groups].filter(([token, offsets]) => offsets.length * (token.length - 4) - token.length - 5 > minimumGain);
  let groups = collect(css);
  const restructured = require('./restructure-maze-css.cjs')(css, profitable(groups).map(([token])=>token));
  css = restructured.css;
  groups = collect(css);
  // Reuse literal selector prefixes through the same ordinary CSS template.
  const selectorGroups = new Map();
  postcss.parse(css).walkRules(rule => {
    let local = 0;
    for (const selector of rule.selector.split(',')) {
      const offset = rule.source.start.offset + local;
      for (let end = 1; end <= selector.length; end++) {
        if (end !== selector.length && selector[end - 1] !== ' ' && !'.:>'.includes(selector[end])) continue;
        const token = selector.slice(0, end);
        if (token.length < 6) continue;
        if (!selectorGroups.has(token)) selectorGroups.set(token, []);
        selectorGroups.get(token).push(offset);
      }
      local += selector.length + 1;
    }
  });
  const properties = profitable(groups), occupied = new Set();
  for(const [token,offsets] of properties) for(const offset of offsets)
    for(let i=offset;i<offset+token.length;i++)occupied.add(i);
  for(const [token,offsets] of profitable(selectorGroups).sort((a,b)=>
    (b[0].length-4)*b[1].length-b[0].length-((a[0].length-4)*a[1].length-a[0].length))){
    const available=offsets.filter(offset=>Array.from({length:token.length},(_,i)=>offset+i).every(i=>!occupied.has(i)));
    if(available.length*(token.length-4)-token.length-5<=minimumGain)continue;
    properties.push([token,available]);
    for(const offset of available)for(let i=offset;i<offset+token.length;i++)occupied.add(i);
  }
  const replacements = properties.flatMap(([token, offsets], i) => offsets.map(offset => ({offset, token, name: 'css_' + i})));
  replacements.sort((a, b) => a.offset - b.offset);
  const literal = value => value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  let template = '', restored = '', cursor = 0;
  for (const {offset, token, name} of replacements) {
    const chunk = css.slice(cursor, offset);
    template += literal(chunk) + '${' + name + '}';
    restored += chunk + token;
    cursor = offset + token.length;
  }
  template += literal(css.slice(cursor));
  restored += css.slice(cursor);
  if (restored !== css) throw Error('CSS template reconstruction differs');
  if(properties.some(([token])=>token.includes('|')))throw Error('CSS constant contains a list separator');
  let setup = 'const [' + properties.map((_, i) => 'css_' + i).join(',') + ']=' +
    JSON.stringify(properties.map(([token])=>token).join('|')) + '.split("|");';
  // Measured profitable declaration sharing; avoid repeating candidate searches.
  const displayIndex=properties.findIndex(([token])=>token==='display:');
  const displayBlock='${css_'+displayIndex+'}block';
  if(displayIndex>=0&&template.split(displayBlock).length>3){
    setup+='const css_display_block=`'+displayBlock+'`;';
    template=template.split(displayBlock).join('${css_display_block}');
  }
  // One ordinary CSS helper shares equal width/height declarations.
  const widthIndex=properties.findIndex(([token])=>token==='width:');
  const heightIndex=properties.findIndex(([token])=>token==='height:');
  if(widthIndex>=0&&heightIndex>=0){
    let count=0;
    postcss.parse(css).walkRules(rule=>{
      for(let i=0;i<rule.nodes.length-1;i++){
        const a=rule.nodes[i],b=rule.nodes[i+1];
        if(a.prop!=='width'||b.prop!=='height'||a.value!==b.value||!!a.important!==!!b.important)continue;
        const value=a.value+(a.important?'!important':'');
        const pair='${css_'+widthIndex+'}'+literal(value)+';${css_'+heightIndex+'}'+literal(value);
        if(!template.includes(pair))continue;
        template=template.replace(pair,'${css_square('+JSON.stringify(value)+')}');count++;
      }
    });
    if(count)setup+='const css_square=value=>`'+'${css_'+widthIndex+'}${value};${css_'+heightIndex+'}${value}`;';
  }
  // Share complete repeated declaration runs as ordinary CSS constants.
  const runs=new Set();
  const renderedRange=(start,end)=>{
    let out='',cursor=start;
    for(const r of replacements){
      if(r.offset<start||r.offset+r.token.length>end)continue;
      out+=literal(css.slice(cursor,r.offset))+'${'+r.name+'}';cursor=r.offset+r.token.length;
    }
    return out+literal(css.slice(cursor,end));
  };
  postcss.parse(css).walkRules(rule=>{
    for(let i=0;i<rule.nodes.length;i++)for(let j=i;j<rule.nodes.length;j++){
      const a=rule.nodes[i],b=rule.nodes[j];
      if(a.type!=='decl'||b.type!=='decl')continue;
      let end=b.source.end.offset+1;if(css[end-1]===';')end--;
      runs.add(renderedRange(a.source.start.offset,end));
    }
  });
  const compactLength=s=>s.replace(/\$\{css_[\w]+\}/g,'${x}').length;
  let declarationsShared=0;
  for(;;){
    let best;
    for(const run of runs){
      const count=template.split(run).length-1,length=compactLength(run),gain=count*(length-4)-length-6;
      if(count>1&&gain>0&&(!best||gain>best.gain))best={run,gain};
    }
    if(!best)break;
    const name='css_declarations_'+declarationsShared++;
    setup+='const '+name+'=`'+best.run+'`;';
    template=template.split(best.run).join('${'+name+'}');runs.delete(best.run);
  }
  // Small CSS helper strings are shorter as ordinary concatenations.
  setup=babel.transformSync(setup,{configFile:false,babelrc:false,compact:true,plugins:[({types:t})=>({visitor:{TemplateLiteral(path){
    const n=path.node,parts=[];
    n.quasis.forEach((q,i)=>{if(q.value.cooked)parts.push(t.stringLiteral(q.value.cooked));if(n.expressions[i])parts.push(n.expressions[i])});
    if(parts[0]?.type!=='StringLiteral'&&!(parts[0]?.type==='Identifier'&&/^css_\d+$/.test(parts[0].name)))return;
    path.replaceWith(parts.reduce((a,b)=>a?t.binaryExpression('+',a,b):b,null));
  }}})]}).code;
  const check={};require('vm').runInNewContext(setup+'result=`'+template+'`',check);
  if(check.result!==css)throw Error('CSS declaration reconstruction differs');
  const script = html.match(/<script type=module>(.*?)<\/script>/s)[1];
  const style = babel.parseSync('const style=`<style>' + template + '</style>`', {configFile:false,babelrc:false}).program.body[0].declarations[0].init;
  // Adjacent CSS substitutions are strings, so addition preserves coercion.
  for(let i=0;i<style.expressions.length-1;){
    if(style.quasis[i+1].value.cooked===''){
      style.expressions.splice(i,2,babel.types.binaryExpression('+',style.expressions[i],style.expressions[i+1]));
      style.quasis.splice(i+1,1);
    }else i++;
  }
  const styleCheck={};
  const styleCode=babel.transformFromAstSync(babel.types.file(babel.types.program([babel.types.expressionStatement(style)])),null,{configFile:false,babelrc:false,compact:true}).code;
  require('vm').runInNewContext(setup+'result='+styleCode,styleCheck);
  if(styleCheck.result!=='<style>'+css+'</style>')throw Error('Joined CSS substitutions changed stylesheet');
  let insertions = 0;
  const combined = babel.transformSync(script, {configFile:false,babelrc:false,compact:true,plugins:[({types:t})=>({visitor:{CallExpression(path){
    const n=path.node,c=n.callee,o=c.object;
    if(c.type==='MemberExpression'&&c.property.name==='insertAdjacentHTML'&&o?.type==='MemberExpression'&&o.object.name==='document'&&o.property.name==='body'&&n.arguments[0]?.value==='afterbegin'){
      path.replaceWith(t.assignmentExpression('=',t.memberExpression(t.cloneNode(o,true),t.identifier('innerHTML')),t.binaryExpression('+',t.cloneNode(style,true),n.arguments[1])));insertions++;
    }
  }}})]}).code;
  if(insertions!==1)throw Error('Expected one initial body insertion');
  const code = (await terser.minify(setup + combined, {module: true, ecma: 2020, compress: {passes: 5}, mangle: true})).code;
  const output = html.replace(/<style>.*?<\/style>/s, '').replace(/<script type=module>.*?<\/script>/s, () => '<script type=module>' + code + '</script>');
  fs.writeFileSync(base + 'maze/css-template-source.js', setup + combined);
  fs.writeFileSync(base + 'maze/css-template-candidate.html', output);
  if (process.argv.includes('--apply') && output.length < html.length) {
    fs.writeFileSync(file, output);
    const metadataFile = base + 'maze/build.json', metadata = JSON.parse(fs.readFileSync(metadataFile));
    Object.assign(metadata, {chars: [...output].length, css: 0, renderedCssChars: css.length, js: [...code].length, cssTemplateProperties: properties.map(([token]) => token).filter(token => token.endsWith(':')), cssTemplateValues: properties.map(([token]) => token).filter(token => !token.endsWith(':'))});
    metadata.cssRestructure = {merges:restructured.merges,canonicalCascadeEqual:restructured.canonicalCascadeEqual};
    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
  }
  console.log({before: [...html].length, after: [...output].length, saved: [...html].length - [...output].length, propertyTemplates: properties.length});
})().catch(error => { console.error(error); process.exit(1); });
