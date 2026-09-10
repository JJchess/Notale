"""Post-generation control smoke; browser state only, no artifact/model writes."""
import argparse
import hashlib
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3] / 'notale-v2'
RUNS_ROOT = ROOT.parent / 'runs' / ROOT.name
ap = argparse.ArgumentParser(description=__doc__)
ap.add_argument('--label', required=True)
args = ap.parse_args()
assert Path(args.label).name == args.label and args.label not in ('.', '..')
run = RUNS_ROOT / args.label
report = RUNS_ROOT / (args.label + '-report') / 'verification'
rows = json.loads((report / 'browser.json').read_text())
files = [p for p in (run / 'pages').rglob('*') if p.is_file() and not p.is_symlink()]
before = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
base = f'http://localhost:4177/runs/notale-v2/{args.label}/pages/'
results = []
with sync_playwright() as pw:
    browser = pw.chromium.launch()
    for row in rows:
        if row.get('code') or row.get('missing'):
            continue
        page = browser.new_page(viewport={'width':1600, 'height':900}, reduced_motion='reduce')
        item = {'page':row['page'], 'errors':[], 'buttons':[], 'ranges':[], 'steps':[]}
        results.append(item)
        page.on('pageerror', lambda e: item['errors'].append(str(e)))
        page.goto(base + row['page'] + '.html')
        page.evaluate('document.fonts.ready')
        maximum = page.evaluate('(window.Deck && Deck.stepMax) || 0')
        for step in list(range(maximum + 1)) + list(range(maximum, -1, -1)):
            page.evaluate('(n) => window.Deck && Deck.stepTo(n)', step)
            item['steps'].append(step)
        for button in page.locator('#stage button').all():
            if not button.is_visible() or not button.is_enabled():
                continue
            label = button.inner_text()
            try:
                button.click(timeout=1500)
                item['buttons'].append(label)
            except Exception as exc:
                item['errors'].append(f'button {label}: {exc}')
        for slider in page.locator('#stage input[type=range]').all():
            if not slider.is_visible() or not slider.is_enabled():
                continue
            item['ranges'].append(slider.evaluate('''e => {
              const values=[e.min,e.max]; for(const v of values) {
                e.value=v; e.dispatchEvent(new Event('input',{bubbles:true}));
                e.dispatchEvent(new Event('change',{bubbles:true}));
              } return {id:e.id,values};
            }'''))
        page.wait_for_timeout(150)
        if row['page'] == 'page-14':
            page.set_viewport_size({'width':800,'height':450})
            page.wait_for_timeout(150)
            item['small_stage'] = page.locator('#stage').bounding_box()
            page.screenshot(path=str(report / 'page-14-small-actual.png'))
        print(item['page'], 'buttons', len(item['buttons']), 'ranges', len(item['ranges']), 'errors', len(item['errors']), flush=True)
        page.close()
    page = browser.new_page(viewport={'width':1600,'height':900})
    code = {'page':'page-06', 'errors':[]}
    results.append(code)
    try:
        page.goto(base + 'assets/lessons/page-06/index.html')
        page.wait_for_function('window.CodeLab && CodeLab.getState().editorReady && CodeLab.getState().runtimeReady', timeout=45000)
        page.click('#runButton')
        page.wait_for_function('!CodeLab.getState().running && CodeLab.getState().frameCount > 0', timeout=15000)
        code['normal_run'] = page.evaluate('CodeLab.getState()')
        page.screenshot(path=str(report / 'page-06-running.png'))
        page.evaluate('CodeLab.reset()')
        code['generation_before_loop'] = page.evaluate('CodeLab.getState().runtimeGeneration')
        page.evaluate("CodeLab.getModel().setValue('while True:\\n    pass')")
        page.click('#runButton')
        page.wait_for_function("!CodeLab.getState().running && CodeLab.getState().outputKind === 'error'", timeout=15000)
        code['infinite_loop'] = page.evaluate('CodeLab.getState()')
    except Exception as exc:
        code['errors'].append(str(exc))
    page.close()
    browser.close()
changed = [str(p.relative_to(run)) for p in files if hashlib.sha256(p.read_bytes()).hexdigest() != before[str(p)]]
data = {'pages':results, 'changed_artifacts':changed, 'limits':'Control/step runtime smoke; not exhaustive math correctness, pointer dragging, combinations or accessibility verification.'}
(report / 'controls.json').write_text(json.dumps(data, ensure_ascii=False, indent=2))
print('Code normal:', code.get('normal_run',{}).get('output'), flush=True)
print('Code infinite loop:', code.get('infinite_loop',{}).get('output'), flush=True)
print('Changed artifacts:', changed, flush=True)
