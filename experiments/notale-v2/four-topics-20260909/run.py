"""Four full auto runs through the unchanged harness; no repair or model fallback."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import hashlib
from html import escape
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[3] / 'notale-v2'
RUNS_ROOT = ROOT.parent / 'runs' / ROOT.name
sys.path.insert(0, str(ROOT))
from core import builder, llm
from scripts.style_e2e import hashes, model_args, now, save

TOPICS = [
    ('neural', '神经网络', '会基础 Python、向量和导数的大学低年级学生，无机器学习基础',
     '从单个神经元到多层感知机，理解前向传播、损失函数、梯度下降与反向传播，用二维分类案例讲清训练与过拟合；不涉及 CNN、Transformer。'),
    ('photosynthesis', '光合作用', '了解细胞结构与基础化学的高一学生',
     '从植物的物质来源到光反应、碳固定，讲清物质与能量流动，以及光照、CO₂、温度对光合速率的影响。'),
    ('weber', '新教伦理与资本主义精神', '无社会学、宗教史基础的大学通识课学生',
     '从“资本主义精神”的含义到天职观、禁欲主义与资本积累，解释韦伯的论证及其局限，区分关联与单一因果。'),
    ('economics', '经济学原理', '会基本代数、无经济学基础的大学新生',
     '从机会成本、边际决策到供需、均衡与弹性，运用模型分析税收和价格管制，说明假设与适用边界；不涉及宏观经济。'),
]
EXPECTED = {name: ('deepseek-v4-flash-low' if name == 'build-code' else 'gemini38-google-low')
            for name in ('build-cover', 'build-page', 'build-interaction', 'build-code')}


def profiles():
    cfg = llm.config()
    default = llm.resolve_builder_profile(cfg, 'gemini38-google-low')
    actual = builder.workflow_runtimes(cfg, default)
    assert {k: v.profile.id for k, v in actual.items()} == EXPECTED
    assert all(v.profile.reasoning_effort == 'low' for v in actual.values())
    return {k: {f: getattr(v.profile, f) for f in
                ('id', 'model', 'adapter', 'base_url', 'reasoning_effort', 'vision_input')}
            for k, v in actual.items()}


def audit(label):
    spec = importlib.util.spec_from_file_location('deck_audit',
        ROOT / 'experiments/neural-networks-style-20260909/audit.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.LABEL = label
    module.RUN = RUNS_ROOT / label
    module.REPORT = RUNS_ROOT / (label + '-report')
    module.BASE = f'http://localhost:4177/runs/notale-v2/{label}/pages/'
    sys.argv = ['browser-audit']
    module.main()


def run_one(batch, topic, before, routes):
    slug, title, audience, scope = topic
    label = batch + '-' + slug
    run = RUNS_ROOT / label
    report = RUNS_ROOT / (label + '-report')
    report.mkdir()
    query = f'{title}：{scope}'
    planner_cmd = [sys.executable, '-B', '-u', '-m', 'core.planner', '--label', label,
                   '--query', query, '--minutes', '60', '--audience', audience,
                   '--style-director', *model_args('planner')]
    builder_cmd = [sys.executable, '-B', '-u', '-m', 'core.builder', '--label', label,
                   '--concurrency', '30', '--profile', 'gemini38-google-low',
                   '--samples', 'mini', '--aux-samples', '--notes', 'notes']
    save(report / 'experiment.json', dict(started=now(), query=query, audience=audience,
         minutes=60, route='auto', page_limit=None, concurrency=30, samples='mini', aux=True,
         notes='notes', planner_profile=routes['build-page'], director_profile=routes['build-page'],
         workflow_profiles=routes, commands=[planner_cmd, builder_cmd], code_before=before,
         known_input_issue='crossword-representation mini catalog chars 94220 vs source 95732'))
    state = dict(label=label, title=title, phase='planner+director', started=now(), pages=[])
    start = time.monotonic()
    def publish():
        save(report / 'result.json', state)
    publish()
    try:
        with (report / 'planner.log').open('x') as log:
            result = subprocess.run(planner_cmd, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
        state.update(planner_exit=result.returncode, planner_seconds=round(time.monotonic()-start, 1))
        if result.returncode:
            raise RuntimeError('Planner/Director failed; no retry')
        briefs = json.loads((run / 'briefs.json').read_text())
        state['pages'] = [builder.page_from_brief(row).pid for row in briefs]
        state['theme_sha256'] = hashlib.sha256((run / 'pages/assets/theme.css').read_bytes()).hexdigest()
        profiles()  # Fail before Builder if shared configuration changed routing.
        state['phase'] = 'builder'
        publish()
        print(label, 'planned', len(briefs), 'pages', flush=True)
        started = time.monotonic()
        with (report / 'builder.log').open('x') as log:
            result = subprocess.run(builder_cmd, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
        built = json.loads((run / 'builder-results.json').read_text())
        manifest = json.loads((run / 'builder-manifest.json').read_text())
        assert manifest['workflowProfiles'] == EXPECTED, manifest['workflowProfiles']
        assert all(row['profile'] == EXPECTED[row['workflow']] for row in built.values())
        state.update(phase='generated', builder_exit=result.returncode,
            builder_seconds=round(time.monotonic()-started, 1),
            seconds=round(time.monotonic()-start, 1),
            delivered=sum(bool(row.get('artifact_present')) for row in built.values()),
            builder_pages=built,
            theme_unchanged=state['theme_sha256'] == hashlib.sha256((run / 'pages/assets/theme.css').read_bytes()).hexdigest())
        publish()
        with (report / 'audit.log').open('x') as log:
            result = subprocess.run([sys.executable, '-B', '-u', __file__, '--audit', label],
                                    cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
        state.update(phase='finished', audit_exit=result.returncode,
                     semantic_review='pending', visual_review='pending')
    except Exception as exc:
        state.update(phase='failed', error=f'{type(exc).__name__}: {exc}')
    after = hashes()
    state.update(finished=now(), elapsed_with_audit=round(time.monotonic()-start, 1),
                 changed_code=[k for k, v in before.items() if after.get(k) != v])
    publish()
    print(label, state['phase'], state.get('delivered'), state.get('error', ''), flush=True)
    return state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--audit')
    parser.add_argument('--preflight', action='store_true')
    parser.add_argument('--topic', choices=[t[0] for t in TOPICS], help='Run only this full topic')
    args = parser.parse_args()
    if args.audit:
        return audit(args.audit)
    routes = profiles()
    if args.preflight:
        # Read-only construction checks; no model calls.
        from core.builder import parse_args
        parsed = parse_args(['--label', 'preflight', '--profile', 'gemini38-google-low',
                             '--samples', 'mini', '--aux-samples', '--notes', 'notes'])
        assert not parsed.uniform
        old = json.loads((RUNS_ROOT / 'nn-gemini38-low-0909-0750/briefs.json').read_text())
        assert all(builder.page_from_brief(row).pid.startswith('page-') for row in old)
        print(json.dumps(routes, ensure_ascii=False, indent=2))
        return
    topics = [t for t in TOPICS if not args.topic or t[0] == args.topic]
    batch = ('neural-check-trim-' if args.topic == 'neural' else 'four-topics-') + datetime.now().strftime('%m%d-%H%M%S')
    folder = RUNS_ROOT / (batch + '-report')
    folder.mkdir()
    before = hashes()
    save(folder / 'experiment.json', dict(batch=batch, started=now(), topics=topics,
         duration=60, parallel_queries=len(topics), concurrency_per_query=30, profiles=routes,
         runner_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), code_before=before))
    links = ''.join(f'<li>{escape(title)}：<a href="../{batch}-{slug}/pages/index.html">课件</a> · '
                   f'<a href="../{batch}-{slug}-report/result.json">状态</a> · '
                   f'<a href="../{batch}-{slug}-report/">日志与验收</a></li>'
                   for slug, title, _, _ in topics)
    (folder / 'index.html').write_text('<!doctype html><meta charset="utf-8"><title>四领域完整测试</title>'
        '<h1>四领域完整 auto 测试</h1><p>四组各 60 分钟；代码页 DeepSeek V4 Flash low，其余 Gemini 3.8 Flash low。'
        '生成完成不代表内容与交互验收通过。</p><ul>' + links + '</ul>')
    print('BATCH', batch, flush=True)
    with ThreadPoolExecutor(max_workers=len(topics)) as pool:
        results = list(pool.map(lambda topic: run_one(batch, topic, before, routes), topics))
    save(folder / 'summary.json', results)
    print('FINISHED', batch, flush=True)


if __name__ == '__main__':
    main()
