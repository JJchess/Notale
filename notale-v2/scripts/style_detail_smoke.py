"""Four bounded real Director cases; one optional normal Builder integration.

Paid model calls, no automatic reruns of cases. Results preserve errors and call
counts. Specimen HTML is deterministic and is NOT attributed to the Builder.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from core import director, planner

QUERY = ('知识的形状 / The shape of knowledge：用本金100、年增长率20%解释指数增长。'
         '这次要明确中英标题、正文、数字字体，给出可直接使用的 .nt-title、.nt-body、.nt-number 接口；'
         '混排文字保持可读。只测试字体与原生CSS材质，不需搜索或生成新图片。')


def build_once(run):
    try:
        proc = subprocess.run([sys.executable, '-B', '-m', 'core.builder', '--label', run.label,
                               '--only', 'page-01', '--concurrency', '1'], cwd=ROOT, timeout=420)
        return {'builder_exit': proc.returncode, 'builder_timeout': False}
    except subprocess.TimeoutExpired:
        return {'builder_exit': 124, 'builder_timeout': True, 'timeout_seconds': 420}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--prefix', required=True)
    ap.add_argument('--builder', action='store_true', help='Add one normal Builder interaction page after hand-drawn theme')
    ap.add_argument('--builder-from', help='Copy a completed theme/brief into a fresh run and test only the Builder')
    args = ap.parse_args()
    if Path(args.prefix).name != args.prefix or args.prefix in ('.', '..'):
        ap.error('prefix must be one directory name')
    if args.builder_from:
        if Path(args.builder_from).name != args.builder_from or args.builder_from in ('.', '..'):
            ap.error('builder-from must be one run label')
        source = ROOT / 'runs' / args.builder_from
        for required in ('pages/assets/theme.css', 'pages/plan/pages.md', 'pages/plan/p01.md'):
            if not (source / required).is_file():
                ap.error(f'Missing input: {source / required}')
        run = planner.Run(QUERY, 5, '中英混排的课堂读者', args.prefix, '投影课堂')
        shutil.copytree(source / 'pages/assets', run.assets, dirs_exist_ok=True)
        shutil.copytree(source / 'pages/plan', run.pages / 'plan')
        briefs = planner.briefs(run, ['01'])
        (run.root / 'briefs.json').write_text(json.dumps([asdict(b) for b in briefs], ensure_ascii=False, indent=2))
        planner.seed(run, ROOT / 'vendor/chassis', ROOT / 'vendor/chassis/lib')
        result = {'source': args.builder_from, 'director_calls': 0, **build_once(run)}
        (run.root / 'style-detail-result.json').write_text(json.dumps(
            result, indent=2))
        print(json.dumps(result), flush=True)
        raise SystemExit(result['builder_exit'])
    cases = [('auto', None), ('hand', '19-hand-drawn'), ('pixel', '20-pixel'), ('fashion', '38-fashion-editorial')]
    # Validate all destinations before the first paid request.
    for name, _ in cases:
        if (ROOT / 'runs' / f'{args.prefix}-{name}').exists():
            ap.error('Use a fresh prefix; existing results are never overwritten')

    def one(case):
        name, style = case
        template = ROOT / 'references/styles/shots' / f'{style}.png' if style else None
        run = planner.Run(QUERY, 5, '中英混排的课堂读者', f'{args.prefix}-{name}', '投影课堂', template=template, style=style)
        assets = run.root / 'pages/assets'
        assets.mkdir(parents=True, exist_ok=True)
        planner.seed(run, ROOT / 'vendor/chassis', ROOT / 'vendor/chassis/lib')
        result = {'case': name, 'ok': False}
        try:
            result.update(director.direct(run, 'medium'))
            result['ok'] = True
            html = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<link rel="stylesheet" href="assets/base.css"><link rel="stylesheet" href="assets/theme.css">
<style>.probe-layout{position:absolute;inset:64px;display:flex;flex-direction:column;justify-content:space-around}
.probe-layout>div{max-width:1420px}</style><div id="stage"><div class="probe-layout">
<div class="nt-title" id="zh-title">知识的形状</div>
<div class="nt-title" id="en-title" lang="en">The shape of knowledge</div>
<div class="nt-body" id="zh-body">理解变化，观察联系。让每一个问题，都有清楚的解释。</div>
<div class="nt-body" id="en-body" lang="en">Understand the change. Each question deserves a clear explanation.</div>
<div class="nt-number" id="numbers">0123456789 20% 248.83</div>
</div></div><script src="assets/base.js"></script></html>'''
            (run.root / 'pages/specimen.html').write_text(html)
            if args.builder and name == 'hand':
                brief = ('# page-01 [交互页]\n中英混排交互：知识的形状 / The shape of knowledge。'
                         '本金100，年增长率r默认20%，范围0..50%，计算第5年金额100*(1+r)^5。'
                         '一个键盘可操作滑块实时更新读数，重置按钮回到20%。'
                         '用Canvas画0..5年的曲线及中英标签；加载主题字体后再测量和绘字。'
                         '固定DOM ID rate、amount、reset，amount仅显示两位小数金额。'
                         '展示中英标题、解释和公式，不需要外部图片。')
                plan = run.root / 'pages/plan'
                plan.mkdir(exist_ok=True)
                (plan / 'pages.md').write_text(brief)
                (plan / 'p01.md').write_text(brief)
                briefs = planner.briefs(run, ['01'])
                (run.root / 'briefs.json').write_text(json.dumps([asdict(b) for b in briefs], ensure_ascii=False, indent=2))
                result.update(build_once(run))
        except Exception as exc:
            result['error'] = f'{type(exc).__name__}: {exc}'
            result['model_calls'] = getattr(run, '_style_calls', 0)
        (run.root / 'style-detail-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
        print(json.dumps(result, ensure_ascii=False), flush=True)
        return result

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(one, cases))
    print('COMPLETED', sum(r['ok'] for r in results), '/', len(results), flush=True)


if __name__ == '__main__': main()
