"""Post-run media observations; no production gates or generated-page edits."""
import argparse
import asyncio
import json
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[3] / 'notale-v2'
RUNS_ROOT = ROOT.parent / 'runs' / ROOT.name


async def audit(label):
    run = RUNS_ROOT / label
    out = run / 'verification'
    out.mkdir(exist_ok=True)
    briefs = json.loads((run / 'briefs.json').read_text())
    trace = [json.loads(line) for line in (run / 'trace.jsonl').read_text().splitlines()]
    calls = []
    for row in trace:
        if row['type'] != 'assistant':
            continue
        tag = row.get('toolUseResult') or {}
        for tool in tag.get('tools', []):
            if tool['name'] in {'ImageSearch', 'ImageGen', 'FinalizePlan', 'Read', 'Look'}:
                calls.append({'owner': tag.get('page', tag.get('step')),
                              'name': tool['name'],
                              'args': json.loads(tool['arguments']) if 'arguments' in tool else tool.get('arg')})
    rows = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=['--no-sandbox'])
        for index, brief in enumerate(briefs, 1):
            pid = f'page-{index:02d}'
            if not (run / 'pages' / f'{pid}.html').is_file():
                rows.append({'page': pid, 'missing': True})
                continue
            page = await browser.new_page(viewport={'width': 1600, 'height': 900})
            errors, requests, states = [], [], []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('requestfailed', lambda r: errors.append(f'{r.url}: {r.failure}'))
            page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
            page.on('request', lambda r: requests.append(r.url) if '/assets/img/' in r.url else None)
            await page.goto(f'http://127.0.0.1:4177/runs/notale-v2/{label}/pages/{pid}.html')
            await page.wait_for_timeout(1800)
            for state in ['initial', 'final-step']:
                if state == 'final-step':
                    has_steps = await page.evaluate('''() => {
                      if (!window.Deck?.stepTo || !(Deck.stepMax > 0)) return false;
                      Deck.stepTo(Deck.stepMax); return true;
                    }''')
                    if not has_steps:
                        continue
                    await page.wait_for_timeout(1500)
                frames = []
                for frame in page.frames:
                    frames.append(await frame.evaluate('''() => {
                      const visibility = e => {
                        const r = e.getBoundingClientRect();
                        let shown = r.width > 0 && r.height > 0;
                        for(let p=e;p;p=p.parentElement){
                          const s=getComputedStyle(p);
                          if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)shown=false;
                        }
                        return {width:r.width,height:r.height,shown,
                          inViewport:shown&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight};
                      };
                      return {url:location.href,
                        images:[...document.images].map(e=>({src:e.currentSrc||e.src,
                          loaded:e.complete&&e.naturalWidth>0,...visibility(e)})),
                        svgImages:[...document.querySelectorAll('svg image')].map(e=>({
                          src:new URL(e.href.baseVal,location.href).href,...visibility(e)})),
                        backgrounds:[...document.querySelectorAll('*')].flatMap(e=>{
                          const bg=getComputedStyle(e).backgroundImage;
                          return bg.includes('url(')?[{src:bg,...visibility(e)}]:[];
                        }),
                        resources:performance.getEntriesByType('resource').filter(r=>r.name.includes('/assets/img/')).map(r=>r.name)};
                    }'''))
                await page.screenshot(path=str(out / f'{pid}-{state}.png'))
                states.append({'state': state, 'frames': frames})
            rows.append({'page': pid, 'errors': errors, 'requests': sorted(set(requests)), 'states': states})
            await page.close()
        await browser.close()
    result = {'label': label, 'calls': calls, 'pages': rows,
              'scope': 'Initial and final authored step; not every interaction. Requests alone are not proof of visible use.'}
    (out / 'media-audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    visible = []
    for row in rows:
        for state in row.get('states', []):
            items = [i for f in state['frames'] for kind in ['images', 'svgImages', 'backgrounds'] for i in f[kind]]
            if any('/assets/img/' in i['src'] and i['inViewport'] and i.get('loaded', True) for i in items):
                visible.append(row['page'])
                break
    print(json.dumps({'label': label, 'pages': len(rows), 'visibleMediaPages': visible,
                      'errorPages': [r['page'] for r in rows if r.get('errors') or r.get('missing')]}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--label', required=True)
    args = parser.parse_args()
    if Path(args.label).name != args.label or args.label in {'.', '..'}:
        parser.error('label must be a directory name')
    asyncio.run(audit(args.label))
