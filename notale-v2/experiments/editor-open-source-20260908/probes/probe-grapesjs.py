"""Execute the cloned GrapesJS bundle in Chromium; no Notale pages are modified."""
from pathlib import Path
import json
import re
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sample = ROOT / 'runs/ens-trim-full-0907/pages/page-07.html'
source = sample.read_text()

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    warnings = []
    page.on('console', lambda msg: warnings.append(msg.text) if msg.type == 'warning' else None)
    page.on('pageerror', lambda err: print('pageerror:', str(err)[:400], flush=True))
    page.set_content('<div id="editor"></div><div id="restored"></div>')
    page.add_script_tag(path=str(HERE / 'grapesjs-source.js'))
    results = page.evaluate("""async (source) => {
      const g = GrapesSource.grapesjs;
      const wait = () => new Promise(r => setTimeout(r, 400));
      const bare = g.init({headless: true, storageManager: false});
      bare.setComponents(source);
      const imported = bare.getHtml();
      const snapshot = bare.getProjectData();
      const reload = g.init({headless: true, storageManager: false});
      reload.loadProjectData(JSON.parse(JSON.stringify(snapshot)));
      const realPage = {
        importedCanvasTags: (imported.match(/<canvas\\b/g) || []).length,
        importedScriptTags: (imported.match(/<script\\b/g) || []).length,
        exportedJsCharacters: bare.getJs().length,
        containsStage: imported.includes('id="stage"'),
        htmlRoundTripEqual: imported === reload.getHtml(),
        cssRoundTripEqual: bare.getCss() === reload.getCss(),
      };

      function plugin(editor) {
        editor.Components.addType('notale-lab', {
          model: {
            defaults: {
              tagName: 'section', count: 15,
              traits: [{type: 'number', name: 'count', changeProp: true}],
              'script-props': ['count'],
              script: function(props) {
                this.innerHTML = '<button>simulate</button><output></output>';
                let current = props.count;
                this.querySelector('output').textContent = current;
                this.querySelector('button').onclick = () => {
                  this.querySelector('output').textContent = ++current;
                };
              },
            },
          },
        });
      }
      const editor = g.init({container: '#editor', height: '350px',
        storageManager: false, plugins: [plugin], canvas: { styles: [] },
        components: [{type: 'notale-lab', attributes: {id:'lab'}}]});
      await wait();
      const comp = editor.getWrapper().components().at(0);
      const output = ed => ed.Canvas.getDocument().querySelector('#lab output');
      const click = ed => ed.Canvas.getDocument().querySelector('#lab button').click();
      const initial = output(editor)?.textContent;
      click(editor);
      const runtimeAfterClick = output(editor)?.textContent;
      editor.UndoManager.clear();
      comp.set('count', 25);
      await wait();
      const updated = output(editor)?.textContent;
      const project = JSON.parse(JSON.stringify(editor.getProjectData()));
      const persistedRuntimeMarkup = JSON.stringify(project).includes('<button>');
      editor.UndoManager.undo();
      await wait();
      const undoCount = comp.get('count');
      const undoOutput = output(editor)?.textContent;
      const restored = g.init({container: '#restored', height: '350px',
        storageManager: false, plugins: [plugin], projectData: project});
      await wait();
      const restoredCount = restored.getWrapper().components().at(0).get('count');
      const restoredOutput = output(restored)?.textContent;
      click(restored);
      const restoredAfterClick = output(restored)?.textContent;
      const custom = {initial,runtimeAfterClick,updated,undoCount,undoOutput,
        restoredCount,restoredOutput,restoredAfterClick,persistedRuntimeMarkup};
      const noPlugin = g.init({headless:true,storageManager:false});
      noPlugin.loadProjectData(project);
      const unknown = noPlugin.getWrapper().components().at(0);
      const withoutPlugin = {type: unknown.get('type'),
        traits: unknown.getTraits().map(t => t.get('name'))};
      return {version:g.version, realPage, custom, withoutPlugin};
    }""", source)
    browser.close()

results['sample'] = str(sample.relative_to(ROOT))
results['warnings'] = warnings
results['sampleSourceScriptTags'] = len(re.findall(r'<script\b', source))
results['scope'] = 'real page parser/model round-trip; synthetic component runtime; not full real-page migration'
(HERE / 'grapesjs-results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(results, ensure_ascii=False, indent=2))
assert results['realPage']['importedScriptTags'] == 0
assert results['realPage']['importedCanvasTags'] == 2
assert results['custom']['initial'] == '15'
assert results['custom']['updated'] == '25'
assert results['custom']['undoCount'] == 15
assert results['custom']['restoredOutput'] == '25'
assert results['custom']['restoredAfterClick'] == '26'
