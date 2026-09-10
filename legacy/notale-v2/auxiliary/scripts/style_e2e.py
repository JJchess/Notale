"""Three real Planner + Director -> Builder experiments, pinned Gemini low baseline.

No fixed page HTML, manual repair, model swapping, or automatic fresh-run retry.
Run only on explicit request: model calls are paid. Each route uses a new label.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from functools import partial
from hashlib import sha256
from html import escape
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import subprocess
import sys
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
RUNS_ROOT = ROOT.parent / 'experiments' / 'runs' / ROOT.name
from core import llm, planner, theme

MODEL_PROFILE = 'gemini38-google-low'


def model_args(stage):
    """Use the same explicit profile for every role, without changing config.yaml."""
    profile = llm.resolve_builder_profile(llm.config(), MODEL_PROFILE)
    if stage == 'planner':  # Director shares this subprocess's runtime.
        return ['--model', profile.model, '--wire', profile.adapter,
                '--base-url', profile.base_url, '--key-env', profile.api_key_env,
                '--effort', profile.reasoning_effort]
    if stage == 'builder':
        return ['--profile', profile.id, '--uniform', '--samples', 'mini',
                '--aux-samples', '--notes', 'notes']
    raise ValueError(f'Unknown experiment stage: {stage}')

QUERY = '''制作恰好3页的中英混排微课《指数增长 / Exponential Growth》，不要代码页。
第1页[标题页]：一个可读的中英题名，提出“为什么每年新增额越来越大”，用有意义的视觉关系引入。
第2页[内容页]：用真实数据图和必要计算解释复利与固定增加20的区别，不制造假KPI。
第3页[交互页]：本金100、增长率r默认20%，用户可在0..50%之间调节；实时画0..5年的曲线并显示第5年金额，提供重置。
确定性事实：A(n)=100*(1+r)^n；r=20%时n=0..5依次为100、120、144、172.8、207.36、248.832；显示金额保留两位小数。
交互测试约定：滑块input[type=range]的id为rate，显示第5年纯数字金额的元素id为amount（不含货币符号），重置按钮id为reset。
滑块min=0、max=50、value=20，单位百分比；Home到0%、End到50%，最大时第5年金额759.38，重置回248.83。
各页都保留必要中文与英文文字，使用主题提供的中英字体、图表和控件样式。
这是内容要求，不规定页面坐标；Planner自行写三页页表，Builder自行完成每页。
全部图形可由原生HTML/SVG/Canvas实现，不需要外部搜索、生成图片或录音。'''


def now():
    return datetime.now(timezone.utc).isoformat()


def hashes():
    paths = [ROOT / 'config.yaml', *sorted((ROOT / 'core').glob('*.py')),
             *sorted((ROOT / 'prompts').glob('*.md')),
             *sorted((ROOT / 'skills/style-director').rglob('*.md')),
             *sorted((ROOT / 'skills/style-director/shots').glob('*.png')),
             *sorted((ROOT / 'skills/style-director/contact-sheets').glob('*.png')),
             *sorted((ROOT / 'skills').rglob('*.md')),
             *sorted((ROOT / 'vendor/chassis').glob('*')),
             Path(__file__).resolve()]
    paths = [p for p in paths if p.is_file()]
    return {p.relative_to(ROOT).as_posix(): sha256(p.read_bytes()).hexdigest() for p in paths}


def save(path, obj):
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')
    tmp.replace(path)


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *_args): pass


def render_finished(report):
    """Render existing evidence only; never rerun a model or alter a model artifact."""
    summary = json.loads((report / 'summary.json').read_text())
    review = ('<h2>补充检查与人工复核</h2><ul>'
              + ''.join(f'<li>{escape(note)}</li>' for note in summary.get('review_notes', []))
              + '</ul>') if summary.get('review_notes') else ''
    sections = []
    for result in summary['results']:
        name, label = result['route'], result['label']
        pages = result.get('builder_pages', {})
        delivered = sum(bool(p.get('artifact_present')) for p in pages.values())
        cards = []
        for i in (1, 2, 3):
            pid = f'page-{i:02d}'
            shot = report / name / f'{pid}.png'
            content = (f'<a href="../{escape(label)}/pages/{pid}.html">'
                       f'<img width="400" src="{name}/{pid}.png" alt="{name} {pid}"></a>'
                       if shot.exists() else '<p>未交付</p>')
            cards.append(f'<td><h3>第 {i} 页</h3>{content}</td>')
        seconds = result.get('seconds', 0)
        links = ' · '.join(f'<a href="{name}/{file}">{title}</a>' for file, title in (
            ('planner.log', 'Planner / Director 日志'), ('builder.log', 'Builder 日志'),
            ('result.json', '结构化结果'), ('audit.json', '浏览器审计')) if (report / name / file).exists())
        sections.append(f'<section><h2>{escape(name)} · {delivered}/3 页 · {seconds/60:.1f} 分钟</h2>'
            f'<p>整路：{"通过" if result.get("passed") else "未通过"}。运行检查不等于内容与视觉质量通过。</p>'
            f'<p>{escape(result.get("error", ""))}</p><table><tr>{"".join(cards)}</tr></table>'
            f'<p>{links}</p></section>')
    (report / 'index.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width"><title>Style Director 端到端实验结果</title>'
        '<style>body{font:16px/1.6 system-ui;margin:32px}table{width:100%;table-layout:fixed}'
        'td{vertical-align:top}img{width:100%;height:auto}section{margin:32px 0;border-top:1px solid #ccc}</style>'
        '<h1>Style Director 真实端到端实验结果</h1><p>无手写成品、人工修页、换模型或失败后新建 run 补跑。'
        '截图可点击打开真实页面；未交付项保留为空。</p>'
        '<p><a href="../../STYLE-E2E-0909-VALIDATION.md">完整实验记录与人工审阅</a> · '
        '<a href="summary.json">完整结果</a> · <a href="experiment.json">冻结输入</a></p>'
        + review + ''.join(sections) + '</html>')


def audit(run, output):
    from playwright.sync_api import sync_playwright
    assets = run / 'pages/assets'
    bad = theme.validate((assets / 'theme.css').read_text(), assets)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(run / 'pages')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}/'
    records = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            for number in (1, 2, 3):
                pid = f'page-{number:02d}'
                row = {'page': pid, 'theme_errors': bad}
                records.append(row)
                if not (run / 'pages' / f'{pid}.html').is_file():
                    row.update(ok=False, error='missing page')
                    continue
                page = browser.new_page(viewport={'width': 1600, 'height': 900}, reduced_motion='reduce')
                errors, failed, fonts_requested = [], [], []
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.on('requestfailed', lambda r: failed.append(r.url))
                page.on('response', lambda r: failed.append(f'{r.status} {r.url}') if r.status >= 400 else None)
                page.on('request', lambda r: fonts_requested.append(r.url) if r.resource_type == 'font' else None)
                page.route('**/*', lambda r: r.continue_() if r.request.url.startswith(base) else r.abort())
                try:
                    page.goto(base + f'{pid}.html', timeout=120000)
                    page.evaluate('document.fonts.ready')
                    page.wait_for_timeout(500)
                    cdp = page.context.new_cdp_session(page)
                    cdp.send('DOM.enable'); cdp.send('CSS.enable')
                    doc = cdp.send('DOM.getDocument')['root']['nodeId']
                    targets = page.evaluate('''()=>[...document.querySelectorAll('#stage h1,#stage h2,#stage .nt-title,#stage .nt-body')]
                      .filter((e,i,a)=>a.indexOf(e)===i&&e.getBoundingClientRect().width&&e.textContent.trim()).slice(0,8)
                      .map((e,i)=>{e.dataset.e2eFont=String(i);return {selector:`[data-e2e-font="${i}"]`,text:e.textContent.slice(0,160),
                        family:getComputedStyle(e).fontFamily};})''')
                    for target in targets:
                        node = cdp.send('DOM.querySelector', {'nodeId': doc, 'selector': target['selector']})['nodeId']
                        target['actual'] = cdp.send('CSS.getPlatformFontsForNode', {'nodeId': node})['fonts']
                    row['fonts'] = targets
                    row['font_requests'] = fonts_requested
                    row['stage'] = page.evaluate('''()=>{const e=document.querySelector('#stage'),s=getComputedStyle(e);
                      return {variant:document.documentElement.dataset.variant||'',background:s.backgroundImage,
                        width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,
                        text:e.innerText.slice(0,1800)};}''')
                    page.screenshot(path=str(output / f'{pid}.png'))
                    if number == 3:
                        amount = lambda: float(page.locator('#amount').inner_text().strip().replace(',', ''))
                        initial = amount()
                        page.locator('#rate').focus(); page.keyboard.press('End'); page.wait_for_timeout(200)
                        maximum = amount()
                        page.locator('#reset').click(); page.wait_for_timeout(200)
                        reset = amount()
                        page.set_viewport_size({'width': 800, 'height': 450})
                        page.locator('#rate').click(); page.keyboard.press('Home'); page.wait_for_timeout(200)
                        minimum = amount()
                        row['interaction'] = {'initial': initial, 'maximum': maximum, 'reset': reset, 'minimum_scaled': minimum,
                            'ok': abs(initial-248.83)<.02 and abs(maximum-759.38)<.02 and abs(reset-248.83)<.02 and abs(minimum-100)<.02}
                        page.screenshot(path=str(output / 'interaction-small.png'))
                    row.update(js_errors=errors, failed_requests=failed,
                               ok=not bad and not errors and not failed and row.get('interaction', {'ok': True})['ok'])
                except Exception as exc:
                    row.update(ok=False, error=f'{type(exc).__name__}: {exc}', js_errors=errors, failed_requests=failed)
                finally:
                    page.close()
            browser.close()
    finally:
        server.shutdown()
    save(output / 'audit.json', records)
    return records


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--prefix', required=True)
    ap.add_argument('--route', choices=('all','auto','reference','modify'), default='all',
                    help='Only run the explicitly selected route; default: all three')
    args = ap.parse_args()
    if Path(args.prefix).name != args.prefix or args.prefix in ('.', '..'):
        ap.error('Use one run prefix')
    cases = [('auto', None, None),
             ('reference', ROOT / 'skills/style-director/shots/19-hand-drawn.png', '19-hand-drawn'),
             ('modify', RUNS_ROOT / 'style-details-0908a-auto/pages/assets', '38-fashion-editorial')]
    cases = [case for case in cases if args.route == 'all' or case[0] == args.route]
    report = RUNS_ROOT / (args.prefix + '-report')
    if report.exists() or any((RUNS_ROOT / f'{args.prefix}-{name}').exists() for name, _, _ in cases):
        ap.error('Use a fresh prefix; no result is overwritten')
    for _, template, _ in cases:
        if template and not template.exists(): ap.error(f'Missing input: {template}')
    # Read-only preflight of the real reusable theme before any paid calls.
    source = next((template for name, template, _ in cases if name == 'modify'), None)
    source_hash = None
    if source:
        bad = theme.validate((source / 'theme.css').read_text(), source)
        if bad: ap.error('Source theme invalid: ' + '; '.join(bad))
        source_hash = sha256((source / 'theme.css').read_bytes()).hexdigest()
    report.mkdir()
    profile = llm.resolve_builder_profile(llm.config(), MODEL_PROFILE)
    save(report / 'experiment.json', {'started': now(), 'query': QUERY, 'source_theme_sha256': source_hash,
        'source_theme': str(source / 'theme.css') if source else None, 'code_before': hashes(),
        'routes': [name for name, _, _ in cases],
        'models': {'profile': profile.id, 'planner_model': profile.model,
                   'director_model': profile.model, 'builder_model': profile.model,
                   'effort': profile.reasoning_effort, 'adapter': profile.adapter,
                   'base_url': profile.base_url, 'uniform_builders': True},
        'samples': 'mini', 'aux': True, 'notes': 'notes',
        'no_model_override': False, 'style_director_default': True})
    sections = []
    for name, template, style in cases:
        folder = report / name
        folder.mkdir()
        save(folder / 'result.json', {'route': name, 'phase': 'pending', 'template': str(template) if template else None, 'style': style})
        sections.append(f'<section><h2>{name}</h2><pre id="{name}"></pre><p><a href="{name}/planner.log">Planner日志</a> · '
            f'<a href="{name}/builder.log">Builder日志</a> · <a href="{name}/audit.json">独立审计</a></p>'
            + ' · '.join(f'<a href="../{args.prefix}-{name}/pages/page-{i:02d}.html">第{i}页</a>' for i in (1,2,3)) + '</section>')
    (report / 'index.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
        '<title>Style Director 端到端实验</title><h1>Style Director 真实端到端实验</h1>'
        '<p>Planner 与 Director 并行 → Builder 每路3页 → 浏览器审计。无手写成品、人工修页或换模型补跑。未产出时页面链接可能暂不可用。</p>'
        + ''.join(sections) + '''<script>async function update(){for(const n of ['auto','reference','modify']){
        if(!document.getElementById(n))continue;
        try{const r=await(await fetch(n+'/result.json',{cache:'no-store'})).json();document.getElementById(n).textContent=JSON.stringify(r,null,2)}catch{}}}
        update();setInterval(update,10000)</script></html>''')

    def one(case):
        name, template, style = case
        label = args.prefix + '-' + name
        folder, root = report / name, RUNS_ROOT / label
        result = {'route': name, 'label': label, 'started': now(), 'phase': 'planner+director'}
        save(folder / 'result.json', result)
        t0 = time.monotonic()
        try:
            cmd = [sys.executable, '-B', '-m', 'core.planner', '--label', label, '--query', QUERY,
                   '--minutes', '6', '--audience', '理解乘法的中英双语初学者', '--scenario', '投影课堂与课后自学',
                   *model_args('planner')]
            if template: cmd += ['--template', str(template)]
            if style: cmd += ['--style', style]
            with (folder / 'planner.log').open('w') as log:
                proc = subprocess.run(cmd, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
            result['planner_exit'] = proc.returncode
            result['planner_seconds'] = round(time.monotonic()-t0, 1)
            if proc.returncode: raise RuntimeError('Planner/Director failed; see planner.log')
            pages = planner.split_pages((root / 'pages/plan/pages.md').read_text())
            if sorted(pages) != ['01', '02', '03']:
                raise RuntimeError(f'Planner did not produce the requested 3 pages: {sorted(pages)}')
            result['phase'] = 'builder'
            save(folder / 'result.json', result)
            print(name, 'Planner+Director completed; starting real Builder', flush=True)
            tb = time.monotonic()
            with (folder / 'builder.log').open('w') as log:
                proc = subprocess.run([sys.executable, '-B', '-m', 'core.builder', '--label', label,
                                       '--concurrency', '3', *model_args('builder')],
                                      cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
            result.update(builder_exit=proc.returncode, builder_seconds=round(time.monotonic()-tb, 1), phase='audit')
            save(folder / 'result.json', result)
            built = json.loads((root / 'builder-results.json').read_text()) if (root / 'builder-results.json').exists() else {}
            result['builder_pages'] = {k: {field: v.get(field) for field in ('calls','seconds','termination','artifact_present','why')}
                                       for k,v in built.items()}
            result['browser'] = audit(root, folder)
            result['passed'] = (proc.returncode == 0 and len(built) == 3 and all(v.get('artifact_present') and
                v.get('termination') == 'no_tool_use' and not (v.get('audit') or {}).get('fatal_errors') for v in built.values())
                and all(r['ok'] for r in result['browser']))
            result['phase'] = 'finished'
        except Exception as exc:
            result.update(phase='failed', passed=False, error=f'{type(exc).__name__}: {exc}')
        result.update(finished=now(), seconds=round(time.monotonic()-t0, 1))
        save(folder / 'result.json', result)
        print(name, result['phase'], 'passed=', result.get('passed'), flush=True)
        return result

    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(one, cases))
    before = json.loads((report / 'experiment.json').read_text())
    after = hashes()
    save(report / 'summary.json', {'results': results, 'finished': now(),
        'source_theme_unchanged': sha256((source / 'theme.css').read_bytes()).hexdigest() == source_hash if source else None,
        'changed_code_during_experiment': [k for k,v in before['code_before'].items() if after.get(k) != v]})
    render_finished(report)
    print('REPORT', report, flush=True)
    raise SystemExit(0 if all(r.get('passed') for r in results) else 1)


if __name__ == '__main__': main()
