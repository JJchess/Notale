module.exports=ast=>{
 const kind=s=>s.includes('button.start')?null:s.includes('.check')?'scale':s.includes('.book-img')||s.includes('.select-control::after')?'rotate':'translate';
 ast.walkRules(r=>{
  if(r.parent.type!=='root')return;
  if(r.nodes.some(d=>d.prop==='transition'&&d.value.includes('transform'))&&new Set(r.selectors.map(kind)).size>1){
   for(let selector of r.selectors){let n=r.clone({selector});r.before(n);adjust(n)}r.remove();
  }else adjust(r);
 });
 function adjust(r){
  let target=kind(r.selectors[0]);if(!target)return;
  r.walkDecls(d=>{
   if(d.prop==='transform'){
    let m=d.value.match(/^translateY\(([^)]+)\)$/);
    if(m){d.prop='translate';d.value='0 '+m[1];return}
    m=d.value.match(/^translate\(([^)]+)\)(?: scale\(([^)]+)\))?$/);
    if(m){d.prop='translate';d.value=m[1].replace(/,\s*/g,' ');if(m[2])r.append({prop:'scale',value:m[2]});return}
    m=d.value.match(/^rotate\(([^)]+)\)$/);
    if(m){d.prop='rotate';d.value=m[1]}
   }else if(d.prop==='transition')d.value=d.value.replace(/\btransform\b/g,target);
  });
 }
 return ast;
};
