#!/usr/bin/env python3
"""把 briefs.json 里的 skill 指派段整块剥掉,做消融的「无指派」那一臂。

    python3 strip_skills.py --label s5-orb            # 就地剥,先自动留底
    python3 strip_skills.py --label s5-orb --restore  # 从留底恢复(有指派)
    python3 strip_skills.py --label s5-orb --check    # 只看,不改

## 为什么要整块剥,而不是只删名字

prompts/brief.md 里那段现在是 `{assignment}`,落成:

    ## 主工作流
      - build-page

只删 `  - <name>` 那一行,会留下一个指着空清单的小节标题 —— 那比有指派更奇怪,
而且是一种谁都没见过的第三种条件,消融就不干净了。所以连标题一起剥。

模板改过四次,runs/ 下四种写法都还在,BLOCK 四种都认(见下面的注释)。
剥完之后 brief 的结构与 orbit-01 一致(已核实 orbit-01 的 brief 里完全没有这一段)。

## 这一臂到底关掉了什么

**只关「指派」,不关「能力」。** core/builder.py:197 无论如何都把完整 skill 清单
注入 instructions,Skill 工具也一直在工具面里。所以无指派臂 = 看得见、够得着、
没人告诉它该用哪个 —— 正是 nn-03/nn-06/nn-07 那三轮 Claude Code 的条件(Skill 0 次)。

版式指派段**不动**。这一轮要隔离的是 skill 指派这一个变量。
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RUNS_ROOT = ROOT.parent / "runs" / ROOT.name
NONE_LINE = "  (这一页没有指派技法文档,直接动手)"

# 指派段整块拿掉,连同尾随空行。
#
# **这里认四种写法,因为 brief 模板改过四次,而 runs/ 下四种都还躺着。**
# 上一版只认最老那一种(「**这一页必须先读完…读完再写代码。」),而 prompts/brief.md
# 早已换成 `{assignment}` → `## 主工作流`。后果是 --check 对当前的轮次一律报
# 「已经是无指派状态」,**消融的对照臂根本产生不出来,而且是静默的** ——
# 正是下面那道孤儿闸想拦的漂移,只不过漂移发生在闸的上游,闸压根没被触发。
#
#   1  ## 主工作流          + 一行 `  - <name>`            (当前)
#   2  ## 必用skill         + 若干 `  - <name>` 或 `  (无)`  (单/多 skill 过渡期)
#   3  规划为本页指派了以下技法文档。…                        (更早)
#   4  **这一页必须先读完下面这些技法文档,再动手**…不是可选项。   (最早;
#      半角与全角标点两版都有 —— ape-g18 是全角,上一版正则只写了半角)
#
# 用 re.S 让 . 跨行;非贪婪,免得一次吃掉后面的版式段。
_INTRO = (
    r"##\s*主工作流\s*\n"
    r"|##\s*必用skill\s*\n"
    r"|规划为本页指派了以下技法文档。[^\n]*\n\n"
    r"|\*\*这一页必须先读完下面这些技法文档[,，]再动手\*\*[(（][^)）]*[)）][:：]\n\n"
)
# 段体:若干条 `  - <name>`,或 NONE_LINE 那种 `  (…)` 占位行。
_BODY = r"(?:[ \t]{2,}(?:-[ \t]*\S+|\([^\n]*\))[ \t]*\n)+"
# 第 4 种写法后面还跟一句收尾,一并吃掉。
_TAIL = r"(?:\n?这是规划阶段按你这一页[^\n]*?不是可选项。[^\n]*\n)?"
BLOCK = re.compile(rf"(?:{_INTRO}){_BODY}{_TAIL}\n*", re.S)

NAME = re.compile(r"^  - (\S+)$", re.M)


def load(label: str) -> tuple[Path, list]:
    p = RUNS_ROOT / label / "briefs.json"
    if not p.is_file():
        sys.exit(f"找不到 {p}")
    return p, json.loads(p.read_text(encoding="utf-8"))


def main() -> None:
    a = argparse.ArgumentParser()
    a.add_argument("--label", required=True)
    a.add_argument("--restore", action="store_true", help="从 briefs.with-skills.json 恢复")
    a.add_argument("--check", action="store_true", help="只报告,不改")
    n = a.parse_args()

    p, briefs = load(n.label)
    backup = p.with_name("briefs.with-skills.json")

    if n.restore:
        if not backup.is_file():
            sys.exit(f"没有留底 {backup}")
        shutil.copy2(backup, p)
        b2 = json.loads(p.read_text(encoding="utf-8"))
        hit = sum(1 for b in b2 if BLOCK.search(b["prompt"]))
        print(f"已从留底恢复:{len(b2)} 份 brief,{hit} 份带指派段")
        return

    hit = [i for i, b in enumerate(briefs) if BLOCK.search(b["prompt"])]
    assigned = sorted({m for b in briefs for m in NAME.findall(b["prompt"])})
    print(f"{p}")
    print(f"  brief {len(briefs)} 份,带 skill 指派段的 {len(hit)} 份")
    print(f"  被指派过的 skill {len(assigned)} 种: {', '.join(assigned) or '无'}")

    if n.check:
        return
    if not hit:
        print("  已经是「无指派」状态,什么都没做")
        return

    if not backup.is_file():
        shutil.copy2(p, backup)
        print(f"  留底 → {backup.name}")

    out, removed = [], 0
    for b in briefs:
        s, k = BLOCK.subn("", b["prompt"])
        removed += k
        out.append({**b, "prompt": s})
    # 剥完不许还剩「  - <name>」这种孤行 —— 剩了说明模板变过,正则没跟上,
    # 那时候宁可报错也不要产出一份半剥的 brief(会变成第三种条件)。
    orphan = [i for i, b in enumerate(out) if NAME.search(b["prompt"])]
    if orphan:
        sys.exit(f"✗ 剥完仍有 {len(orphan)} 份残留 '  - <name>' 行(brief 模板可能改过),"
                 f"已中止,原文件未动。先看 page {orphan[:3]}")
    p.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    lens = sorted(len(b["prompt"]) for b in out)
    print(f"  已剥掉 {removed} 段,{len(out)} 份 brief 现为 {lens[0]}–{lens[-1]} 字符"
          f"(中位 {lens[len(lens)//2]})")
    print(f"  恢复:  python3 strip_skills.py --label {n.label} --restore")


if __name__ == "__main__":
    main()
