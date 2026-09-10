"""Summarize completed evidence without changing any generated lesson artifact."""
from collections import Counter, defaultdict
from datetime import datetime
from html import escape
import hashlib
import json
from pathlib import Path
import re
from audit import ROOT, RUN, REPORT


def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def save(path,obj):path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')


def main():
    state=json.loads((REPORT/'result.json').read_text())
    if state['phase']!='generated':raise SystemExit('Generation has not completed')
    verification=REPORT/'verification'
    rows=[json.loads((verification/f'{pid}.json').read_text()) for pid in state['pages']]
    delivered=[r for r in rows if not r.get('missing')]
    supplement=json.loads((verification/'supplement.json').read_text())
    interactions=json.loads((verification/'interactions.json').read_text())
    assert all(r.get('code') or r['page'] in supplement for r in delivered)
    assert all(digest(RUN/'pages'/f'{r["page"]}.html')==r['sha256'] for r in delivered)
    assert all(digest(RUN/'pages'/f'{p}.html')==r['sha256'] for p,r in interactions.items())
    trace=[json.loads(l) for l in (RUN/'trace.jsonl').open()]
    by_id={r['uuid']:r for r in trace}
    timings=defaultdict(lambda:{'responses':0,'request_seconds':0,'tools':Counter()})
    for row in trace:
        if row['type']!='assistant':continue
        tag=row.get('toolUseResult') or {};key=tag.get('page') or tag.get('step') or 'unknown'
        t=timings[key];t['responses']+=1
        parent=by_id.get(row.get('parentUuid'))
        if parent:
            dt=lambda s:datetime.fromisoformat(s.replace('Z','+00:00'))
            t['request_seconds']+=(dt(row['timestamp'])-dt(parent['timestamp'])).total_seconds()
        t['tools'].update(c['name'] for c in tag.get('tools',[]))
    for key,t in timings.items():
        t['request_seconds']=round(t['request_seconds'],1)
        p=state['builder_pages'].get(key)
        if p:t['other_seconds_including_tools']=round(p['seconds']-t['request_seconds'],1)
    code_files={str(p.relative_to(RUN)):digest(p) for p in (RUN/'pages/assets/lessons/page-16/lesson').rglob('*') if p.is_file() and '__pycache__' not in str(p)}
    summary={
        'status':'verification_complete_with_failures','overall_passed':False,
        'planned':len(rows),'delivered':len(delivered),'missing':[r['page'] for r in rows if r.get('missing')],
        'offline_tests_passed':153,'generation_seconds':state['seconds'],
        'planner_seconds':state['planner_seconds'],'builder_seconds':state['builder_seconds'],
        'browser_pages_audited':len(delivered),'visual_pages_reviewed':len(delivered),
        'browser_error_pages':[r['page'] for r in delivered if r.get('runtime_errors') or r.get('audit_error')],
        'noncode_half_scale_passed':sum(r.get('scaling_ok') is True for r in delivered),
        'fallback_elements_by_page':{r['page']:len(r['system_fallback']) for r in delivered if r.get('system_fallback')},
        'font_note':'page-18 explicitly uses Times; other reported fallbacks are mathematical glyphs, not wholesale font failure.',
        'native_background_variants':dict(Counter(r['initial']['variant'] for r in delivered if not r['code'])),
        'step_states_smoked':sum(len(r['steps']) for r in supplement.values()),
        'interaction_cases':{p:{k:r.get(k) for k in ['ok','numeric_consistency','scope','semantic_issue','error']} for p,r in interactions.items()},
        'code_gradient_max_error':interactions['page-16']['max_gradient_error'],
        'theme_unchanged':state['theme_unchanged'],'production_changed_during_run':state['changed_code'],
        'all_audited_html_hashes_still_match':True,'code_lesson_sha256':code_files,
        'timings':dict(timings),
        'timing_note':'Request elapsed includes upstream/network/retries; queue, inference and first-token time cannot be separated. Other time includes tools and local harness overhead. No totals of concurrent page times are presented as wall time.',
        'limits':['Single full auto experiment, no reference/modify rerun or A/B.','Visual/content review recorded per page; not every factual claim independently source-verified.','Browser smoke and numerical consistency do not imply all interactions or teaching explanations passed.'],
    }
    notes={}
    report_md=(ROOT/'experiments/neural-networks-style-20260909/REPORT.md').read_text()
    for number,note in re.findall(r'^\| (\d\d) \| (.*?) \|$',report_md,re.M):notes['page-'+number]=note
    for r in rows:
        r['visual_review']='missing' if r.get('missing') else 'reviewed; see notes, not blanket pass'
        r['semantic_review']=notes.get(r['page'],'See detailed report')
        save(verification/f'{r["page"]}.json',r)
    save(verification/'browser.json',rows);save(verification/'summary.json',summary)
    state.update(phase='verified_with_failures',visual_review='complete_with_failures',content_review='complete_with_failures',overall_passed=False,verification='verification/summary.json')
    save(REPORT/'result.json',state)
    cards=[]
    for r in rows:
        pid=r['page'];info=state['builder_pages'].get(pid,{})
        note=escape(notes.get(pid,''))
        if r.get('missing'):
            cards.append(f'<article><h2>{pid} · 空交付</h2><div class="missing">未生成，不补页</div><p>{note}</p></article>');continue
        shot=f'{pid}-last-step.png' if (verification/f'{pid}-last-step.png').exists() else f'{pid}.png'
        more=''
        for suffix,label in [('controls','控件状态'),('operated','操作状态'),('small','800×450')]:
            if (verification/f'{pid}-{suffix}.png').exists():more+=f' · <a href="verification/{pid}-{suffix}.png">{label}</a>'
        cards.append(f'<article><h2><a href="../{RUN.name}/pages/{pid}.html">{pid}</a> · {info.get("calls","?")} 次响应 · {info.get("seconds",0)/60:.1f} 分</h2><a href="../{RUN.name}/pages/{pid}.html"><img loading="lazy" src="verification/{shot}" alt="{pid} 真实截图"></a><p>{note}</p><p><a href="verification/{pid}.json">浏览器证据</a>{more}</p></article>')
    (REPORT/'index.html').write_text('<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>神经网络 44 页完整验证</title>'
        '<style>body{font:16px/1.6 system-ui;margin:28px;background:#fafaf8;color:#222}h1{margin-bottom:8px}h2{font-size:17px}a{color:#245572}section{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}article{border-top:1px solid #ccc;padding-top:8px;min-width:0}img{width:100%;display:block}.missing{aspect-ratio:16/9;display:grid;place-items:center;background:#eee;color:#962a32}details{margin:16px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:850px){section{grid-template-columns:1fr}}</style>'
        f'<h1>神经网络 · 44 页完整 auto 验证</h1><p><strong>验证结束，有失败，未整套通过。</strong>规划 {len(rows)} 页，交付 {len(delivered)} 页；生成总耗时 {state["seconds"]/60:.1f} 分钟。153 项离线回归通过。</p>'
        '<p>原始 120 分钟 query，当前生产模型，并发 30。全部已交付页逐页截图/目视审阅；保留空页、布局、CSS 消费和内容错误。未手改页面、补跑或换模型。代码页保留独立外观。</p>'
        '<p><a href="../../experiments/neural-networks-style-20260909/REPORT.md">完整报告及逐页记录</a> · <a href="verification/summary.json">验证统计</a> · <a href="verification/interactions.json">数学与交互</a> · <a href="verification/supplement.json">分步/控件/CSS 证据</a> · <a href="experiment.json">冻结输入</a> · <a href="builder.log">生成日志</a></p>'
        '<p>重点：13/22 空交付；14/32 图例与曲线颜色不一致；18 Times 字体；19 全屏暗罩及方向键翻页；33/36 长标题布局；44 按钮遮挡及答案计数；内容错误详见逐页记录。背景变体未复现旧误平铺。</p>'
        f'<section>{"".join(cards)}</section></html>')
    print(json.dumps({k:v for k,v in summary.items() if k not in ['timings','code_lesson_sha256','interaction_cases']},ensure_ascii=False,indent=2))


if __name__=='__main__':main()
