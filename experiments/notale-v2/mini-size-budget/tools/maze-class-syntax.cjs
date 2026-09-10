const babel=require('/tmp/notale-waveform-build/node_modules/@babel/core');
module.exports=function(source,map){let helpers=new Set;const selector=s=>s.replace(/\.([a-zA-Z_][\w-]*)/g,(m,c)=>map[c]?'.'+map[c]:m),classes=s=>s.split(/(\s+)/).map(c=>map[c]||c).join(''),markup=s=>s.replace(/\bclass=("[^"]*"|'[^']*'|[^\s>]+)/g,(_,v)=>'class='+(/^['"]/.test(v)?v[0]+classes(v.slice(1,-1))+v.at(-1):classes(v)));
function classValue(path){
  let child=path,parent=path.parentPath;
  while(parent){
    const node=parent.node;
    if(node.type==='ConditionalExpression'&&(node.consequent===child.node||node.alternate===child.node)||node.type==='BinaryExpression'&&node.operator==='+'||node.type==='TemplateLiteral'){
      child=parent;parent=parent.parentPath;continue;
    }
    return node.type==='AssignmentExpression'&&node.right===child.node&&node.left.type==='MemberExpression'&&node.left.property.name==='className';
  }
  return false;
}
return babel.transformSync(source,{configFile:false,babelrc:false,compact:true,plugins:[()=>({visitor:{ObjectExpression(p){let c=p.parent.callee,keys=p.node.properties.map(n=>n.key?.name||n.key?.value);if(p.parent.type==='CallExpression'&&c?.type==='MemberExpression'&&c.object.name==='Object'&&c.property.name==='entries'&&keys.length===5&&keys.every(k=>['above','below','disabled','fade','visible'].includes(k)))for(let n of p.node.properties){let k=n.key.name||n.key.value;if(map[k]){if(n.key.type==='Identifier')n.key.name=map[k];else n.key.value=map[k]}}},Program(p){p.traverse({CallExpression(q){let n=q.node.callee,f=q.getFunctionParent();if(n.type==='MemberExpression'&&n.property.name==='toggle'&&n.object.type==='MemberExpression'&&n.object.property.name==='classList'&&f?.node.params.length===3){let id=f.node.id||f.parentPath.node.id;if(id?.name)helpers.add(id.name)}}})},StringLiteral(p){let parent=p.parent,node=parent.callee,isClass=classValue(p)||parent.type==='CallExpression'&&node?.type==='Identifier'&&helpers.has(node.name)&&parent.arguments[1]===p.node||parent.type==='ObjectProperty'&&(parent.key.name||parent.key.value)==='class'||parent.type==='AssignmentExpression'&&parent.left.type==='MemberExpression'&&parent.left.property.name==='className'||parent.type==='CallExpression'&&node?.type==='MemberExpression'&&node.object.type==='MemberExpression'&&node.object.property.name==='classList';p.node.value=isClass?classes(p.node.value):markup(selector(p.node.value))},TemplateElement(p){const transform=classValue(p)?classes:s=>markup(selector(s));p.node.value.raw=transform(p.node.value.raw);if(p.node.value.cooked!=null)p.node.value.cooked=transform(p.node.value.cooked)}}})]}).code};
