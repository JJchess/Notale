const fs = require('fs');
const terser = require('/tmp/notale-size-tools/node_modules/terser');
const directory = 'experiments/mini-size-budget/';
(async () => {
  const file = directory + 'combined/state-maze-stories/index.html';
  const html = fs.readFileSync(file, 'utf8');
  const start = html.indexOf('<div id=app>');
  if (start < 0) throw Error('Generate the untemplated base before applying markup templates');
  const script = html.match(/<script type=module>(.*?)<\/script>/s)[1];
  const markup = html.slice(start, html.indexOf('<script type=module>')).replace(/ download=""/g,' download').replace(/<(circle|image)\b([^>]*)><\/\1>/g, (_, tag, attributes) => '<' + tag + attributes + ' />');
  const root = {start: 0, end: markup.length, children: []}, stack = [root];
  for (const match of markup.matchAll(/<\/?(?:div|span|button|svg|path|header|section|figure|label|a|img)\b[^>]*>/g)) {
    if (match[0].startsWith('</')) {
      const node = stack.pop();
      node.close = match.index;
      node.end = match.index + match[0].length;
    } else {
      const node = {tag: match[0].match(/^<(\w+)/)[1], start: match.index, openEnd: match.index + match[0].length, open: match[0], children: []};
      stack.at(-1).children.push(node);
      if (node.tag === 'img') node.close = node.end = node.openEnd;
      else stack.push(node);
    }
  }
  if (stack.length !== 1) throw Error('Unbalanced div markup');
  const codeLength = code => code.replace(/\bmaze_[a-z]+\b/g, 'q').length;
  function sequence(start, end, children) {
    const parts = [];
    const literal = text => {
      if (!text) return;
      if (parts.at(-1)?.text !== undefined) parts.at(-1).text += text;
      else parts.push({text});
    };
    let cursor = start;
    for (const node of children) {
      literal(markup.slice(cursor, node.start));
      const result = render(node);
      if (result.text !== undefined) literal(result.text);
      else parts.push(result);
      cursor = node.end;
    }
    literal(markup.slice(cursor, end));
    return parts.map(p => p.code ?? JSON.stringify(p.text)).join('+') || '""';
  }
  const attributePrefixes={maze_dialogattrs:' role=dialog tabindex=-1',maze_target:' target=_blank',maze_classattr:' class=',maze_contentattr:' c='};
  function attributeCode(value){
    if([' role=dialog',' tabindex=-1'].every(token=>value.includes(token))){
      return 'maze_dialogattrs+'+JSON.stringify(value.replace(/ (?:role=dialog|tabindex=-1)(?= |$)/g,''));
    }
    for(const [name,prefix] of Object.entries(attributePrefixes))if(value.startsWith(prefix)){
      return name+(value.length>prefix.length?'+'+JSON.stringify(value.slice(prefix.length)):'');
    }
    return JSON.stringify(value);
  }
  function render(node) {
    const raw = markup.slice(node.start, node.end);
    if (node.tag === 'img') {
      let icon = raw.match(/^<img src="(assets\/[\w-]+\.svg)" alt="" class=(?:"([^"]*)"|([^ >]+))>$/);
      if(!icon){
        const key=raw.match(/^<img class=(?:"([^"]*)"|([^ >]+)) src="(assets\/[\w-]+\.svg)" alt="">$/);
        if(key)icon=[key[0],key[3],key[1]??key[2]];
      }
      return icon ? {code: `maze_icon(${JSON.stringify(icon[1])},${JSON.stringify(icon[2] ?? icon[3])})`} : {text: raw};
    }
    const classes = node.open.match(/^<(?:div|span|button|svg|path|header|section|figure|label|a)(?: class=(?:"([^"]*)"|'([^']*)'|([^ >]*)))?>$/);
    {
      const attributes = classes ? (classes[1] ?? classes[2] ?? classes[3] ?? "") : node.open.slice(node.tag.length + 1, -1);
      const content = sequence(node.openEnd, node.close, node.children);
      const sprite = node.tag === 'svg' && markup.slice(node.openEnd, node.close).match(/^<use href="assets\/mini-icons\.svg#i(\d+)"><\/use>$/);
      if (sprite) return {code: `maze_sprite(${JSON.stringify(attributes)},${sprite[1]})`};
      const code = `maze_${node.tag}(${attributeCode(attributes)}${content === '""' ? '' : ',' + content})`;
      // Account for the one-character helper name emitted by Terser.
      if (codeLength(code) < JSON.stringify(raw).length) return {code};
    }
    const nested = sequence(node.openEnd, node.close, node.children);
    const code = JSON.stringify(node.open) + '+' + nested + '+' + JSON.stringify('</' + node.tag + '>');
    return codeLength(code) < JSON.stringify(raw).length ? {code} : {text: raw};
  }
  const helper = `const mazeTag=t=>(c,h="")=>"<"+t+(c[0]===" "?c:c&&' class="'+c+'"')+">"+h+"</"+t+">",maze_div=mazeTag("div"),maze_span=mazeTag("span"),maze_button=mazeTag("button"),maze_svg=mazeTag("svg"),maze_path=mazeTag("path"),maze_header=mazeTag("header"),maze_section=mazeTag("section"),maze_figure=mazeTag("figure"),maze_label=mazeTag("label"),maze_a=mazeTag("a");`;
  let expression = sequence(0, markup.length, root.children);
  const spriteHelper = `const maze_sprite=(attributes,id)=>maze_svg(attributes,'<use href="assets/mini-icons.svg#i'+id+'"/>');`;
  const imageHelper = `const maze_icon=(src,c)=>'<img src='+src+' alt class="'+c+'">';`;
  const attributesHelper='const ['+Object.keys(attributePrefixes).join(',')+']='+JSON.stringify(Object.values(attributePrefixes).join('|'))+'.split("|");';
  const makeSetup=(expression,inlined=[])=>attributesHelper+inlined.reduce((code,tag)=>code.replace(',maze_'+tag+'=mazeTag('+JSON.stringify(tag)+')',''),helper)+spriteHelper+imageHelper+'document.body.insertAdjacentHTML("afterbegin",'+expression+');';
  const minifySetup=async setup=>(await terser.minify(setup+script,{module:true,ecma:2020,compress:{passes:5,unsafe_arrows:true,unsafe_methods:true},mangle:true})).code;
  let setup=makeSetup(expression),code=await minifySetup(setup);
  const originalSetup=setup,originalExpression=expression;
  const singleTags=['header','section','figure','label','a','path'].filter(tag=>(expression.match(new RegExp('\\bmaze_'+tag+'\\(','g'))||[]).length===1);
  for(let mask=1;mask<2**singleTags.length;mask++){
    let candidate=originalExpression;
    singleTags.forEach((tag,i)=>{if(mask>>i&1)candidate=candidate.replace('maze_'+tag+'(','mazeTag('+JSON.stringify(tag)+')(')});
    const nextSetup=makeSetup(candidate,singleTags.filter((_,i)=>mask>>i&1)),nextCode=await minifySetup(nextSetup);
    if([...nextCode].length<[...code].length){expression=candidate;setup=nextSetup;code=nextCode}
  }
  const evaluateMarkup=source=>{let value;require('vm').runInNewContext(source,{document:{body:{insertAdjacentHTML:(position,html)=>{if(position!=='afterbegin')throw Error('Unexpected insertion');value=html}}}});return value};
  if(evaluateMarkup(setup)!==evaluateMarkup(originalSetup))throw Error('HTML factory inlining changed markup');
  const result = html.slice(0, start) + '<body><script type=module>' + code + '</script>';
  fs.writeFileSync(directory + 'maze/div-template-candidate.html', result);
  fs.writeFileSync(directory + 'maze/div-template-source.js', setup);
  if (process.argv.includes('--apply') && result.length < html.length) {
    fs.writeFileSync(file, result);
    const metadataFile = directory + 'maze/build.json';
    const metadata = JSON.parse(fs.readFileSync(metadataFile));
    metadata.chars = [...result].length;
    metadata.js = code.length;
    metadata.markupTemplates = ['div', 'span', 'button', 'svg', 'path', 'header', 'section', 'figure', 'label', 'a'];
    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
  }
  console.log({before: [...html].length, candidate: [...result].length, saved: [...html].length - [...result].length});
})();
