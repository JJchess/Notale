const fs = require('fs'), crypto = require('crypto');
const terser = require('/tmp/notale-size-tools/node_modules/terser');
const base = 'experiments/mini-size-budget/';
(async () => {
  const directory = base + 'combined/state-maze-stories/';
  const htmlFile = directory + 'index.html', dataFile = directory + 'd.json';
  let html = fs.readFileSync(htmlFile, 'utf8');
  const sourceData = JSON.parse(fs.readFileSync(directory + 'assets/mini-data.json', 'utf8'));
  if (JSON.stringify(JSON.parse(fs.readFileSync(dataFile, 'utf8'))) !== JSON.stringify(sourceData)) throw Error('Regenerate data aliases before compacting private fields');
  // Only private data fields. DOM APIs, FontFace options, and saved id/path/
  // row/col fields are intentionally outside this set.
  const fields = ['methodParagraphs', 'gridLabels', 'policyLink', 'startLabels', 'imageAttributes', 'shortLabel', 'progressLabel', 'stateIndex', 'classificationCopy', 'factCopies', 'mazeCells', 'mazeDimension', 'mazeTransform', 'mazeSolution', 'mazeMoves', 'mazeSrc', 'personSrc', 'wallSrc', 'displayName', 'possessiveName', 'abbreviation', 'storyLabel', 'states', 'names', 'sections', 'Dashboard', 'Methodology', 'doneMessage', 'storyCards', 'name', 'info', 'person', 'mazeAlt', 'storyAlt', 'stateOptions', 'labels', 'gridGroups', 'title', 'indices', 'story', 'mazes', 'classifications', 'factsByState', 'guttmacher', 'pathTransforms', 'solutions', 'moves', 'sources', 'metric', 'lastUpdated', 'link'];
  const keys = new Set();
  function collect(value) {
    if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
      if (!Array.isArray(value)) keys.add(key);
      collect(child);
    }
  }
  collect(sourceData);
  const cache = {}, script = html.match(/<script type=module>(.*?)<\/script>/s)[1];
  const propertyAlphabet=[...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ'];
  const result = await terser.minify(script, {
    module: true, ecma: 2020, compress: false,
    mangle: {properties: {nth_identifier:{get:n=>propertyAlphabet[n]||'property'+n}, regex: new RegExp('^(' + fields.join('|') + ')$'), builtins: true, reserved: [...keys].filter(key => !fields.includes(key))}},
    nameCache: cache
  });
  const mapping = Object.fromEntries(Object.entries(cache.props.props).map(([key, value]) => [key.slice(1), value]));
  function rename(value, map) {
    if (Array.isArray(value)) return value.map(item => rename(item, map));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [map[key] || key, rename(item, map)]));
    return value;
  }
  const data = rename(sourceData, mapping);
  const reverse = Object.fromEntries(Object.entries(mapping).map(([key, value]) => [value, key]));
  const roundTrip = rename(data, reverse);
  if (JSON.stringify(roundTrip) !== JSON.stringify(sourceData)) throw Error('Data property mapping is not reversible');
  const before = [...html].length;
  html = html.replace(/<script type=module>.*?<\/script>/s, () => '<script type=module>' + result.code + '</script>');
  if ([...html].length >= before) {
    console.log({adopted: false, before, candidate: [...html].length});
    return;
  }
  fs.writeFileSync(htmlFile, html);
  fs.writeFileSync(dataFile, JSON.stringify(data));
  const metadataFile = base + 'maze/build.json';
  const metadata = JSON.parse(fs.readFileSync(metadataFile));
  metadata.chars = [...html].length;
  metadata.js = result.code.length;
  metadata.runtimeDataProperties = mapping;
  fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
  const assetReportFile = base + 'maze/short-asset-equivalence.json';
  const assets = JSON.parse(fs.readFileSync(assetReportFile));
  const entry = assets.find(item => item.target === dataFile);
  if (entry) {
    entry.sourceSha256 = entry.sha256;
    entry.sha256 = crypto.createHash('sha256').update(fs.readFileSync(dataFile)).digest('hex');
    entry.transformation = 'Reversible private data field renaming; descriptive source retained';
    entry.roundTripEqual = true;
  }
  fs.writeFileSync(assetReportFile, JSON.stringify(assets, null, 2));
  const report = {before, chars: metadata.chars, saved: before - metadata.chars, mapping, roundTripEqual: true, savedProgressFieldsUnchanged: ['id', 'path', 'row', 'col']};
  fs.writeFileSync(base + 'maze/data-property-equivalence.json', JSON.stringify(report, null, 2));
  console.log(report);
})();
