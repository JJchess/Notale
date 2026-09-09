"""Build all 40 bilingual font specimens, then audit actual browser glyph use.

These are deterministic typography specimens, not generated style/theme demos.
No model calls. Existing sample artifacts can be refreshed; source cards stay intact.
"""
import argparse
from functools import partial
from html import escape
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import sys
import threading

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from core import font_library as fonts, style_catalog as catalog

SAMPLES = {
    '中文标题': '知识的形状',
    '英文标题': 'The shape of knowledge',
    '中文正文': '理解变化，观察联系。让每一个问题，都有清楚的解释。',
    '英文正文': 'Understand the change. Each question deserves a clear explanation.',
    '数字与标签': '0123456789  20%  248.83',
}


def roles(key):
    text = (catalog.ROOT / 'details' / f'{key}.md').read_text()
    result = []
    for role, font, weight, style in re.findall(
            r'\| ([^|]+) \| \[[^\]]+\]\(\.\./\.\./\.\./vendor/fonts/([a-z0-9-]+)/\) \| (\d+) \| (normal|italic) \|', text):
        result.append({'role': role.strip(), 'font': font, 'weight': int(weight), 'style': style})
    if len(result) != 5:
        raise ValueError(f'{key}: missing font roles')
    return result


def build(output):
    output.mkdir(parents=True, exist_ok=True)
    cards, required = [], []
    for row in catalog.rows():
        entries = roles(row[0])
        cards.append({'id': row[0], 'name': row[1], 'roles': entries})
        required.extend(x['font'] for x in entries)
    css = fonts.snippets(required)
    assets = output / 'assets'
    fonts.prepare(css, assets)
    (assets / 'fonts.css').write_text(css)
    sections = []
    for card in cards:
        lines = []
        for i, item in enumerate(card['roles']):
            key, role = item['font'], item['role']
            size = 46 if role == '中文标题' else 32 if role == '英文标题' else 22
            # Deliberately no custom fallback here: expose missing glyphs in the audit.
            lines.append(f'<div class="label">{escape(role)} · {escape(key)} · {item["weight"]} {item["style"]}</div>'
                f'<div id="{card["id"]}-{i}" class="sample" lang="{"zh-CN" if role.startswith("中文") else "en"}" '
                f'style="font-family:\'NTF-{key}\',sans-serif;font-weight:{item["weight"]};'
                f'font-style:{item["style"]};font-size:{size}px">{escape(SAMPLES[role])}</div>')
        sections.append(f'<section id="{card["id"]}"><h2>{escape(card["name"])}</h2>'
            f'<p><a href="../../references/styles/details/{card["id"]}.md">风格详情</a> · '
            f'<a href="../../references/styles/shots/{card["id"]}.png">原参考图</a></p>' + ''.join(lines) + '</section>')
    html = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>40 项风格 · 中英字体实效</title><link rel="stylesheet" href="assets/fonts.css">
<style>body{margin:24px auto;padding:0 24px;max-width:1360px;font:16px/1.5 sans-serif;color:#202020;background:#fafafa}
h1{font-size:28px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,560px),1fr));gap:24px}
section{background:white;padding:24px;border:1px solid #ccc;min-width:0}h2{font-size:20px;margin:0}
.label{font:12px/1.6 monospace;color:#555;margin-top:12px}.sample{line-height:1.65;overflow-wrap:anywhere;font-synthesis:none}
nav{margin:20px 0}nav a{display:inline-block;margin:4px 12px 4px 0}</style>
<h1>40 项风格 · 中英字体实效</h1>
<p>同一组文字、真实随包字体。这里验证字体搭配与交付，不是 40 套模型生成页面。点击详情查看构图、材质和配色说明。</p>
<p><a href="audit.json">实际字体审计</a> · <a href="../../vendor/fonts/README.md">字体来源与授权</a></p><nav>'''
    html += ' '.join(f'<a href="#{c["id"]}">{escape(c["name"].split(" · ")[-1])}</a>' for c in cards)
    html += '</nav><main>' + ''.join(sections) + '</main></html>'
    (output / 'index.html').write_text(html)
    return cards


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *_args): pass


def audit(output, cards):
    from playwright.sync_api import sync_playwright
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}/'
    results, errors, failures = [], [], []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
            page.route('**/*', lambda r: r.continue_() if r.request.url.startswith(base) else r.abort())
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('requestfailed', lambda r: failures.append(r.url))
            page.goto(base + output.relative_to(ROOT).as_posix() + '/index.html', timeout=120000)
            page.evaluate('document.fonts.ready')
            cdp = page.context.new_cdp_session(page)
            cdp.send('DOM.enable'); cdp.send('CSS.enable')
            doc = cdp.send('DOM.getDocument')['root']['nodeId']
            for card in cards:
                row = {'id': card['id'], 'roles': []}
                for i, entry in enumerate(card['roles']):
                    selector = f'[id="{card["id"]}-{i}"]'
                    node = cdp.send('DOM.querySelector', {'nodeId': doc, 'selector': selector})['nodeId']
                    actual = cdp.send('CSS.getPlatformFontsForNode', {'nodeId': node})['fonts']
                    missing = fonts.missing(entry['font'], SAMPLES[entry['role']])
                    ok = not missing and bool(actual) and all(f['isCustomFont'] for f in actual)
                    row['roles'].append({**entry, 'actual': actual, 'missing': missing, 'ok': ok})
                page.locator(f'[id="{card["id"]}"]').screenshot(path=str(output / (card['id'] + '.png')))
                results.append(row)
            browser.close()
    finally:
        server.shutdown()
    report = {'kind': 'deterministic font specimens, not generated themes', 'js_errors': errors,
              'request_failures': failures, 'cards': results,
              'ok': not errors and not failures and all(r['ok'] for c in results for r in c['roles'])}
    (output / 'audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({'cards': len(results), 'roles': sum(len(c['roles']) for c in results),
                      'ok': report['ok'], 'failed': [c for c in results if any(not r['ok'] for r in c['roles'])]}, ensure_ascii=False))
    return report['ok']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--label', default='style-fonts-0908')
    args = parser.parse_args()
    if Path(args.label).name != args.label or args.label in ('.', '..'):
        parser.error('label must be a single directory name')
    output = ROOT / 'runs' / args.label
    cards = build(output)
    if not audit(output, cards): raise SystemExit(1)


if __name__ == '__main__': main()
