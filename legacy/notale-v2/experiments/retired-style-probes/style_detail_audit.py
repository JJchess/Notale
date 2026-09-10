"""Read-only model output audit and clickable preview; no CSS/page repair."""
import argparse
from functools import partial
from html import escape
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
RUNS_ROOT = ROOT.parent / 'runs' / ROOT.name
from core import theme


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *_args): pass


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--prefix', required=True)
    ap.add_argument('--builder-label', help='Fresh run containing the one actual Builder integration')
    args = ap.parse_args()
    if Path(args.prefix).name != args.prefix or args.prefix in ('.', '..'):
        ap.error('prefix must be a single directory name')
    builder_label = args.builder_label or args.prefix + '-hand'
    if Path(builder_label).name != builder_label or builder_label in ('.', '..'):
        ap.error('builder-label must be a single directory name')
    output = RUNS_ROOT / (args.prefix + '-audit')
    output.mkdir(exist_ok=True)
    cases = ('auto', 'hand', 'pixel', 'fashion')
    validations = {}
    for case in cases:
        assets = RUNS_ROOT / f'{args.prefix}-{case}' / 'pages/assets'
        css = assets / 'theme.css'
        validations[case] = theme.validate(css.read_text(), assets) if css.exists() else ['missing theme']
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(RUNS_ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}/'
    records = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            for case in cases:
                row = {'case': case, 'theme_errors': validations[case], 'fonts': []}
                records.append(row)
                if row['theme_errors']: continue
                page = browser.new_page(viewport={'width': 1600, 'height': 900}, reduced_motion='reduce')
                errors, failures = [], []
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.on('requestfailed', lambda r: failures.append(r.url))
                page.route('**/*', lambda r: r.continue_() if r.request.url.startswith(base) else r.abort())
                page.goto(base + f'{args.prefix}-{case}/pages/specimen.html', timeout=120000)
                page.evaluate('document.fonts.ready')
                cdp = page.context.new_cdp_session(page)
                cdp.send('DOM.enable'); cdp.send('CSS.enable')
                doc = cdp.send('DOM.getDocument')['root']['nodeId']
                for pid in ('zh-title', 'en-title', 'zh-body', 'en-body', 'numbers'):
                    node = cdp.send('DOM.querySelector', {'nodeId': doc, 'selector': '#' + pid})['nodeId']
                    actual = cdp.send('CSS.getPlatformFontsForNode', {'nodeId': node})['fonts']
                    appearance = page.locator('#' + pid).evaluate('''e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {
                      family:s.fontFamily,weight:s.fontWeight,size:s.fontSize,style:s.fontStyle,
                      inViewport:r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1}}''')
                    row['fonts'].append({'id': pid, 'actual': actual, 'appearance': appearance,
                                         'custom': bool(actual) and all(f['isCustomFont'] for f in actual)})
                page.screenshot(path=str(output / f'{case}.png'))
                row.update(js_errors=errors, request_failures=failures,
                           ok=not errors and not failures and all(f['custom'] and f['appearance']['inViewport'] for f in row['fonts']))
                page.close()
            path = RUNS_ROOT / builder_label / 'pages/page-01.html'
            if path.exists():
                page = browser.new_page(viewport={'width': 1600, 'height': 900}, reduced_motion='reduce')
                page.add_init_script('''window.__fontDraws=[];for(const name of ['fillText','measureText']){
                  const original=CanvasRenderingContext2D.prototype[name];
                  CanvasRenderingContext2D.prototype[name]=function(text,...rest){
                    if(window.__fontDraws.length<100)window.__fontDraws.push({op:name,text:String(text),font:this.font,
                      loaded:document.fonts.check(this.font,String(text)),faces:[...document.fonts].map(f=>({family:f.family,status:f.status}))});
                    return original.call(this,text,...rest);};}''')
                page.route('**/*', lambda r: r.continue_() if r.request.url.startswith(base) else r.abort())
                page.goto(base + f'{builder_label}/pages/page-01.html', timeout=120000)
                page.evaluate('document.fonts.ready')
                row = {'case': 'builder-hand', 'kind': 'real Builder interaction'}
                records.append(row)
                try:
                    amount = lambda: float(page.locator('#amount').inner_text().replace(',', ''))
                    initial = amount()
                    page.locator('#rate').focus(); page.keyboard.press('End')
                    page.wait_for_timeout(150)
                    maximum = amount()
                    page.locator('#reset').click(); page.wait_for_timeout(150)
                    reset = amount()
                    page.screenshot(path=str(output / 'builder-hand.png'))
                    page.set_viewport_size({'width': 800, 'height': 450})
                    page.locator('#rate').focus(); page.keyboard.press('Home'); page.wait_for_timeout(150)
                    minimum = amount()
                    row.update(initial=initial, maximum=maximum, reset=reset, minimum_scaled=minimum,
                               canvas=page.evaluate('window.__fontDraws'),
                               ok=abs(initial-248.83)<.02 and abs(maximum-759.38)<.02 and abs(reset-248.83)<.02 and abs(minimum-100)<.02)
                except Exception as e:
                    row.update(ok=False, error=str(e))
                page.close()
            elif args.builder_label:
                records.append({'case': 'builder-hand', 'kind': 'real Builder interaction',
                                'ok': False, 'error': 'Builder did not produce page-01.html; integration not passed'})
            browser.close()
    finally:
        server.shutdown()
    (output / 'audit.json').write_text(json.dumps(records, ensure_ascii=False, indent=2))
    links = []
    for case in cases:
        links.append(f'<section><h2>{case}</h2><p><a href="../{args.prefix}-{case}/pages/specimen.html">打开实际主题测试页</a></p>'
                     f'<a href="{case}.png"><img src="{case}.png" alt="{case}" style="width:100%;height:auto"></a></section>')
    if (RUNS_ROOT / builder_label / 'pages/page-01.html').exists():
        links.append(f'<p><a href="../{builder_label}/pages/page-01.html">真实 Builder 手绘交互页</a></p><img src="builder-hand.png" style="max-width:100%">')
    elif args.builder_label:
        links.append('<p>Builder 集成未通过：本次在 7 分钟测试上限内未产出交互页，未继续补跑。四个主题测试页不能代替这一项。</p>')
    (output / 'index.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
        '<title>Style Director 详情升级 · 真实主题实测</title><h1>四个真实 Director 主题</h1>'
        '<p>主题 CSS 为模型生成，测试页使用相同固定内容和排布；不是四个 Builder 成品。另附的交互页才是实际 Builder 输出。</p>'
        '<p><a href="audit.json">逐项审计</a> · <a href="../style-fonts-0908/">40项中英字体样张</a></p>' + ''.join(links) + '</html>')
    print(json.dumps([{k:v for k,v in r.items() if k not in ('fonts', 'canvas')} for r in records], ensure_ascii=False, indent=2))


if __name__ == '__main__': main()
