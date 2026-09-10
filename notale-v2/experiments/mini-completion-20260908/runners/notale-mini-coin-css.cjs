const fs=require('fs'),postcss=require('/tmp/notale-yard-build/node_modules/postcss');
const folder='workflows/build-interaction/samples/general/coin-flip-wealth/mini/pages/';
const removed=[];
for(const file of ['source.css','reset.css']){
 const ast=postcss.parse(fs.readFileSync(folder+file,'utf8'));
 ast.walkRules(rule=>{
  if(rule.parent.type==='atrule' && rule.parent.name.includes('keyframes'))return;
  const selectors=rule.selectors.filter(selector=>{
   const dead=file==='source.css'?
    /^(?:#body\b|\.body_container\b|blockquote\b|\.ysm_data\b|\.fullInfoSub\b|rect\.|\.purple\b|\.yellow\b|\.player[12]Text\b|\.chartText\b|\.roundItem\b|\.watch_bottom\b|\.speechBubble\.player2bubble\b|h[3-6]\b)/.test(selector):
    /^(?:mark\b|#body\b|input\b|textarea\b|select\b|a\[role|tfoot\b|ol\b|ul\b|\.skip-to-main\b|\.text-outline\b|:{1,2}(?:-moz-placeholder|-ms-input-placeholder|-ms-input-placeholder|placeholder))/.test(selector);
   if(dead)removed.push({file,selector});
   return !dead;
  });
  if(selectors.length)rule.selectors=selectors;else rule.remove();
 });
 fs.writeFileSync(folder+file,ast.toString());
}
fs.mkdirSync('experiments/mini-completion-20260908/coin-flip-wealth',{recursive:true});
fs.writeFileSync('experiments/mini-completion-20260908/coin-flip-wealth/removed-css.json',JSON.stringify(removed,null,2));
console.log('Removed',removed.length,'unused selectors');
