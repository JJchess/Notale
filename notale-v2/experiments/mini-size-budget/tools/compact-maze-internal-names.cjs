const fs = require('fs'), crypto = require('crypto'), postcss = require('/tmp/notale-size-tools/node_modules/postcss');
const base = 'experiments/mini-size-budget/', directory = base + 'combined/state-maze-stories/';
const htmlFile = directory + 'index.html', dataFile = directory + 'd.json', metadataFile = base + 'maze/build.json';
let html = fs.readFileSync(htmlFile, 'utf8'), data = JSON.parse(fs.readFileSync(dataFile)), metadata = JSON.parse(fs.readFileSync(metadataFile));
const before = [...html].length, fonts = {National: 'N', Canela: 'C'};
if (data.fonts.some(row => !fonts[row[0]])) throw Error('Rebuild the original font metadata before shortening internal names');
const css = postcss.parse(html.match(/<style>(.*?)<\/style>/s)[1]), animations = {};
css.walkAtRules('keyframes', rule => { const name = String.fromCharCode(97 + Object.keys(animations).length); animations[rule.params] = name; rule.params = name; });
css.walkDecls(declaration => {
  if (declaration.prop === '--s') declaration.value = declaration.value.replace(/^National,/, 'N,');
  if (declaration.prop === '--f') declaration.value = declaration.value.replace(/^Canela,/, 'C,');
  if (['animation', 'animation-name'].includes(declaration.prop)) for (const [old, name] of Object.entries(animations)) declaration.value = declaration.value.split(old).join(name);
});
data.fonts.forEach(row => { row[0] = fonts[row[0]]; });
const inverseProperties = Object.fromEntries(Object.entries(metadata.runtimeDataProperties).map(([key, value]) => [value, key]));
function restore(value) {
  if (Array.isArray(value)) return value.map(restore);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [inverseProperties[key] || key, restore(child)]));
  return value;
}
const restored = restore(data), inverseFonts = Object.fromEntries(Object.entries(fonts).map(([key, value]) => [value, key]));
restored.fonts.forEach(row => { row[0] = inverseFonts[row[0]]; });
const original = JSON.parse(fs.readFileSync(directory + 'assets/mini-data.json'));
if (JSON.stringify(restored) !== JSON.stringify(original)) throw Error('Font/data aliases did not restore the original metadata');
html = html.replace(/<style>.*?<\/style>/s, () => '<style>' + css.toString() + '</style>');
// Internal node IDs have no external routing contract.
html = html.replace(/\bid=app\b/g, 'id=a').replace(/#app\b/g, '#a').replace(/\bpdf-link\b/g, 'p');
metadata.ids = {...metadata.ids, app:'a', 'pdf-link':'p'};
fs.writeFileSync(htmlFile, html);
fs.writeFileSync(dataFile, JSON.stringify(data));
Object.assign(metadata, {chars: [...html].length, css: css.toString().length, fontAliases: fonts, animationAliases: animations});
fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
const assetFile = base + 'maze/short-asset-equivalence.json', assets = JSON.parse(fs.readFileSync(assetFile));
const entry = assets.find(item => item.target === dataFile);
entry.sha256 = crypto.createHash('sha256').update(fs.readFileSync(dataFile)).digest('hex');
entry.fontFamilyAliases = fonts;
entry.roundTripEqual = true;
fs.writeFileSync(assetFile, JSON.stringify(assets, null, 2));
fs.writeFileSync(base + 'maze/internal-name-equivalence.json', JSON.stringify({fonts, animations, originalDataRestored: true, fontFilesAndWeightsUnchanged: true}, null, 2));
console.log({before, chars: metadata.chars, saved: before - metadata.chars});
