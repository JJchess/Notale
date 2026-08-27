#!/usr/bin/env python3
"""把某一页 builder 收到的**完整**输入导出成一份自包含的 md,好在别处复跑对照。

    python3 dump_page.py --label sonnet-full-20260827 --page page-09 --out /tmp/x.md

## 和 dump_brief.py 的区别

`dump_brief.py` 停在了两代以前的配置(它拼的是 `IDENTITY + philosophy + catalog()`,
而生产早就换成 `IDENTITY + anti_slop_block + assigned_workflow`)。
**所以这里一律从 `core.builder` / `core.skills` 现取,不再手写拼法** ——
手写的那份注定会再漂一次。

## 导出的是什么

builder 的上下文分两层:

  一、首个请求 —— system 指令 + 首条 user 消息(brief)。brief 是一份**指针清单**,
      九成内容是「去读哪几个文件」。
  二、它自己读进来的 —— 指针指到的文件,由模型调 Read 拉进上下文。

第二层不是 prompt,但它是上下文的大头(`build-interaction` 那份 reference 就有 91KB)。
要在别处复跑,这些文件必须一起给,否则对照的不是同一件事。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from core import skills                                      # noqa: E402
from core.builder import IDENTITY, page_from_brief           # noqa: E402


def fence(text: str, lang: str = "") -> str:
    """围栏要比正文里最长的一串反引号更长,否则内容里的代码块会把围栏截断。"""
    longest = max((len(m) for m in re.findall(r"`+", text)), default=0)
    bar = "`" * max(3, longest + 1)
    return f"{bar}{lang}\n{text.rstrip()}\n{bar}"


def main() -> None:
    a = argparse.ArgumentParser()
    a.add_argument("--label", required=True)
    a.add_argument("--page", required=True, help="例如 page-09")
    a.add_argument("--out", required=True)
    n = a.parse_args()

    run = ROOT / "runs" / n.label
    briefs = json.loads((run / "briefs.json").read_text(encoding="utf-8"))
    raw = next((b for b in briefs if b["description"] == f"Build {n.page}"), None)
    if raw is None:
        raise SystemExit(f"✗ {n.label} 里没有 {n.page}")

    page = page_from_brief(raw)
    wf = page.primary_workflow
    wf_dir = skills.WORKFLOWS / wf

    # system 块:与 core/builder.py:main() 同一拼法。philosophy 默认不注入。
    sysmsg = (IDENTITY + "\n\n" + skills.anti_slop_block(skills.WORKFLOWS)
              + "\n\n" + skills.assigned_workflow(wf, skills.WORKFLOWS))

    # brief 指到的文件。顺序照 prompts/brief.md 里那份必读清单。
    reads: list[tuple[str, Path]] = [
        ("assets/CHASSIS.md", run / "pages" / "assets" / "CHASSIS.md"),
        ("CONTRACT.md", run / "CONTRACT.md"),
        (f"plan/{n.page.replace('page-', 'p')}.md",
         run / "pages" / "plan" / f"{n.page.replace('page-', 'p')}.md"),
        (f"workflows/{wf}/SKILL.md", wf_dir / "SKILL.md"),
    ]
    for ref in sorted((wf_dir / "references").glob("*.md")):
        reads.append((f"workflows/{wf}/references/{ref.name}", ref))
    libs = run / "pages" / "assets" / "lib" / "LIBS.md"
    if libs.is_file():
        reads.append(("assets/lib/LIBS.md", libs))
    reads = [(k, v) for k, v in reads if v.is_file()]

    skel = run / "pages" / f"{n.page}.html"
    body: list[str] = [
        f"# builder 收到的完整输入 · `{n.label}` / `{n.page}`", "",
        "这份文件是**原样导出**,不转述不摘要 —— 用处正是「看清它到底收到了什么」。", "",
        f"- 指派 workflow：`{wf}`",
        f"- 一次请求里 system + brief 合计 **{len(sysmsg) + len(page.prompt):,}** 字符",
        f"- 加上它自己会读进来的文件，上下文合计约 "
        f"**{len(sysmsg) + len(page.prompt) + sum(len(v.read_text(encoding='utf-8')) for _, v in reads):,}** 字符",
        "",
        "## 体量分布", "",
        "| 层 | 是什么 | 字符 |", "|---|---|---:|",
        f"| 一 | system 指令 | {len(sysmsg):,} |",
        f"| 一 | 首条 user 消息（brief） | {len(page.prompt):,} |",
    ]
    for k, v in reads:
        body.append(f"| 二 | `{k}` | {len(v.read_text(encoding='utf-8')):,} |")

    body += [
        "", "---", "",
        "## 一 · system 指令", "",
        "每一次调用都重发。由 `IDENTITY` + 反 slop 块 + 指派 workflow 三段拼成"
        "（设计哲学默认不注入）。", "",
        fence(sysmsg), "",
        "## 二 · 首条 user 消息（brief）", "",
        "**它是一份指针清单** —— 九成内容是「去读哪几个文件」，真正的内容在下面第三节。", "",
        fence(page.prompt), "",
        "## 三 · 空骨架（施工起点）", "",
        f"`{n.page}.html` 一开始长这样，builder 要把它改成完整一页：", "",
        fence(skel.read_text(encoding="utf-8") if skel.is_file() else "(缺失)", "html"), "",
        "---", "",
        "## 四 · brief 指到的文件（原文）", "",
        "这些不是 prompt，是 builder 用 `Read` 自己拉进上下文的。"
        "**要在别处复跑就必须一起给**，否则对照的不是同一件事。", "",
    ]
    for k, v in reads:
        t = v.read_text(encoding="utf-8")
        lang = "html" if k.endswith(".html") else ""
        body += [f"### `{k}`（{len(t):,} 字符）", "", fence(t, lang), ""]

    Path(n.out).write_text("\n".join(body) + "\n", encoding="utf-8")
    print(f"→ {n.out}  {Path(n.out).stat().st_size:,} 字节")


if __name__ == "__main__":
    main()
