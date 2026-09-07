"""Exercise the generated interaction pages without changing their files."""
import asyncio
import hashlib
import json
import re
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / 'runs/ens-trim-full-0907'
OUT = RUN / 'verification/interactions'


def recompute_adaboost():
    source = (RUN / 'pages/page-22.html').read_text()
    points = [tuple(map(float, row)) for row in re.findall(
        r'\{ id: (\d+), x: ([\d.]+), y: ([\d.]+), y_true: (-?\d+) \}', source)]
    assert len(points) == 10
    rounds = source.split('const ROUND_DATA = {', 1)[1].split('let currentRound', 1)[0]
    alphas = [float(a) for a in re.findall(r'alpha: ([\d.]+)', rounds)]
    assert len(alphas) == 3
    thresholds = [float(v) for v in re.findall(r'splitVal: ([\d.]+)', rounds)]
    predictions = []
    for pid, x, y, true in points:
        h = [1 if x <= thresholds[0] else -1,
             1 if x <= thresholds[1] else -1,
             -1 if y > thresholds[2] else 1]
        score = sum(a * v for a, v in zip(alphas, h))
        predictions.append({'id': int(pid), 'true': int(true), 'weak': h,
                            'score': round(score, 6), 'prediction': 1 if score >= 0 else -1})
    return {'method': 'Recompute displayed split rules and alpha-weighted vote from page-22 source data',
            'alphas': alphas, 'thresholds': thresholds,
            'actualRound3Mistakes': [p['id'] for p in predictions if p['weak'][2] != p['true']],
            'actualFinalMistakes': [p['id'] for p in predictions if p['prediction'] != p['true']],
            'predictions': predictions}


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    records = {}
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=['--allow-file-access-from-files'])
        for number in [7, 12, 22, 31]:
            pid = f'page-{number:02d}'
            pg = await browser.new_page(viewport={'width': 1600, 'height': 900})
            errors = []
            pg.on('pageerror', lambda err, bucket=errors: bucket.append(str(err)))
            await pg.goto((RUN / 'pages' / f'{pid}.html').as_uri(), wait_until='load')
            await pg.wait_for_timeout(1300)
            states = []
            async def capture(label):
                await pg.wait_for_timeout(100)
                data = await pg.evaluate('''() => ({
                    text: document.querySelector('#stage').innerText,
                    controls: Array.from(document.querySelectorAll('button,input,select')).map(e =>
                        ({id:e.id,text:e.textContent.trim(),value:e.value,disabled:e.disabled})),
                    canvases: Array.from(document.querySelectorAll('canvas')).map(c=>c.toDataURL())
                })''')
                data['canvasHashes'] = [hashlib.sha256(c.encode()).hexdigest() for c in data.pop('canvases')]
                states.append({'state': label, **data})
                await pg.screenshot(path=str(OUT / f'{pid}-{label}.png'))
            await capture('initial')
            if number == 7:
                await pg.locator('[data-rho="0.75"]').click()
                await capture('high-correlation')
                await pg.locator('[data-rho="0.0"]').click()
                await capture('return-independent')
            elif number == 12:
                await pg.locator('#resample-btn').click()
                await capture('resampled')
                await pg.locator('[data-m="25"]').click()
                await capture('25-trees')
            elif number == 22:
                await pg.locator('[data-round="3"]').click()
                await capture('round3')
                await pg.locator('[data-round="4"]').click()
                await capture('final')
                await pg.locator('[data-round="1"]').click()
                await capture('return-round1')
            else:
                await pg.locator('#card-boosting').click()
                await capture('variance-mismatch')
                await pg.locator('#btn-task-1').click()
                await pg.locator('#card-boosting').click()
                await capture('underfit-boosting')
                await pg.locator('#btn-task-2').click()
                await pg.locator('#card-stacking').click()
                await capture('complementary-stacking')
                await pg.locator('#btn-task-0').click()
                await pg.locator('#card-bagging').click()
                await capture('return-initial-choice')
            records[pid] = {'errors': errors, 'states': states}
            await pg.close()
        await browser.close()
    records['adaboostRecalculation'] = recompute_adaboost()
    (OUT / 'results.json').write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(records['adaboostRecalculation'], ensure_ascii=False), flush=True)
    print('Interaction evidence:', OUT, flush=True)


if __name__ == '__main__':
    asyncio.run(main())
