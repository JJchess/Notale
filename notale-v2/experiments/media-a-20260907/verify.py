"""Post-run browser evidence. No assertions about image relevance from counts alone."""
import argparse
import asyncio
import json
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]


async def main(label):
    run = ROOT / 'runs' / label
    target = run / 'verification'
    target.mkdir(exist_ok=True)
    briefs = json.loads((run / 'briefs.json').read_text())
    rows = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, args=['--no-sandbox'])
        for index, brief in enumerate(briefs, 1):
            pid = f'page-{index:02d}'
            file = run / 'pages' / f'{pid}.html'
            if not file.exists():
                rows.append({'page': pid, 'missing': True})
                continue
            page = await browser.new_page(viewport={'width': 1600, 'height': 900}, device_scale_factor=1)
            errors = []
            page.on('pageerror', lambda exc: errors.append(str(exc)))
            page.on('requestfailed', lambda req: errors.append(f'{req.url}: {req.failure}'))
            page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
            await page.goto(f'http://127.0.0.1:4177/notale-v2/runs/{label}/pages/{pid}.html', wait_until='load')
            await page.wait_for_timeout(1500)
            frames = []
            for frame in page.frames:
                frames.append(await frame.evaluate('''() => ({
                    url: location.href,
                    images: [...document.images].map(i => ({src:i.currentSrc || i.src,
                      loaded:i.complete && i.naturalWidth>0,
                      width:i.getBoundingClientRect().width, height:i.getBoundingClientRect().height})),
                    mediaResources:performance.getEntriesByType('resource')
                      .filter(r=>r.name.includes('/assets/img/') && !r.name.endsWith('.json'))
                      .map(r=>r.name)
                })'''))
            await page.screenshot(path=str(target / f'{pid}.png'))
            rows.append({'page': pid, 'errors': errors, 'frames': frames,
                         'assignedMedia': '本页可用素材' in brief['prompt']})
            await page.close()
        await browser.close()
    (target / 'browser.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2))
    print(json.dumps({'label': label, 'pages': len(rows),
                      'errorPages': [r['page'] for r in rows if r.get('errors') or r.get('missing')],
                      'mediaPages': [r['page'] for r in rows if any(
                          i['loaded'] and '/assets/img/' in i['src'] and i['width'] > 0 and i['height'] > 0
                          for f in r.get('frames', []) for i in f['images'])]},
                     ensure_ascii=False))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--label', required=True)
    args = ap.parse_args()
    if Path(args.label).name != args.label or args.label in {'.', '..'}:
        ap.error('label must be a directory name')
    asyncio.run(main(args.label))
