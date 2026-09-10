const fs=require('fs'),postcss=require('/tmp/notale-size-tools/node_modules/postcss');
const f='experiments/mini-size-budget/combined/state-maze-stories/index.html',mfile='experiments/mini-size-budget/maze/build.json';
let html=fs.readFileSync(f,'utf8'),css=html.match(/<style>(.*?)<\/style>/s)[1],ast=postcss.parse(css),counts=new Map;
ast.walkDecls(d=>{if(!d.prop.startsWith('--')&&d.parent.type==='rule'&&!/font-face/.test(d.parent.name||''))counts.set(d.value,(counts.get(d.value)||0)+1)});
let root=postcss.rule({selector:':root'}),index=0,used=[];
for(let [value,count]of [...counts].sort((a,b)=>(b[0].length-8)*b[1]-(a[0].length-8)*a[1])){
 let name='--v'+index.toString(36),ref='var('+name+')',saving=count*(value.length-ref.length)-(name.length+value.length+2);
 if(saving<=0||/inherit|initial|unset|revert|url\(/.test(value))continue;
 ast.walkDecls(d=>{if(!d.prop.startsWith('--')&&d.value===value)d.value=ref});root.append({prop:name,value});used.push({name,value,count,saving});index++;
}
for(let factor of ['.3','.2','.5','.15']){let value=`calc(var(--1s) * ${factor})`,n=0;ast.walkDecls(d=>{if(!d.prop.startsWith('--'))n+=d.value.split(value).length-1});let name='--t'+factor.slice(1),ref=`var(${name})`,saving=n*(value.length-ref.length)-name.length-value.length-2;if(saving>0){ast.walkDecls(d=>{if(!d.prop.startsWith('--'))d.value=d.value.split(value).join(ref)});root.append({prop:name,value});used.push({name,value,count:n,saving})}}if(used.length)ast.prepend(root);
ast.walkDecls(d=>{if(d.prop.startsWith('--')&&!used.some(v=>v.name===d.prop)&&!html.includes('var('+d.prop+')')&&!html.includes('var('+d.prop+','))d.remove()});css=ast.toString();html=html.replace(/<style>.*?<\/style>/s,()=>'<style>'+css+'</style>');for(let [a,b]of Object.entries({'--sans':'--s','--serif':'--f','--stroke-width':'--w','--v0':'--b','--v1':'--d','--t3':'--e','--t2':'--g','--1s':'--t','--sb':'--h','--row':'--r','--col':'--c'}))html=html.replaceAll(a,b);css=require('/tmp/notale-maze-css-opt/node_modules/csso').minify(html.match(/<style>(.*?)<\/style>/s)[1]).css;for(let round=0;round<3;round++){let before=css.length,compact=require('/tmp/notale-maze-css-opt/node_modules/csso').minify(css).css;if(compact.length<css.length)css=compact;compact=require('/tmp/notale-maze-css-opt/node_modules/lightningcss').transform({filename:'maze.css',code:Buffer.from(css),minify:true}).code.toString();if(compact.length<css.length)css=compact;if(css.length===before)break;}// These base layout declarations have no competing values on the same components.
// Preserve each original selector (and its specificity), pooling only root-level rules.
for(let [prop,value]of [['display','flex'],['flex-direction','column'],['align-items','center'],['position','relative'],['position','absolute'],['width','100%'],['height','100%'],['justify-content','center'],['justify-content','space-between'],['align-items','start'],['border-radius','3px'],['border-radius','50%'],['font-weight','700'],['min-height','0'],['gap','.5rem'],['top','0'],['left','50%'],['margin','0'],['padding','0'],['background','#fffdf8'],['background','#ddd3cb'],['background','0 0'],['color','#726d68'],['transition','opacity var(--e)'],['font-size','.9rem'],['font-size','.875rem'],['stroke','#1c1246'],['opacity','1'],['opacity','0'],['border-bottom','currentcolor'],['height','20px'],['width','20px'],['z-index','1']]){
 let pooled=postcss.parse(css),selectors=[];
 pooled.walkDecls(prop,d=>{if(d.value===value&&!d.important&&d.parent.type==='rule'&&d.parent.parent.type==='root'){selectors.push(...d.parent.selectors);let r=d.parent;d.remove();if(!r.nodes.length)r.remove()}});
 if(selectors.length){let r=postcss.rule({selector:[...new Set(selectors)].join(',')});r.append({prop,value});pooled.append(r);let next=require('/tmp/notale-maze-css-opt/node_modules/csso').minify(pooled.toString()).css;if(next.length<css.length)css=next}
}
css=require('./pool-maze-base-colors.cjs')(css);
css=require('./factor-maze-selectors.cjs')(css);
css=require('./compact-maze-root.cjs')(css,html.replace(/<style>.*?<\/style>/s,''));
html=html.replace(/<style>.*?<\/style>/s,()=>'<style>'+css+'</style>');fs.writeFileSync(f,html);let m=JSON.parse(fs.readFileSync(mfile));m.chars=[...html].length;m.css=css.length;m.js=html.match(/<script type=module>(.*?)<\/script>/s)[1].length;m.valueAliases=used.map(v=>({...v,name:({'--v0':'--b','--v1':'--d','--t3':'--e','--t2':'--g'})[v.name]||v.name,value:v.value.replaceAll('--1s','--t')}));fs.writeFileSync(mfile,JSON.stringify(m,null,2));console.log({chars:m.chars,css:m.css,used});

require('child_process').execFileSync(process.execPath,['experiments/mini-size-budget/tools/template-maze-divs.cjs','--apply'],{stdio:'inherit'});
require('./shorten-maze-assets.cjs');
require('child_process').execFileSync(process.execPath,['experiments/mini-size-budget/tools/compact-maze-data-properties.cjs'],{stdio:'inherit'});
require('./compact-maze-internal-names.cjs');
require('child_process').execFileSync(process.execPath,['experiments/mini-size-budget/tools/template-maze-css.cjs','--apply'],{stdio:'inherit'});
require('child_process').execFileSync(process.execPath,['experiments/mini-size-budget/tools/compact-maze-identifiers.cjs'],{stdio:'inherit'});
