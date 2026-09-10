"""Read-only four-page observation; never repairs model artifacts."""
import json
from pathlib import Path
import re
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
ARMS = ('hand-blue', 'hand-red', 'bento-blue', 'bento-red')
records = []
with sync_playwright() as pw:
    browser = pw.chromium.launch()
    for arm in ARMS:
        page = browser.new_page(viewport={'width': 1600, 'height': 900}, reduced_motion='reduce')
        page.set_default_timeout(8000)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        row = {'arm': arm}
        try:
            page.goto(f'http://127.0.0.1:4177/notale-v2/runs/style-compose-0910-neutral-{arm}/pages/page-03.html', wait_until='load', timeout=15000)
            page.evaluate('document.fonts.ready')
            page.screenshot(path=str(HERE / f'{arm}.png'))
            row['amounts'] = [float(page.locator('#amount').inner_text())]
            page.locator('#rate').focus()
            page.keyboard.press('End')
            page.wait_for_function('Math.abs(parseFloat(document.querySelector("#amount").textContent)-759.38)<.02')
            row['amounts'].append(float(page.locator('#amount').inner_text()))
            page.locator('#reset').click()
            page.wait_for_function('Math.abs(parseFloat(document.querySelector("#amount").textContent)-248.83)<.02')
            row['amounts'].append(float(page.locator('#amount').inner_text()))
            page.set_viewport_size({'width': 800, 'height': 450})
            page.wait_for_function('Math.abs(document.querySelector("#stage").getBoundingClientRect().width-800)<1')
            page.locator('#rate').focus()
            page.keyboard.press('Home')
            page.wait_for_function('Math.abs(parseFloat(document.querySelector("#amount").textContent)-100)<.02')
            row['amounts'].append(float(page.locator('#amount').inner_text()))
            row['stage_scaled'] = page.locator('#stage').bounding_box()
            row['title'] = page.locator('h1').first.evaluate('(e)=>({text:e.innerText,family:getComputedStyle(e).fontFamily})')
            cdp = page.context.new_cdp_session(page)
            cdp.send('DOM.enable')
            cdp.send('CSS.enable')
            root = cdp.send('DOM.getDocument')['root']['nodeId']
            node = cdp.send('DOM.querySelector', {'nodeId':root,'selector':'h1'})['nodeId']
            row['actual_title_fonts'] = cdp.send('CSS.getPlatformFontsForNode', {'nodeId':node})['fonts']
            row['containers'] = page.evaluate('''()=>[...document.querySelectorAll('[class*="card"],[class*="box"]')].map(e=>{const s=getComputedStyle(e);return {class:e.className,bg:s.backgroundColor,border:s.border,shadow:s.boxShadow};})''')
            row['interaction_ok'] = all(abs(a-b)<.02 for a,b in zip(row['amounts'],[248.83,759.38,248.83,100]))
        except Exception as exc:
            row['error'] = str(exc)
        row['js_errors'] = errors
        records.append(row)
        page.close()
    browser.close()

def normalized(css):
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    css = re.sub(r'url\([^)]*\)', 'url(RESOURCE)', css)
    css = re.sub(r'#[\da-fA-F]{3,8}\b|(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*\)', 'COLOR', css)
    return re.sub(r'\s+', '', css)

pairs = {}
for style in ('hand', 'bento'):
    css = [(HERE.parent / f'style-compose-0910-neutral-{style}-{color}/pages/assets/theme.css').read_text() for color in ('blue','red')]
    pairs[style] = {'same_after_color_url_comment_normalization': normalized(css[0]) == normalized(css[1])}
(HERE / 'audit.json').write_text(json.dumps({'pages':records,'pairs':pairs}, ensure_ascii=False, indent=2))
print(json.dumps({'pages':records,'pairs':pairs}, ensure_ascii=False))
