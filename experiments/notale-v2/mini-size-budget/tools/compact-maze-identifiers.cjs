// Ordinary local identifier minification. Greek letters are single Unicode
// characters valid in JavaScript identifiers; no source decoding is involved.
const fs = require('fs'), terser = require('/tmp/notale-size-tools/node_modules/terser');
(async () => {
  const base = 'experiments/mini-size-budget/', file = base + 'combined/state-maze-stories/index.html';
  const html = fs.readFileSync(file, 'utf8'), script = html.match(/<script type=module>(.*?)<\/script>/s)[1];
  const babel = require('/tmp/notale-waveform-build/node_modules/@babel/core');
  const options = {configFile:false,babelrc:false,compact:true};
  const counts = new Map(), identifiers = new Set(), propertyAliases = {}, literalCounts = new Map(), literalAliases = {}, numberCounts = new Map(), numberAliases = {};
  const numberKey = node => node.type==='UnaryExpression' && ['!','-'].includes(node.operator) && node.argument.type==='NumericLiteral'
    ? node.operator+node.argument.value : node.type==='NumericLiteral' ? String(node.value) : null;
  const countNumber = path => {
    if(numberKey(path.parent)!==null)return;
    const key=numberKey(path.node);
    if(key===null)return;
    const record=numberCounts.get(key)||{count:0,node:path.node};record.count++;numberCounts.set(key,record);
  };
  const member = path => {
    const n=path.node;
    if(!n.computed&&n.property.type==='Identifier')counts.set(n.property.name,(counts.get(n.property.name)||0)+1);
  };
  babel.transformSync(script,{...options,plugins:[({types:t})=>({visitor:{NumericLiteral:countNumber,UnaryExpression:countNumber,StringLiteral:p=>{if(t.isReferenced(p.node,p.parent)&&!p.node.value.includes('|'))literalCounts.set(p.node.value,(literalCounts.get(p.node.value)||0)+1)},Identifier:p=>{identifiers.add(p.node.name)},MemberExpression:member,OptionalMemberExpression:member}})]});
  for(const [name,count] of counts){
    if((name.length-2)*count-name.length-3<=0)continue;
    let alias='maze_property_'+name;
    while(identifiers.has(alias))alias+='_';
    identifiers.add(alias);propertyAliases[alias]=name;
  }
  for(const [value,count] of literalCounts){
    if(count*([...value].length+1)-[...value].length-2<=0)continue;
    let alias='maze_literal_'+Object.keys(literalAliases).length;
    while(identifiers.has(alias))alias+='_';
    identifiers.add(alias);literalAliases[alias]=value;
  }
  for(const [key,record] of numberCounts){
    if(record.count*(key.length-1)-key.length-3<=0)continue;
    let alias='maze_number_'+Object.keys(numberAliases).length;
    while(identifiers.has(alias))alias+='_';
    identifiers.add(alias);numberAliases[alias]=record.node;
  }
  const numbersByKey=new Map(Object.entries(numberAliases).map(([alias,node])=>[numberKey(node),alias]));
  const bindings={...propertyAliases,...literalAliases};
  const literalsByValue=new Map(Object.entries(literalAliases).map(([alias,value])=>[value,alias]));
  const byName=Object.fromEntries(Object.entries(propertyAliases).map(([alias,name])=>[name,alias]));
  let candidate=babel.transformSync(script,{...options,plugins:[({types:t})=>({visitor:{
    'NumericLiteral|UnaryExpression'(path){const alias=numbersByKey.get(numberKey(path.node));if(alias){path.replaceWith(t.identifier(alias));path.skip()}},
    StringLiteral(path){if(t.isReferenced(path.node,path.parent)&&literalsByValue.has(path.node.value))path.replaceWith(t.identifier(literalsByValue.get(path.node.value)));},
    'MemberExpression|OptionalMemberExpression'(path){const n=path.node;if(!n.computed&&byName[n.property.name]){n.property=t.identifier(byName[n.property.name]);n.computed=true;}},
    Program:{exit(path){if(Object.keys(bindings).length)path.unshiftContainer('body',t.variableDeclaration('const',[t.variableDeclarator(t.arrayPattern(Object.keys(bindings).map(alias=>t.identifier(alias))),t.callExpression(t.memberExpression(t.stringLiteral(Object.values(bindings).join('|')),t.identifier('split')),[t.stringLiteral('|')]))])).forEach(p=>p.skip());}}
  }})]}).code;
  if(Object.keys(numberAliases).length)candidate='const '+Object.entries(numberAliases).map(([alias,node])=>alias+'='+numberKey(node)).join(',')+','+candidate.replace(/^const\s*/,'');
  // Reversing only the added constants must reproduce the original AST output.
  const restored=babel.transformSync(candidate,{...options,plugins:[({types:t})=>({visitor:{
    Identifier(path){if(path.isReferencedIdentifier()&&Object.hasOwn(numberAliases,path.node.name)){path.replaceWith(t.cloneNode(numberAliases[path.node.name],true));return}if(path.isReferencedIdentifier()&&Object.hasOwn(literalAliases,path.node.name))path.replaceWith(t.stringLiteral(literalAliases[path.node.name]));},
    'MemberExpression|OptionalMemberExpression'(path){const n=path.node;if(n.computed&&n.property.type==='Identifier'&&propertyAliases[n.property.name]){n.property=t.identifier(propertyAliases[n.property.name]);n.computed=false;}},
    VariableDeclaration(path){path.node.declarations=path.node.declarations.filter(d=>!(d.id.type==='Identifier'&&Object.hasOwn(numberAliases,d.id.name)&&numberKey(d.init)===numberKey(numberAliases[d.id.name])));if(!path.node.declarations.length){path.remove();return}const d=path.node.declarations[0],n=d?.init;if(path.node.declarations.length===1&&d.id.type==='ArrayPattern'&&d.id.elements.map(e=>e.name).join('|')===Object.keys(bindings).join('|')&&n?.type==='CallExpression'&&n.callee.object?.value===Object.values(bindings).join('|')&&n.callee.property.name==='split'&&n.arguments[0]?.value==='|')path.remove();}
  }})]}).code;
  const canonical=source=>babel.transformSync(source,{...options,plugins:[()=>({visitor:{StringLiteral(path){delete path.node.extra}}})]}).code;
  if(canonical(restored)!==canonical(script))throw Error('Constant alias AST did not round-trip');
  // Merge adjacent immutable string lists without changing any binding value.
  let stringListsMerged=0;
  candidate=babel.transformSync(candidate,{...options,plugins:[({types:t})=>({visitor:{Program(path){
    const lists=[],stringBindings=new Set();
    const stringExpression=n=>n?.type==='StringLiteral'||n?.type==='Identifier'&&stringBindings.has(n.name)||n?.type==='TemplateLiteral'&&n.expressions.every(stringExpression)||n?.type==='BinaryExpression'&&n.operator==='+'&&stringExpression(n.left)&&stringExpression(n.right);
    scan: for(const declaration of path.node.body){
      if(declaration.type!=='VariableDeclaration'||declaration.kind!=='const')break;
      for(const d of declaration.declarations){
        const n=d.init;
        if(d.id.type==='ArrayPattern'&&d.id.elements.every(e=>e?.type==='Identifier')&&n?.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.object.type==='StringLiteral'&&(!n.callee.computed&&n.callee.property.name==='split'||n.callee.computed&&propertyAliases[n.callee.property.name]==='split')&&n.arguments.length===1&&n.arguments[0].value==='|'){
          if(n.callee.object.value.split('|').length!==d.id.elements.length)throw Error('String list arity mismatch');
          lists.push({d,declaration});
          for(const e of d.id.elements)stringBindings.add(e.name);
        }else if(stringExpression(n)){if(d.id.type==='Identifier')stringBindings.add(d.id.name)}else if(!['NumericLiteral','UnaryExpression','ArrowFunctionExpression'].includes(n?.type))break scan;
      }
    }
    if(lists.length>1){
      const expected=lists.flatMap(({d})=>d.id.elements.map((e,i)=>[e.name,d.init.callee.object.value.split('|')[i]]));
      const [a,...rest]=lists;
      for(const b of rest){
        a.d.id.elements.push(...b.d.id.elements);
        a.d.init.callee.object.value+='|'+b.d.init.callee.object.value;
        delete a.d.init.callee.object.extra;
        b.declaration.declarations=b.declaration.declarations.filter(d=>d!==b.d);
        if(!b.declaration.declarations.length)path.node.body=path.node.body.filter(d=>d!==b.declaration);
        stringListsMerged++;
      }
      const actual=a.d.id.elements.map((e,i)=>[e.name,a.d.init.callee.object.value.split('|')[i]]);
      require('assert').deepStrictEqual(actual,expected,'String-list binding values changed');
      path.scope.crawl();
      const values=a.d.init.callee.object.value.split('|');
      for(let i=a.d.id.elements.length-1;i>=0;i--){
        const name=a.d.id.elements[i].name;
        if(Object.hasOwn(propertyAliases,name)){
          const binding=path.scope.getBinding(name),property=propertyAliases[name],refs=binding.referencePaths;
          if(refs.length*(property.length-2)<=property.length+2){
            for(const ref of refs){
              const member=ref.parentPath.node;
              if(!['MemberExpression','OptionalMemberExpression'].includes(member.type)||!member.computed||member.property!==ref.node)throw Error('Unexpected property-constant reference');
              member.computed=false;member.property=t.identifier(property);
            }
            a.d.id.elements.splice(i,1);values.splice(i,1);delete propertyAliases[name];
          }
        }
      }
      a.d.init.callee.object.value=values.join('|');
    }
  }}})]}).code;
  const alphabet = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞß'+Array.from({length:128},(_,i)=>String.fromCharCode(256+i)).join('')];
  const minify = source => terser.minify(source, {
    module: true, ecma: 2020, compress: false,
    mangle: {nth_identifier: {get: n => alphabet[n] || 'v' + n}},
    format: {ascii_only: false}
  });
  // Shorter lexical declarations retain scope and initialization order.
  // These bindings are never assigned again; const enforcement is unobservable.
  candidate=babel.transformSync(candidate,{...options,plugins:[()=>({visitor:{VariableDeclaration(path){if(path.node.kind==='const')path.node.kind='let'}}})]}).code;
  const baseline=await minify(script), proposed=await minify(candidate);
  const adopted=[...proposed.code].length<[...baseline.code].length;
  const result=adopted?proposed:baseline;
  const output = html.replace(script, () => result.code);
  if ([...output].length >= [...html].length) return;
  fs.writeFileSync(file, output);
  const metadataFile = base + 'maze/build.json', metadata = JSON.parse(fs.readFileSync(metadataFile));
  Object.assign(metadata, {chars: [...output].length, js: [...result.code].length});
  metadata.browserPropertyConstants=adopted?Object.values(propertyAliases):[];
  metadata.propertyConstantAstRoundTrip=true;
  metadata.literalConstants=adopted?Object.values(literalAliases):[];
  metadata.stringListsMerged=stringListsMerged;
  metadata.numberConstants=adopted?Object.values(numberAliases).map(numberKey):[];
  fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
  console.log({chars: metadata.chars, saved: [...html].length - metadata.chars});
})().catch(error => { console.error(error); process.exit(1); });
