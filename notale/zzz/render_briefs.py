#!/usr/bin/env python3
"""把结构化的规划渲染成 N 份 subagent 简报。

**为什么要有这个东西**

nn-03 实测:协调者在一条消息里手写了 14 份简报,共 31,639 字符。一条消息里的多个
Agent 调用是随流式输出**逐个起跑**的,所以第 1 个和第 14 个之间差了 6:24 —— 占整个
构建墙钟的 15%,而最后那个 subagent 就是白等了六分半才开始干活。这段成本随页数
线性增长,而且全部花在"把样板一个字一个字重打一遍"上。

改成:协调者只输出**结构化的规划数据**(每页讲什么、用什么形式、否决了什么),
harness 拿模板渲染成 N 份简报、一次性派发。模型只负责决定内容,不负责排版。

**第二个收益:prompt 缓存**

手写的 14 份简报从第 24 个字符起就各不相同,前缀缓存一点都吃不到。模板渲染可以
把所有不变的内容放在最前面、逐字节一致,于是 `SHARED` 那段只在第一份上付全价。
断点前的内容必须逐字节相同 —— 页码、时间戳这类东西一旦混进去,缓存静默失效,
不报错,只是每次都重新付全价。

    python3 render_briefs.py plan.json                # 渲染到 stdout(带分隔)
    python3 render_briefs.py plan.json --out briefs/  # 每页一个 .md
    python3 render_briefs.py plan.json --check        # 只校验规划,不渲染
    python3 render_briefs.py --schema                 # 打印规划的字段说明

规划的字段是从 nn-03 真实产出的简报里反推的,不是拍脑袋定的 —— 那 14 份简报每份
都由这么几块组成:幕标、标题、版式、要读者带走什么、核心互动、技术建议、不要讲、
否决过的形式。
"""

import argparse
import json
import sys
from pathlib import Path

# ── 规划的字段 ───────────────────────────────────────────────────────────────
# 必填的三项是有理由的:
#   takeaway  —— 没有它,subagent 不知道这页存在的意义,会照着 interaction 做花活
#   interaction —— 整套讲义的核心;缺了就退化成静态幻灯片
#   rejected  —— nn-03 的指令明确要求写出否决理由,实测这一项让各页形式不重样
FIELDS = {
    "kicker":      ("选填", "幕标,例如「第一幕 · 进门」。没有就不出现这一行"),
    "title":       ("必填", "这一页的标题"),
    "subtitle":    ("选填", "副标题 / 一句话定性"),
    "layout":      ("选填", "版式代号或一句话描述"),
    "takeaway":    ("必填", "读者看完这页要带走什么"),
    "interaction": ("必填", "核心互动:必须实现的那一个,写清楚交互怎么发生"),
    "tech":        ("选填", "技术建议:用哪个库、该注意的 API 细节"),
    "avoid":       ("选填", "不要讲什么(留给别的页的内容)"),
    "rejected":    ("必填", "考虑过并否决的形式,以及否决理由"),
}

# ── 模板 ────────────────────────────────────────────────────────────────────
# SHARED 必须逐字节不变。任何随页码变化的东西都不许出现在这里,否则缓存断点失效。
SHARED = """你是《{deck}》的一页的构建者。

必读(按顺序,全部读完再动手):
1. `{contract}` —— 构建契约:页面骨架、共享 CSS/JS、类名、画法约定、禁止事项、自检清单。逐条遵守。
2. `{plan_doc}` —— 读「全局叙事结构」和「全局设计契约」两节,以及下面指定给你的那一节。其他页的小节只作上下文,不要实现它们的内容。
3. `{assets}` —— 看清有哪些现成的类和 API 可用。

工作目录 `{workdir}`,**只产出一个文件**,文件名见下。

写完按契约里的自检清单逐条过一遍。汇报不超过 8 行。
"""

PER_PAGE = """
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
本页:{deck} 共 {total} 页中的**第 {nn} 页**,产出 `pages/page-{nn}.html`。
在 `{plan_doc}` 里读 `page-{nn}` 小节。
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""


def block(label, value):
    if not value:
        return ""
    if isinstance(value, list):
        body = "\n".join(f"- {v}" for v in value)
        return f"\n**{label}**\n{body}\n"
    return f"\n**{label}**:{value}\n"


def render_one(cfg, page, nn, total):
    out = [PER_PAGE.format(deck=cfg["deck"], total=total, nn=nn,
                           plan_doc=cfg["plan_doc"])]
    if page.get("kicker"):
        out.append(f"\n幕标:`{page['kicker']}`\n")
    out.append(block("标题", page["title"]))
    out.append(block("副标题", page.get("subtitle")))
    out.append(block("版式", page.get("layout")))
    out.append(block("要读者带走什么", page["takeaway"]))
    out.append(block("核心互动(必须实现)", page["interaction"]))
    out.append(block("技术建议", page.get("tech")))
    out.append(block("不要讲", page.get("avoid")))
    out.append(block("否决过的形式(不要退回去做)", page["rejected"]))
    return "".join(out)


def validate(cfg):
    errs = []
    for k in ("deck", "workdir", "contract", "plan_doc", "assets", "pages"):
        if not cfg.get(k):
            errs.append(f"顶层缺 `{k}`")
    pages = cfg.get("pages") or []
    if not isinstance(pages, list) or not pages:
        errs.append("`pages` 要是非空数组")
        return errs
    for i, p in enumerate(pages, 1):
        for k, (need, _) in FIELDS.items():
            if need == "必填" and not p.get(k):
                errs.append(f"第 {i} 页缺 `{k}`")
        for k in p:
            if k not in FIELDS:
                errs.append(f"第 {i} 页有未知字段 `{k}`")
    return errs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("plan", nargs="?")
    ap.add_argument("--out", help="输出目录,每页一个 .md")
    ap.add_argument("--check", action="store_true", help="只校验")
    ap.add_argument("--schema", action="store_true", help="打印字段说明")
    a = ap.parse_args()

    if a.schema:
        print("顶层字段: deck / workdir / contract / plan_doc / assets / pages\n")
        print("pages[] 里每页:")
        for k, (need, desc) in FIELDS.items():
            print(f"  {k:<12} {need}  {desc}")
        return 0
    if not a.plan:
        ap.error("要么给 plan.json,要么用 --schema")

    cfg = json.loads(Path(a.plan).read_text(encoding="utf-8"))
    errs = validate(cfg)
    if errs:
        print("规划不合格:")
        for e in errs:
            print(f"  ✗ {e}")
        return 1
    if a.check:
        print(f"规划合格:{len(cfg['pages'])} 页")
        return 0

    total = len(cfg["pages"])
    shared = SHARED.format(deck=cfg["deck"], contract=cfg["contract"],
                           plan_doc=cfg["plan_doc"], assets=cfg["assets"],
                           workdir=cfg["workdir"])
    briefs = []
    for i, p in enumerate(cfg["pages"], 1):
        briefs.append((f"{i:02d}", shared + render_one(cfg, p, f"{i:02d}", total)))

    if a.out:
        d = Path(a.out)
        d.mkdir(parents=True, exist_ok=True)
        for nn, txt in briefs:
            (d / f"brief-{nn}.md").write_text(txt, encoding="utf-8")
        per = [len(t) - len(shared) for _, t in briefs]
        print(f"{total} 份简报 → {d}/")
        print(f"  共享前缀 {len(shared):,} 字符(逐字节一致,缓存断点放这后面)")
        print(f"  每页专属 {min(per):,}–{max(per):,} 字符,合计 {sum(per):,}")
        print(f"  同样内容手写要吐 {len(shared)*total + sum(per):,} 字符;"
              f"模板化之后模型只需产出规划本身")
    else:
        for nn, txt in briefs:
            print(f"\n{'='*70}\n# brief-{nn}\n{'='*70}\n{txt}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
