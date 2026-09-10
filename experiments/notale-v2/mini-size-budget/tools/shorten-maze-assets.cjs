const fs = require('fs'), path = require('path'), crypto = require('crypto');
const base = 'experiments/mini-size-budget/';
const destination = base + 'combined/state-maze-stories';
const original = 'workflows/build-interaction/samples/general/state-maze-stories/mini/pages';
const aliases = {
  'assets/mini-data.json': 'd.json',
  'assets/mini-icons.svg': 'i.svg',
  'assets/plus-light.svg': 'l.svg',
  'assets/plus.svg': 'p.svg',
  'assets/check-orange.svg': 'c.svg',
  'assets/key0.svg': 'k0.svg',
  'assets/key1.svg': 'k1.svg',
  'assets/key2.svg': 'k2.svg',
  'assets/key3.svg': 'k3.svg',
  './assets/activity_book.jpg': 'b.jpg',
  'assets/img/states/': 's/',
  'assets/img/stories/': 'r/',
  'assets/walls/': 'w/'
};
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const verified = [];
function copy(source, target) {
  if (fs.statSync(source).isDirectory()) {
    fs.mkdirSync(target, {recursive: true});
    for (const file of fs.readdirSync(source)) copy(path.join(source, file), path.join(target, file));
  } else {
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.copyFileSync(source, target);
    const hash = digest(source);
    if (digest(target) !== hash) throw Error('Asset bytes changed: ' + source);
    verified.push({source, target, sha256: hash});
  }
}
const file = destination + '/index.html';
let html = fs.readFileSync(file, 'utf8'), before = [...html].length;
for (const [source, target] of Object.entries(aliases)) {
  const local = path.join(destination, source);
  copy(fs.existsSync(local) ? local : path.join(original, source), path.join(destination, target));
  html = html.replaceAll(source, target);
}
fs.writeFileSync(file, html);
const metadataFile = base + 'maze/build.json';
const metadata = JSON.parse(fs.readFileSync(metadataFile));
metadata.chars = [...html].length;
metadata.js = html.match(/<script type=module>(.*?)<\/script>/s)[1].length;
metadata.assetAliases = aliases;
fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
fs.writeFileSync(base + 'maze/short-asset-equivalence.json', JSON.stringify(verified, null, 2));
console.log({before, chars: metadata.chars, saved: before - metadata.chars, assetsVerified: verified.length});
