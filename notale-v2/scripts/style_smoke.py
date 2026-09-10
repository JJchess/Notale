"""Real application smoke: three Director routes, each with three frozen page briefs.

Uses configured production models (paid calls). No Planner content variability.
Run with a fresh --prefix. Builders are the normal application workflow, not a new role.
"""
import argparse
import json
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
RUNS_ROOT = ROOT.parent / 'runs' / ROOT.name
from core import planner, director
from test.test_style_upgrade import CSS

QUERY = '指数增长：用本金 100、年增长率 20% 解释 A(n)=100×(1+r)^n，n=0..5。'
PAGES = '''# page-01 [标题页]
指数增长：每一步都乘以 1.2。冻结事实：本金100，年增长率20%；0..5年金额依次为100、120、144、172.8、207.36、248.832。呈现标题、一个有解释作用的增长关系和引导问题。内容真实，主题装饰与数据分开，不需要额外素材。

# page-02 [内容页]
解释复利 A(n)=100×(1+r)^n。冻结事实：r=20%，0..5年金额100、120、144、172.8、207.36、248.832。用真实坐标图与关键计算解释每年新增额逐渐增加，而不是每年加20；不要创建假KPI或卡片墙。正文和图注清楚，不需要额外素材。

# page-03 [交互页]
交互探索复利：本金100，n=0..5，增长率r默认20%，允许0..50%。用一个可键盘操作的滑块实时更新曲线和第5年金额；公式100×(1+r)^n，不预录结果。给重置按钮，固定DOM ID rate、amount、reset 便于操作验收；amount只展示第5年金额数字（保留两位小数）。解释增长率与曲线变化，不需要额外素材。
'''


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--prefix',required=True)
    ap.add_argument('--themes-only',action='store_true')
    ap.add_argument('--retry-covers-from', help='保留原输出，在新 run 用已配置 Planner 模型补两个缺失封面')
    args=ap.parse_args()
    if args.retry_covers_from:
        def retry(style):
            source=RUNS_ROOT/f'{args.retry_covers_from}-{style}'
            label=f'{args.prefix}-{style}'
            target=RUNS_ROOT/label
            target.mkdir()
            shutil.copytree(source/'pages/assets',target/'pages/assets')
            shutil.copytree(source/'pages/plan',target/'pages/plan')
            (target/'briefs.json').write_text((source/'briefs.json').read_text().replace(str(source),str(target)))
            code="""from core import builder, llm
import sys
c=llm.config();m=c['model'];c['builder']['profiles']['smoke-sol']={
'model':m['name'],'base_url':m['base_url'],'api_key_env':m['api_key_env'],
'adapter':m['wire_api'],'reasoning_effort':'medium','vision_input':True}
sys.argv=['builder','--label',sys.argv[1],'--profile','smoke-sol','--only','page-01','--concurrency','1']
builder.main()
"""
            subprocess.run([sys.executable,'-B','-c',code,label],cwd=ROOT,check=True)
        with ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(retry,('auto','glass')))
        return
    package=RUNS_ROOT/f'{args.prefix}-input'
    package.mkdir(parents=True,exist_ok=True)
    (package/'assets').mkdir(exist_ok=True)
    photo=ROOT/'workflows/build-page/samples/general/walk-photo-journal/pages/assets/images/holden-pond.jpg'
    shutil.copy2(photo,package/'assets/photo.jpg')
    (package/'shots').mkdir(exist_ok=True)
    shutil.copy2(photo,package/'shots/photo.jpg')
    (package/'theme.css').write_text(CSS+'\n:root{--photo-source:url(assets/photo.jpg)}',encoding='utf-8')
    cases=[('auto',None,'02-swiss'),
           ('glass',ROOT/'references/styles/shots/04-glassmorphism.png','04-glassmorphism'),
           ('photo',package,'改成自然摄影编辑风，使用提供的 assets/photo.jpg 作 opening 变体装饰背景；默认无图正文。保留照片真实颜色，用多层 background-image 控制文字区域对比。不要搜索其他素材。')]
    def one(case):
        name,template,style=case
        label=f'{args.prefix}-{name}'
        root=RUNS_ROOT/label
        if not (root/'pages/assets/theme.css').is_file():
            run=planner.Run(QUERY,10,'理解乘法的初学者',label,'投影课堂',template=template,style=style)
            planner.seed(run,ROOT/'vendor/chassis',ROOT/'vendor/chassis/lib')
            result=director.direct(run,'medium')
            (root/'style-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
        else:
            # Resume only the smoke harness; normal Run continues to reject existing labels.
            from types import SimpleNamespace
            run=SimpleNamespace(root=root,query=QUERY,prompt=lambda name,**kw: planner.fill(
                (planner.PROMPTS/f'{name}.md').read_text(),**kw))
        (root/'pages/plan').mkdir(exist_ok=True)
        (root/'pages/plan/pages.md').write_text(PAGES)
        pages=planner.split_pages(PAGES)
        for pid,content in pages.items():
            (root/f'pages/plan/p{pid[-2:]}.md').write_text(content)
        briefs=planner.briefs(run,sorted(pages))
        (root/'briefs.json').write_text(json.dumps([asdict(b) for b in briefs],ensure_ascii=False,indent=2))
        if not args.themes_only and not (root/'builder-manifest.json').exists():
            subprocess.run([sys.executable,'-B','-m','core.builder','--label',label,'--concurrency','3'],cwd=ROOT,check=True)
        return label
    with ThreadPoolExecutor(max_workers=3) as pool:
        for label in pool.map(one,cases): print('SMOKE',label,flush=True)


if __name__=='__main__': main()
