#!/usr/bin/env python3
"""Materialize three frozen planner-shaped evaluation decks."""

from __future__ import annotations

import json
import re
from pathlib import Path


HERE = Path(__file__).resolve().parent
FIXTURES = HERE / "fixtures"


DECKS = {
    "epidemic-dynamics": {
        "input": {
            "query": "传染病动力学：从个体接触到群体免疫",
            "minutes": 60,
            "audience": "学过高中数学与生物、但没有系统学习流行病模型的大学通识课学生",
            "scenario": "教室投影讲授，课后可在个人浏览器中独立复习",
            "label": "skill-eval-epidemic-dynamics",
            "canvas": "1600x900",
        },
        "pages": [
            ("标题页", "传染病在接触网络中的传播。"),
            ("内容页", "传染病动力学的研究历史。"),
            ("内容页", "从个体接触到群体传播。"),
            ("交互页", "交互理解接触网络中的传播。"),
            ("标题页", "第二章：用模型描述一次流行。"),
            ("内容页", "SIR 模型讲解。"),
            ("内容页", "基本再生数。"),
            ("内容页", "比较不同传染病的基本再生数与群体免疫阈值。"),
            ("标题页", "第三章：传播为何会加速、转折和消退。"),
            ("内容页", "流行曲线讲解。"),
            ("内容页", "易感、感染与康复人群的变化。"),
            ("交互页", "模拟一次传染病流行。"),
            ("标题页", "第四章：群体免疫与公共卫生决策。"),
            ("交互页", "交互理解群体免疫。"),
            ("内容页", "疫苗有效率与接种覆盖率。"),
            ("内容页", "传染病模型的边界。"),
        ],
        "theme": "epidemic",
    },
    "orbital-mechanics": {
        "input": {
            "query": "轨道力学：从开普勒轨道到霍曼转移",
            "minutes": 60,
            "audience": "学过高中物理与向量、但没有系统学习轨道力学的大学通识课学生",
            "scenario": "教室投影讲授，课后可在个人浏览器中独立复习",
            "label": "skill-eval-orbital-mechanics",
            "canvas": "1600x900",
        },
        "pages": [
            ("标题页", "从近地轨道到月球轨道。"),
            ("内容页", "轨道力学的研究历史。"),
            ("内容页", "牛顿的大炮思想实验。"),
            ("交互页", "交互理解速度与轨道。"),
            ("标题页", "第二章：开普勒轨道。"),
            ("内容页", "开普勒三定律。"),
            ("内容页", "轨道六根数。"),
            ("内容页", "讲解月球轨道的空间结构。"),
            ("标题页", "第三章：改变一条轨道。"),
            ("内容页", "轨道机动与速度增量。"),
            ("内容页", "霍曼转移讲解。"),
            ("交互页", "模拟一次变轨。"),
            ("标题页", "第四章：把航天器送往另一条轨道。"),
            ("交互页", "交互理解轨道转移。"),
            ("内容页", "比较不同轨道转移方案。"),
            ("内容页", "轨道模型的适用边界。"),
        ],
        "theme": "orbital",
    },
    "adaboost": {
        "input": {
            "query": "AdaBoosting算法",
            "minutes": 60,
            "audience": "学过概率、线性代数与 Python，但没有系统学习集成学习的本科生",
            "scenario": "计算机教室投影讲授，并在个人浏览器中完成代码练习",
            "label": "skill-eval-adaboost",
            "canvas": "1600x900",
        },
        "pages": [
            ("标题页", "AdaBoosting算法。"),
            ("内容页", "AdaBoosting算法的历史。"),
            ("内容页", "集成学习。"),
            ("交互页", "交互理解弱分类器。"),
            ("标题页", "第二章：从弱学习到强学习。"),
            ("内容页", "弱分类器。"),
            ("内容页", "样本权重。"),
            ("内容页", "AdaBoosting算法讲解。"),
            ("标题页", "第三章：一轮又一轮地修正错误。"),
            ("内容页", "分类器权重。"),
            ("内容页", "AdaBoosting 的训练过程。"),
            ("交互页", "模拟训练 AdaBoosting 模型。"),
            ("标题页", "第四章：把算法写成可以运行的程序。"),
            ("交互页", "代码实操AdaBoosting算法。"),
            ("内容页", "AdaBoosting 的优点与局限。"),
            ("内容页", "AdaBoosting 与其他集成方法。"),
        ],
        "theme": "boost",
    },
}


THEMES = {
    "epidemic": r'''/* ==== INTERFACE ====
token    --bg #F1E8D6        公共卫生记录纸底色｜只用于舞台与留白
token    --text #18231F      主文字与主要轮廓
token    --muted #66706A     次级说明与非重点刻度
token    --susceptible #2F6578 易感人群与尚未传播的接触
token    --threshold #C38B3A 阈值、基准与需要比较的边界
token    --infected #B54A32  感染、传播中的状态与风险
token    --recovered #3F705D 康复、免疫与被阻断的传播
token    --line #CFC2AA      中性分隔与辅助网格
token    --focus #B54A32     键盘焦点
token    --font-sans ui-sans-serif,system-ui,"Noto Sans SC",sans-serif  全部成句文字
token    --font-display Georgia,"Noto Serif SC",serif                 标题与关键结论
token    --fs-h1 52px        页标题
token    --fs-h2 25px        区块标题
token    --fs-lead 21px      导语与关键结论
token    --fs-body 18px      正文
token    --fs-sec 16px       次级成句说明
token    --fs-label 14px     控件、图例与图注
token    --fs-tick 12px      纯数字刻度
版心     1488×844            #stage 已含 28px 56px padding
版式     .focus              标题后由一个主证据区占满剩余空间
版式     .split              左右 42/58 分区并保持共同垂直基线
版式     .stage-evidence     上部主场景、下部紧邻证据带
组件     .panel              读数与控件的浅色实体容器
组件     .panel.q            只保留边距、不填充的安静容器
组件     .btn/.btns          紧凑操作按钮与按钮组
组件     .ctl                成组标签和输入
组件     .legend/.li/.sw     图例行、条目与色标
组件     .big/.num/.unit     关键读数、数字与单位
组件     .lead/.small/.note  导语、次级说明与图注
组件     .cvbox              裁切 SVG、Canvas 或媒体的定位容器
==== /INTERFACE ==== */
:root{--pad-x:56px;--pad-y:28px;--bg:#F1E8D6;--text:#18231F;--muted:#66706A;--susceptible:#2F6578;--threshold:#C38B3A;--infected:#B54A32;--recovered:#3F705D;--line:#CFC2AA;--focus:#B54A32;--font-sans:ui-sans-serif,system-ui,"Noto Sans SC",sans-serif;--font-display:Georgia,"Noto Serif SC",serif;--fs-h1:52px;--fs-h2:25px;--fs-lead:21px;--fs-body:18px;--fs-sec:16px;--fs-label:14px;--fs-tick:12px}
body{background:var(--bg);color:var(--text);font-family:var(--font-sans)}
#stage{display:flex;flex-direction:column;padding:var(--pad-y) var(--pad-x);background-color:var(--bg);background-image:linear-gradient(rgba(24,35,31,.045) 1px,transparent 1px);background-size:100% 9px}
h1,h2{font-family:var(--font-display);margin:0;letter-spacing:-.025em}h1{font-size:var(--fs-h1);line-height:1.02}h2{font-size:var(--fs-h2);line-height:1.15}
.focus{display:flex;flex:1;min-height:0;flex-direction:column}.split{display:grid;grid-template-columns:42fr 58fr;gap:44px;flex:1;min-height:0}.stage-evidence{display:grid;grid-template-rows:minmax(0,1fr) auto;gap:16px;flex:1;min-height:0}
.panel{padding:18px 20px;background:#F8F2E7;border:1px solid var(--line);border-radius:6px}.panel.q{background:transparent}.btn{min-height:42px;padding:8px 16px;border:1px solid var(--text);border-radius:3px;background:transparent;color:var(--text);font:600 var(--fs-label)/1 var(--font-sans)}.btn:hover{background:#E7D9C0}.btns{display:flex;gap:8px;flex-wrap:wrap}.ctl{display:grid;gap:7px;font-size:var(--fs-label)}input[type=range]{accent-color:var(--threshold)}
.legend{display:flex;gap:18px;flex-wrap:wrap}.li{display:flex;align-items:center;gap:7px;font-size:var(--fs-label)}.sw{width:12px;height:12px;background:var(--muted)}.sw.line{height:3px}.big{font:700 42px/1 var(--font-display)}.big.sm{font-size:32px}.big.lg{font-size:58px}.num{font-variant-numeric:tabular-nums}.unit{font-size:var(--fs-label);color:var(--muted)}.lead{font-size:var(--fs-lead);line-height:1.4}.small{font-size:var(--fs-sec);line-height:1.4}.note{font-size:var(--fs-label);line-height:1.35;color:var(--muted)}.cvbox{position:relative;min-height:0;overflow:hidden;border-radius:6px}
:focus-visible{outline:3px solid var(--focus);outline-offset:3px}svg .bar,svg .cell,svg .box{width:auto;height:auto}
''',
    "orbital": r'''/* ==== INTERFACE ====
token    --bg #0B1420        轨道测绘台底色
token    --text #F1EEE6      主文字与决定性轮廓
token    --muted #9AA7B5     次级说明与非重点刻度
token    --orbit #58C7C5     当前轨道、轨迹与空间路径
token    --transfer #F0B64D  转移轨道、机动点和当前选择
token    --body #E16B62      中心天体、航天器与需区分的实体
token    --velocity #6F86D9  速度向量、方向与空间轴
token    --line #314052      中性网格与分隔
token    --focus #F0B64D     键盘焦点
token    --font-sans ui-sans-serif,system-ui,"Noto Sans SC",sans-serif  成句文字
token    --font-display "Arial Narrow",ui-sans-serif,system-ui,sans-serif 标题与大读数
token    --fs-h1 50px        页标题
token    --fs-h2 24px        区块标题
token    --fs-lead 21px      导语与关键结论
token    --fs-body 18px      正文
token    --fs-sec 16px       次级成句说明
token    --fs-label 14px     控件、图例与图注
token    --fs-tick 12px      纯数字刻度
版心     1488×844            #stage 已含 28px 56px padding
版式     .focus              标题后由一个主证据区占满剩余空间
版式     .split              左右 40/60 分区并共享垂直中心
版式     .stage-evidence     大型空间场景紧邻一条证据带
组件     .panel/.panel.q     实体仪器容器与无填充安静容器
组件     .btn/.btns/.ctl     操作按钮、按钮组和控件组
组件     .legend/.li/.sw     图例行、条目与色标
组件     .big/.num/.unit     关键读数、数字与单位
组件     .lead/.small/.note  导语、次级说明与图注
组件     .cvbox              裁切 SVG、Canvas 或 3D 轨道场景的定位容器
==== /INTERFACE ==== */
:root{--pad-x:56px;--pad-y:28px;--bg:#0B1420;--text:#F1EEE6;--muted:#9AA7B5;--orbit:#58C7C5;--transfer:#F0B64D;--body:#E16B62;--velocity:#6F86D9;--line:#314052;--focus:#F0B64D;--font-sans:ui-sans-serif,system-ui,"Noto Sans SC",sans-serif;--font-display:"Arial Narrow",ui-sans-serif,system-ui,sans-serif;--fs-h1:50px;--fs-h2:24px;--fs-lead:21px;--fs-body:18px;--fs-sec:16px;--fs-label:14px;--fs-tick:12px}
body{background:var(--bg);color:var(--text);font-family:var(--font-sans)}
#stage{display:flex;flex-direction:column;padding:var(--pad-y) var(--pad-x);background-color:var(--bg);background-image:linear-gradient(rgba(88,199,197,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(88,199,197,.055) 1px,transparent 1px);background-size:40px 40px}
h1,h2{font-family:var(--font-display);margin:0;letter-spacing:-.02em}h1{font-size:var(--fs-h1);line-height:1}h2{font-size:var(--fs-h2);line-height:1.15;text-transform:none}
.focus{display:flex;flex:1;min-height:0;flex-direction:column}.split{display:grid;grid-template-columns:40fr 60fr;gap:38px;align-items:center;flex:1;min-height:0}.stage-evidence{display:grid;grid-template-rows:minmax(0,1fr) auto;gap:14px;flex:1;min-height:0}
.panel{padding:17px 19px;background:#111F2E;border:1px solid var(--line);border-radius:2px}.panel.q{background:transparent}.btn{min-height:42px;padding:8px 15px;border:1px solid var(--orbit);border-radius:2px;background:#101D2A;color:var(--text);font:600 var(--fs-label)/1 var(--font-sans)}.btn:hover{background:#193044}.btns{display:flex;gap:8px;flex-wrap:wrap}.ctl{display:grid;gap:7px;font-size:var(--fs-label)}input[type=range]{accent-color:var(--transfer)}
.legend{display:flex;gap:18px;flex-wrap:wrap}.li{display:flex;align-items:center;gap:7px;font-size:var(--fs-label)}.sw{width:12px;height:12px;background:var(--muted)}.sw.line{height:3px}.big{font:700 43px/1 var(--font-display)}.big.sm{font-size:32px}.big.lg{font-size:60px}.num{font-variant-numeric:tabular-nums}.unit{font-size:var(--fs-label);color:var(--muted)}.lead{font-size:var(--fs-lead);line-height:1.4}.small{font-size:var(--fs-sec);line-height:1.4}.note{font-size:var(--fs-label);line-height:1.35;color:var(--muted)}.cvbox{position:relative;min-height:0;overflow:hidden;border:1px solid var(--line);border-radius:2px}
:focus-visible{outline:3px solid var(--focus);outline-offset:3px}svg .bar,svg .cell,svg .box{width:auto;height:auto}
''',
    "boost": r'''/* ==== INTERFACE ====
方向     精密的机器学习实验台，靠层级、对齐和算法证据建立视觉；不使用纸张隐喻、装饰纹理、渐变、发光或卡片堆叠
色彩     建模过程统一使用蓝色调；--error 只用于真实的错分样本与误差，不做装饰点缀
token    --bg #EEF1F5        冷中性舞台底色
token    --surface #FAFBFC   唯一实体证据面
token    --text #111820      主文字、节点与主连接
token    --muted #657181     次级说明和非活动关系
token    --weak #617CA8      弱分类器、单轮预测与输入
token    --correct #294E86   正确分类与已经解释的样本
token    --weight #164E9B    样本权重、分类器权重与当前轮次
token    --error #C64232     错分样本、误差与失败证据
token    --line #C8D0DB      中性分隔、坐标轴与基线
token    --focus #164E9B     键盘焦点
token    --font-sans "Noto Sans CJK SC",ui-sans-serif,system-ui,sans-serif 成句文字
token    --font-mono "JetBrains Mono",ui-monospace,Consolas,monospace  代码、节点名与数字
token    --font-display "Clear Sans","Noto Sans CJK SC",ui-sans-serif,sans-serif 标题与关键结论
token    --fs-h1 54px        页标题
token    --fs-h2 25px        区块标题
token    --fs-lead 22px      导语与关键结论
token    --fs-body 18px      正文
token    --fs-sec 16px       次级成句说明
token    --fs-label 14px     控件、图例与图注
token    --fs-tick 12px      纯数字刻度
版心     1488×844            #stage 已含 28px 56px padding
版式     .focus              标题后由一个主证据区占满剩余空间
版式     .split              左右 40/60 分区，用于讲解与算法证据的主从并置
版式     .stage-evidence     主算法场景与下方证据带相连
组件     .panel/.panel.q     单层实体证据面与无填充安静容器；不在 panel 内再堆 panel
组件     .btn/.btns/.ctl     直角操作按钮、按钮组和控件组
组件     .legend/.li/.sw     图例行、条目与色标
组件     .big/.num/.unit     关键读数、等宽数字与单位
组件     .lead/.small/.note  导语、次级说明与图注
组件     .cvbox              裁切 SVG、Canvas、图表或代码视图的定位容器
==== /INTERFACE ==== */
:root{--pad-x:56px;--pad-y:28px;--bg:#EEF1F5;--surface:#FAFBFC;--text:#111820;--muted:#657181;--weak:#617CA8;--correct:#294E86;--weight:#164E9B;--error:#C64232;--line:#C8D0DB;--focus:#164E9B;--font-sans:"Noto Sans CJK SC",ui-sans-serif,system-ui,sans-serif;--font-mono:"JetBrains Mono",ui-monospace,Consolas,monospace;--font-display:"Clear Sans","Noto Sans CJK SC",ui-sans-serif,sans-serif;--fs-h1:54px;--fs-h2:25px;--fs-lead:22px;--fs-body:18px;--fs-sec:16px;--fs-label:14px;--fs-tick:12px}
body{background:var(--bg);color:var(--text);font-family:var(--font-sans)}
#stage{display:flex;flex-direction:column;padding:var(--pad-y) var(--pad-x);background:var(--bg)}
h1,h2{font-family:var(--font-display);margin:0;letter-spacing:-.035em}h1{font-size:var(--fs-h1);font-weight:700;line-height:.98}h2{font-size:var(--fs-h2);font-weight:650;line-height:1.12}code,pre,.num{font-family:var(--font-mono)}
.focus{display:flex;flex:1;min-height:0;flex-direction:column}.split{display:grid;grid-template-columns:40fr 60fr;gap:48px;flex:1;min-height:0}.stage-evidence{display:grid;grid-template-rows:minmax(0,1fr) auto;gap:14px;flex:1;min-height:0}
.panel{padding:18px 20px;background:var(--surface);border:1px solid var(--line);border-radius:3px}.panel.q{padding-left:0;padding-right:0;background:transparent;border-color:transparent}.btn{min-height:42px;padding:8px 16px;border:1px solid #AEB9C7;border-radius:3px;background:var(--surface);color:var(--text);font:650 var(--fs-label)/1 var(--font-sans)}.btn:hover{border-color:var(--weight);background:#E2E9F4}.btn.primary,.btn[aria-pressed=true]{border-color:var(--weight);background:var(--weight);color:#fff}.btns{display:flex;gap:8px;flex-wrap:wrap}.ctl{display:grid;gap:7px;font-size:var(--fs-label)}input[type=range]{accent-color:var(--weight)}
.legend{display:flex;gap:18px;flex-wrap:wrap}.li{display:flex;align-items:center;gap:7px;font-size:var(--fs-label)}.sw{width:12px;height:12px;background:var(--muted)}.sw.line{height:3px}.big{font:700 42px/1 var(--font-mono)}.big.sm{font-size:32px}.big.lg{font-size:60px}.unit{font-size:var(--fs-label);color:var(--muted)}.lead{font-size:var(--fs-lead);line-height:1.4}.small{font-size:var(--fs-sec);line-height:1.4}.note{font-size:var(--fs-label);line-height:1.35;color:var(--muted)}.cvbox{position:relative;min-height:0;overflow:hidden;border:1px solid var(--line);border-radius:3px}
:focus-visible{outline:3px solid var(--focus);outline-offset:3px}svg .bar,svg .cell,svg .box{width:auto;height:auto}
''',
}


def pages_markdown(rows: list[tuple[str, str]]) -> str:
    blocks = ["本套无需图池"]
    for number, (label, sentence) in enumerate(rows, 1):
        blocks.append(f"# page-{number:02d} [{label}]\n{sentence}")
    return "\n\n".join(blocks) + "\n"


def write_fixture(deck_id: str, spec: dict) -> None:
    root = FIXTURES / deck_id
    plan = root / "pages" / "plan"
    assets = root / "pages" / "assets"
    plan.mkdir(parents=True, exist_ok=True)
    assets.mkdir(parents=True, exist_ok=True)
    (root / "planner-input.json").write_text(
        json.dumps(spec["input"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    pages = pages_markdown(spec["pages"])
    (plan / "pages.md").write_text(pages, encoding="utf-8")
    for number, (label, sentence) in enumerate(spec["pages"], 1):
        (plan / f"p{number:02d}.md").write_text(
            f"# page-{number:02d} [{label}]\n{sentence}\n", encoding="utf-8"
        )
    (assets / "theme.css").write_text(THEMES[spec["theme"]], encoding="utf-8")


def validate_fixture(deck_id: str) -> list[str]:
    root = FIXTURES / deck_id
    errors = []
    pages = (root / "pages" / "plan" / "pages.md").read_text(encoding="utf-8")
    blocks = list(re.finditer(r"(?m)^# page-(\d{2}) \[(标题页|内容页|交互页)\]\n([^\n]+)$", pages))
    if len(blocks) != 16:
        errors.append(f"expected 16 minimal page blocks, found {len(blocks)}")
    if [int(match.group(1)) for match in blocks] != list(range(1, 17)):
        errors.append("page ids are not continuous 01..16")
    for number in range(1, 17):
        page = root / "pages" / "plan" / f"p{number:02d}.md"
        if not page.is_file():
            errors.append(f"missing {page.name}")
    css = (root / "pages" / "assets" / "theme.css").read_text(encoding="utf-8")
    if not css.startswith("/* ==== INTERFACE ===="):
        errors.append("theme does not start with INTERFACE")
    if "==== /INTERFACE ==== */" not in css:
        errors.append("theme INTERFACE is not closed")
    bare = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    stage = " ".join(re.findall(r"#stage\s*\{([^}]*)\}", bare, re.S))
    for required in ("display:flex", "flex-direction:column", "padding:"):
        if required not in stage.replace(" ", ""):
            errors.append(f"theme #stage missing {required}")
    return errors


def main() -> int:
    for deck_id, spec in DECKS.items():
        write_fixture(deck_id, spec)
    failures = []
    for deck_id in DECKS:
        for error in validate_fixture(deck_id):
            failures.append(f"{deck_id}: {error}")
    if failures:
        print("\n".join(failures))
        return 1
    print(f"materialized {len(DECKS)} planner fixtures × 16 pages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
