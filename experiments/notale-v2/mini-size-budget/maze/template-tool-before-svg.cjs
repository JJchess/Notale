const fs = require('fs');
const terser = require('/tmp/notale-size-tools/node_modules/terser');
const directory = 'experiments/mini-size-budget/';
(async () => {
  const file = directory + 'combined/state-maze-stories/index.html';
  const html = fs.readFileSync(file, 'utf8');
  const start = html.indexOf('<div id=app>');
  if (start < 0) throw Error('Generate the untemplated base before applying markup templates');
  const script = html.match(/<script type=module>(.*?)<\/script>/s)[1];
  const markup = html.slice(start, html.indexOf('<script type=module>'));
  const root = {start: 0, end: markup.length, children: []}, stack = [root];
  for (const match of markup.matchAll(/<\/?(?:div|span|button)\b[^>]*>/g)) {
    if (match[0].startsWith('</')) {
      const node = stack.pop();
      node.close = match.index;
      node.end = match.index + match[0].length;
    } else {
      const node = {tag: match[0].match(/^<(\w+)/)[1], start: match.index, openEnd: match.index + match[0].length, open: match[0], children: []};
      stack.at(-1).children.push(node);
      stack.push(node);
    }
  }
  if (stack.length !== 1) throw Error('Unbalanced div markup');
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
  function render(node) {
    const raw = markup.slice(node.start, node.end);
    const classes = node.open.match(/^<(?:div|span|button)(?: class=(?:"([^"]*)"|'([^']*)'|([^ >]*)))?>$/);
    if (classes) {
      const content = sequence(node.openEnd, node.close, node.children);
      const code = `maze_${node.tag}(${JSON.stringify(classes[1] ?? classes[2] ?? classes[3] ?? '')}${content === '""' ? '' : ',' + content})`;
      // Account for the one-character helper name emitted by Terser.
      if (code.length - ('maze_' + node.tag).length + 1 < JSON.stringify(raw).length) return {code};
    }
    const nested = sequence(node.openEnd, node.close, node.children);
    const code = JSON.stringify(node.open) + '+' + nested + '+' + JSON.stringify('</' + node.tag + '>');
    return code.length < JSON.stringify(raw).length ? {code} : {text: raw};
  }
  const helper = `const mazeTag=t=>(c,h="")=>"<"+t+(c?' class="'+c+'"':"")+">"+h+"</"+t+">",maze_div=mazeTag("div"),maze_span=mazeTag("span"),maze_button=mazeTag("button");`;
  const expression = sequence(0, markup.length, root.children);
  const setup = helper + 'document.body.insertAdjacentHTML("afterbegin",' + expression + ');';
  const code = (await terser.minify(setup + script, {module: true, ecma: 2020, compress: {passes: 5, unsafe_arrows: true, unsafe_methods: true}, mangle: true})).code;
  const result = html.slice(0, start) + '<body><script type=module>' + code + '</script>';
  fs.writeFileSync(directory + 'maze/div-template-candidate.html', result);
  fs.writeFileSync(directory + 'maze/div-template-source.js', setup);
  if (process.argv.includes('--apply') && result.length < html.length) {
    fs.writeFileSync(file, result);
    const metadataFile = directory + 'maze/build.json';
    const metadata = JSON.parse(fs.readFileSync(metadataFile));
    metadata.chars = [...result].length;
    metadata.js = code.length;
    metadata.markupTemplates = ['div', 'span', 'button'];
    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
  }
  console.log({before: [...html].length, candidate: [...result].length, saved: [...html].length - [...result].length});
})();
