"""One fresh full auto run, original query and Gemini 3.8 Flash low for every role.

Explicit experimental model override; no page cap, retries, or artifact edits.
The historical nn-style-coherence-0909 run used different models; never overwrite it.
"""
import argparse
from pathlib import Path
import hashlib
import json
import subprocess
import sys
import time
from html import escape

ROOT = Path(__file__).resolve().parents[3] / 'notale-v2'
RUNS_ROOT = ROOT.parent / 'runs' / ROOT.name
sys.path.insert(0, str(ROOT))
from core import llm, planner
from scripts.style_e2e import MODEL_PROFILE, hashes, model_args, now, save

LABEL = 'nn-style-coherence-0909'
RUN = RUNS_ROOT /LABEL
REPORT = RUNS_ROOT /f'{LABEL}-report'
QUERY = ROOT/'experiments/neural-networks-20260908/query.md'


def render(state):
    cards = []
    for pid in state.get('pages', []):
        shot = REPORT/'verification'/f'{pid}.png'
        image = f'<img src="verification/{pid}.png" width="400">' if shot.exists() else ''
        cards.append(f'<article><a href="../{LABEL}/pages/{pid}.html">{pid}{image}</a></article>')
    (REPORT/'index.html').write_text('<!doctype html><html lang="zh"><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width"><title>神经网络完整 auto 实验</title>'
        '<style>body{font:16px/1.6 system-ui;margin:32px}section{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}img{width:100%;display:block}pre{white-space:pre-wrap}</style>'
        '<h1>神经网络 · 完整 auto 实验</h1><p>原始 120 分钟 query，页数由 Planner 决定。模型产物不手改。</p>'
        '<p><a href="experiment.json">冻结输入</a> · <a href="result.json">运行状态</a> · '
        '<a href="planner.log">Planner / Director 日志</a> · <a href="builder.log">Builder 日志</a></p>'
        f'<pre id="status">{escape(json.dumps(state,ensure_ascii=False,indent=2))}</pre><section>{"".join(cards)}</section>'
        '<script>setInterval(async()=>{try{const s=await(await fetch("result.json",{cache:"no-store"})).json();document.querySelector("#status").textContent=JSON.stringify(s,null,2)}catch{}},10000)</script></html>')


def main():
    global LABEL, RUN, REPORT
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--label', required=True, help='Fresh run label; never overwrite previous evidence')
    args=ap.parse_args()
    if Path(args.label).name != args.label or args.label in ('.', '..'):
        ap.error('Use one fresh run label')
    LABEL=args.label
    RUN=RUNS_ROOT /LABEL
    REPORT=RUNS_ROOT /f'{LABEL}-report'
    if RUN.exists() or REPORT.exists():
        raise SystemExit('Fresh label required; refusing to overwrite evidence')
    REPORT.mkdir()
    profile=llm.resolve_builder_profile(llm.config(), MODEL_PROFILE)
    before=hashes()
    before[str(Path(__file__).relative_to(ROOT))]=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    query=QUERY.read_text()
    save(REPORT/'experiment.json', {'started':now(),'query_path':str(QUERY.relative_to(ROOT)),
        'query':query,'query_sha256':hashlib.sha256(QUERY.read_bytes()).hexdigest(),
        'minutes':120,'concurrency':30,'route':'auto','page_limit':None,
        'planner_model':profile.model,'planner_effort':profile.reasoning_effort,
        'director_model':profile.model,'builder_profile':profile.id,
        'workflow_profiles':{name:profile.id for name in ('build-cover','build-page','build-interaction','build-code')},
        'adapter':profile.adapter,'base_url':profile.base_url,
        'samples':'mini','aux':True,'notes':'notes','no_model_override':False,'code_before':before})
    state={'label':LABEL,'phase':'planner+director','started':now(),'pages':[],
           'visual_review':'pending','content_review':'pending'}
    def publish():
        save(REPORT/'result.json',state)
        render(state)
    publish()
    start=time.monotonic()
    try:
        command=[sys.executable,'-B','-u','-m','core.planner','--label',LABEL,'--query',query,
            '--minutes','120','--audience','会基础 Python、向量矩阵乘法、导数直觉及训练/测试集概念，但没有系统学过深度学习的本科生',
            '--scenario','本科机器学习课程中的神经网络专题；120 分钟，教师投影讲授，穿插预测问题、交互演示与少量代码实操',
            *model_args('planner')]
        with (REPORT/'planner.log').open('x') as log:
            result=subprocess.run(command,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
        state.update(planner_exit=result.returncode,planner_seconds=round(time.monotonic()-start,1))
        if result.returncode:
            raise RuntimeError('Planner/Director failed')
        pages=planner.split_pages((RUN/'pages/plan/pages.md').read_text())
        state['pages']=[f'page-{pid}' for pid in sorted(pages)]
        state.update(phase='builder',theme_sha256=hashlib.sha256((RUN/'pages/assets/theme.css').read_bytes()).hexdigest())
        publish()
        print(f"Planner/Director complete: {len(pages)} pages; starting Builder",flush=True)
        tb=time.monotonic()
        with (REPORT/'builder.log').open('x') as log:
            result=subprocess.run([sys.executable,'-B','-u','-m','core.builder','--label',LABEL,'--concurrency','30',
                *model_args('builder')],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
        built=json.loads((RUN/'builder-results.json').read_text())
        state.update(phase='generated',builder_exit=result.returncode,builder_seconds=round(time.monotonic()-tb,1),
            delivered=sum(bool(v.get('artifact_present')) for v in built.values()),
            builder_pages={k:{f:v.get(f) for f in ('calls','seconds','termination','artifact_present','audit')} for k,v in built.items()},
            theme_unchanged=state['theme_sha256']==hashlib.sha256((RUN/'pages/assets/theme.css').read_bytes()).hexdigest())
    except Exception as exc:
        state.update(phase='failed',error=f'{type(exc).__name__}: {exc}')
    after=hashes()
    after[str(Path(__file__).relative_to(ROOT))]=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    state.update(finished=now(),seconds=round(time.monotonic()-start,1),
                 changed_code=[k for k,v in before.items() if after.get(k)!=v])
    publish()
    print(json.dumps({k:state.get(k) for k in ('phase','seconds','delivered','error','changed_code')},ensure_ascii=False),flush=True)
    return 0 if state['phase']=='generated' and state.get('builder_exit')==0 else 1


if __name__=='__main__':
    raise SystemExit(main())
