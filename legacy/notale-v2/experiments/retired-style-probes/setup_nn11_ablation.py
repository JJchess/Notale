#!/usr/bin/env python3
"""搭一个消融:**用 Opus 5(nn-11)自己写的规划，让 GPT 来建页。**

问的是一个单变量问题:44 页的差距有多少在规划、有多少在建页?
今天量到的两个数把这个问题逼出来了 ——

    Opus 的规格 100% 带一行字面的 `Chrome.mount({...})` 和 13 行真实数据表,
    它的建页 agent 43 页总共只用了 **1 次 Edit**;
    我们的规格小节更多、字数更长(1,685 对 1,178),`Edit` 是 6.5 次/页 ——
    差 300 倍。而同一页的画面上,它 40 多个信息项,我们十几个。

所以这一轮把规划整个换成 Opus 的,只留「谁来建页」这一个变量。

**为什么要连底盘一起搬:** Opus 的规格是照着它自己的底盘写的 ——
`Chrome.mount({act,title,sub,foot})`、`deck.css` 的 `.flow/.cmp/.hier` 类、
它自己的计算层。只搬 `pNN.md` 而留我们的底盘,规格里每一行字面代码都会指向
不存在的东西,那量出来的是「断链的代价」,不是「规格质量的价值」。

搭好之后:
    python3 -m core.builder --label nn11-low --model AWS-GPT-5.6-Sol --effort low
    python3 -m core.builder --label nn11-med --model AWS-GPT-5.6-Sol --effort medium
"""

import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from core.artifacts import Brief          # noqa: E402
from core.llm import fill                 # noqa: E402

RUNS_ROOT = ROOT.parent / "runs" / ROOT.name
SRC = Path.home() / "exp/lecture/pages"
PROMPTS = ROOT / "prompts"


def page_table(plan_text: str) -> dict:
    """从 Opus 的 PLAN.md 第 4 节读出每页的分钟数、知识结构、一句话。

    它的表头是 `| # | 页 | 分钟 | 知识结构 | 表征形式 | 一句话 |`,
    行长这样:`| | [07](plan/p07.md) 先直立… | 2.5 | process | 交互·… | 顺序本身… |`
    —— 第一列是空的(用来放幕的分组行),页号在方括号里。
    我们自己的 `parse_table()` 认的是另一套表头,所以这里单独解析,
    不要去改那个 —— 它服务的是我们自己的页表格式。
    """
    out = {}
    for line in plan_text.splitlines():
        m = re.match(r"\s*\|\s*\|\s*\[(\d+)\]\([^)]*\)([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|",
                     line)
        if not m:
            continue
        nn = f"{int(m.group(1)):02d}"
        mins = re.search(r"([\d.]+)", m.group(3))
        out[nn] = {
            "title": m.group(2).strip(),
            "stay": float(mins.group(1)) * 60 if mins else 120.0,
            "structure": m.group(4).strip(),
            "form": m.group(5).strip(),
            "claim": m.group(6).strip(),
        }
    return out


BRIEF_NN11 = """你要构建这套 90 分钟互动讲义《Apeman – Spaceman》中的**第 {num} 页**,
文件是 `{page}`(已有空骨架,覆盖它)。

**先完整读这三份,它们是硬约束:**

1. `{contract}` —— 共享契约(每页必读)
2. `{deck}` —— 整套 {total} 页共享的部分:主线、页表、归属、口径
3. `{spec}` —— **你这一页的规格。照它施工。**

底盘的接口在 `{assets}/CHASSIS.md`,样式在 `{assets}/deck.css`。
这一页的停留时间是 {stay},知识结构是 **{structure}**。

规格里给了字面的 `Chrome.mount({{...}})` 调用、库的配置和数据表 —— **照抄,不要另拟**。
它是这一页唯一的真相来源:标题、副标题、脚注的文案,画面上要出现的每个数值,
以及用哪个库、什么渲染器、什么字号,都在里面写定了。

**只读写自己那一页的 HTML。** 别的页正被并发建着,读到的可能是半成品。
共享的 CSS/JS、契约、规划文档当然要读。

完工前用 `python3 assets/selfcheck.py page-{pid_nn}.html` 自检到干净为止:
JS 无报错、没有元素超出画布或被裁、字号不低于地板、没有文字叠压。
只交付这一个 HTML 文件,不写文档、不写测试、不写总结。做完直接结束。
"""


SKELETON = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title></title>
<link rel="stylesheet" href="assets/base.css">
<link rel="stylesheet" href="assets/deck.css">
</head>
<body data-page="{nn}" data-total="{total:02d}">
<div id="stage"><main id="main"></main></div>
<script src="assets/base.js"></script>
<script src="assets/deck.js"></script>
</body></html>
"""


def build(label: str) -> None:
    run = RUNS_ROOT / label
    pages = run / "pages"
    (pages / "assets").mkdir(parents=True, exist_ok=True)

    # ① 底盘 + 库 + 数据,原样搬。规格里的字面代码指着它们。
    for name in ("base.css", "base.js", "deck.css", "deck.js",
                 "CHASSIS.md", "selfcheck.py"):
        shutil.copy2(SRC / "assets" / name, pages / "assets" / name)
    for d in ("lib", "data", "img"):
        s, t = SRC / "assets" / d, pages / "assets" / d
        if s.exists() and not t.exists():
            if s.is_symlink():
                t.symlink_to(s.resolve())
            else:
                shutil.copytree(s, t)

    # ② 规划产物:逐页规格 + 共享契约 + 总规划
    (pages / "plan").mkdir(exist_ok=True)
    for f in (SRC / "plan").glob("*.md"):
        shutil.copy2(f, pages / "plan" / f.name)
    plan_text = (SRC / "PLAN.md").read_text(encoding="utf-8")
    (run / "PLAN.md").write_text(plan_text, encoding="utf-8")
    (pages / "plan" / "deck.md").write_text(plan_text, encoding="utf-8")
    # Opus 的共享契约就是 plan/SHARED.md —— 用它当 CONTRACT.md
    shutil.copy2(SRC / "plan" / "SHARED.md", run / "CONTRACT.md")

    rows = page_table(plan_text)
    specs = sorted((SRC / "plan").glob("p[0-9][0-9].md"))
    total = len(specs)

    # ③ 骨架:照 Opus 自己的页面头尾生成(它的规格假定 deck.css/deck.js 已接线)
    for f in specs:
        nn = f.stem[1:]
        p = pages / f"page-{nn}.html"
        if not p.exists():
            p.write_text(SKELETON.format(nn=nn, total=total), encoding="utf-8")

    # ④ briefs.json。**不能直接用我们的 brief 模板** —— 它里面写着
    # 「再读 assets/theme.css」和「`Lec` 的接口」,而 Opus 的底盘里叫 `deck.css`、
    # 接口是 `Deck.*` / `Chrome.mount`。照抄过去,建页 agent 会去找不存在的文件、
    # 白烧步数(实测同类情形:一页为了找一个不存在的 API 文档烧了 92 次调用、
    # 64 分钟、一个字没写出来)。所以这一轮用一份专门的 brief,只改指针不改要求。
    tpl = BRIEF_NN11
    out = []
    for f in specs:
        nn = f.stem[1:]
        r = rows.get(nn, {})
        out.append(Brief(f"Build page-{nn}", fill(
            tpl, minutes=90, query="Apeman – Spaceman", num=int(nn),
            page=pages / f"page-{nn}.html", pid=f"page-{nn}", total=total,
            contract=run / "CONTRACT.md", assets=pages / "assets",
            deck=pages / "plan" / "deck.md", spec=pages / "plan" / f.name,
            stay=f"{r.get('stay', 120):g} 秒", pid_nn=nn,
            structure=r.get("structure", "process"))).as_tool_input())
    (run / "briefs.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"  {label}: {total} 页  规格 {len(specs)} 份  "
          f"页表解析出 {len(rows)} 行  briefs {len(out)} 份")
    print(f"     底盘: {', '.join(sorted(x.name for x in (pages/'assets').iterdir())[:8])}")


if __name__ == "__main__":
    for lab in sys.argv[1:] or ["nn11-low", "nn11-med"]:
        build(lab)
