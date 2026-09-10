"""Post-run browser audit and gallery; no model calls or lesson artifact edits."""
import argparse
from collections import Counter
from datetime import datetime
from html import escape
import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[3] / 'notale-v2'
RUNS_ROOT = ROOT.parent / 'runs' / ROOT.name
sys.path.insert(0, str(ROOT))
from scripts.style_e2e import save


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--label', required=True)
    ap.add_argument('--summary-only', action='store_true')
    args = ap.parse_args()
    if Path(args.label).name != args.label or args.label in ('.', '..'):
        ap.error('Use one run label')
    run = RUNS_ROOT / args.label
    report = RUNS_ROOT / (args.label + '-report')
    state = json.loads((report / 'result.json').read_text())
    if state['phase'] not in ('generated', 'browser_checked'):
        ap.error('Generation must finish before browser verification')
    spec = importlib.util.spec_from_file_location('full_deck_browser_audit', Path(__file__).with_name('audit.py'))
    audit = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(audit)
    audit.LABEL, audit.RUN, audit.REPORT = args.label, run, report
    audit.BASE = f'http://localhost:4177/runs/notale-v2/{args.label}/pages/'
    if not args.summary_only:
        original = sys.argv
        try:
            sys.argv = ['browser-audit']
            audit.main()
        finally:
            sys.argv = original
    output = report / 'verification'
    rows = json.loads((output / 'browser.json').read_text())
    built = json.loads((run / 'builder-results.json').read_text())
    manifest = json.loads((run / 'builder-manifest.json').read_text())
    experiment = json.loads((report / 'experiment.json').read_text())
    missing = [r['page'] for r in rows if r.get('missing')]
    errors = [r['page'] for r in rows if r.get('runtime_errors') or r.get('audit_error') or r.get('theme_errors')]
    fatal = [pid for pid, result in built.items() if (result.get('audit') or {}).get('fatal_errors')]
    delivered = [r for r in rows if not r.get('missing')]
    profiles = sorted({p['profile'] for p in built.values()})
    assert profiles == ['gemini38-google-low'], profiles
    assert all(p == 'gemini38-google-low' for p in manifest['workflowProfiles'].values())
    assert experiment['planner_model'] == experiment['director_model'] == 'gemini-3.8-flash'
    assert experiment['planner_effort'] == 'low'
    assert all(r.get('artifact_unchanged') for r in delivered)
    trace = [json.loads(line) for line in (run / 'trace.jsonl').read_text().splitlines()]
    by_id = {r['uuid']: r for r in trace}
    durations = []
    for row in trace:
        if row['type'] != 'assistant' or not (row.get('toolUseResult') or {}).get('page'):
            continue
        parent = by_id.get(row.get('parentUuid'))
        if parent:
            dt = lambda t: datetime.fromisoformat(t.replace('Z', '+00:00'))
            durations.append((dt(row['timestamp']) - dt(parent['timestamp'])).total_seconds())
    review_path = output / 'review.json'
    review = json.loads(review_path.read_text()) if review_path.exists() else {}
    summary = {
        'planned': len(state['pages']), 'delivered': len(delivered), 'missing': missing,
        'runtime_passed': not missing and not errors and not fatal and len(built) == len(state['pages']),
        'browser_error_pages': errors, 'fatal_audit_pages': fatal,
        'models': {'planner': experiment['planner_model'], 'director': experiment['director_model'],
                   'builder_profiles': profiles, 'effort': 'low', 'adapter': experiment['adapter']},
        'query_sha256': experiment['query_sha256'], 'generation_seconds': state['seconds'],
        'planner_seconds': state['planner_seconds'], 'builder_seconds': state['builder_seconds'],
        'responses': sum(p['calls'] for p in built.values()),
        'slowest_pages': sorted([{'page': pid, 'seconds': r['seconds'], 'calls': r['calls']}
                                for pid, r in built.items()], key=lambda r: r['seconds'], reverse=True)[:5],
        'request_seconds_sum_not_wall_time': round(sum(durations), 1),
        'half_scale_failures': [r['page'] for r in delivered if not r.get('code') and not r.get('scaling_ok')],
        'headings': dict(Counter(t['size'] for r in delivered for t in r['initial']['titles'][:1])),
        'system_fallback_elements': {r['page']: len(r['system_fallback']) for r in delivered if r.get('system_fallback')},
        'theme_unchanged': state['theme_unchanged'], 'changed_code': state['changed_code'],
        'review': review, 'limits': 'Browser checks and screenshots are not exhaustive semantic or interaction verification.',
    }
    save(output / 'summary.json', summary)
    state.update(phase='browser_checked', verification='verification/summary.json',
                 visual_review=review.get('visual_status', 'pending'),
                 content_review=review.get('content_status', 'pending'))
    save(report / 'result.json', state)
    cards = []
    for row in rows:
        pid = row['page']
        info = built.get(pid, {})
        note = (review.get('pages') or {}).get(pid, '浏览器已检查；内容与交互不据此判定通过。')
        image = ('<div class="missing">未交付</div>' if row.get('missing') else
                 f'<a href="../{args.label}/pages/{pid}.html"><img loading="lazy" src="verification/{pid}.png"></a>')
        cards.append(f'<article><h2><a href="../{args.label}/pages/{pid}.html">{pid}</a> · '
                     f'{info.get("calls", "?")} 次响应 · {info.get("seconds", 0)/60:.1f} 分</h2>{image}'
                     f'<p>{escape(note)}</p><a href="verification/{pid}.json">浏览器记录</a></article>')
    (report / 'index.html').write_text('<!doctype html><html lang="zh"><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width"><title>Gemini 神经网络完整 auto</title>'
        '<style>body{font:16px/1.6 system-ui;margin:28px;background:#fafaf8;color:#222}'
        'section{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}'
        'article{border-top:1px solid #ccc;min-width:0}h2{font-size:17px}img{width:100%;display:block}'
        '.missing{aspect-ratio:16/9;display:grid;place-items:center;background:#eee}'
        '@media(max-width:850px){section{grid-template-columns:1fr}}</style>'
        f'<h1>神经网络 · Gemini 3.8 Flash low · {len(rows)} 页</h1>'
        f'<p>规划 {len(rows)} 页，交付 {len(delivered)} 页；总生成 {state["seconds"]/60:.1f} 分钟，'
        f'其中 Builder {state["builder_seconds"]/60:.1f} 分钟。</p>'
        '<p>原始 120 分钟 query，全角色 Gemini low，Google 官方路由，并发 30，mini+aux，notes=notes。'
        '未改生成页、未补跑、未换模型。运行检查不等于内容与交互全部通过。</p>'
        f'<p>视觉：{escape(review.get("visual_status", "待审阅"))}；内容：{escape(review.get("content_status", "待审阅"))}。</p>'
        '<p><a href="experiment.json">冻结输入</a> · <a href="verification/summary.json">验证统计</a> · '
        '<a href="builder.log">Builder 日志</a> · <a href="planner.log">Planner/Director 日志</a></p>'
        '<section>' + ''.join(cards) + '</section></html>')
    if not args.summary_only:
        from PIL import Image, ImageDraw
        for start in range(0, len(rows), 9):
            sheet = Image.new('RGB', (1600, 990), '#eeeeee')
            draw = ImageDraw.Draw(sheet)
            for slot, row in enumerate(rows[start:start+9]):
                x, y = (slot % 3) * 533, (slot // 3) * 330
                path = output / f'{row["page"]}.png'
                if path.is_file():
                    with Image.open(path) as shot:
                        shot.thumbnail((533, 300))
                        sheet.paste(shot.convert('RGB'), (x, y + 25))
                draw.text((x + 8, y + 5), row['page'], fill='black')
            sheet.save(output / f'contact-{start//9+1}.jpg', quality=90)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
