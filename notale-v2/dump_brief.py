#!/usr/bin/env python3
"""把某一轮里两页 builder 收到的**完整**输入原样导出成一份 md。

不转述、不摘要 —— 全文照搬。因为这份文件的用处正是「看清它到底收到了什么」,
而摘要会把问题藏起来。

builder 收到的东西分三层,只有前两层是真正意义上的 prompt:

  一、系统指令   —— 所有页一模一样,每一次调用都重发
  二、首条用户消息 —— 就是 brief,逐页不同,但九成内容相同(它是一份指针清单)
  三、它自己读进来的 —— brief 里指到的文件,由模型调 Read 拉进上下文

第三层不是 prompt,但它是上下文的大头,所以这里也一并给出,并标明各自体量。

    python3 dump_brief.py --label ape-g7 --pages 19 12 --out BRIEF-SAMPLE.md
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from core import skills                                    # noqa: E402
from core.builder import IDENTITY                          # noqa: E402

ROOT = Path(__file__).parent


def fence(text: str, lang: str = "") -> str:
    """用足够长的围栏包住,免得内容里的 ``` 把围栏截断。"""
    n = 3
    while "`" * n in text:
        n += 1
    return f"{'`' * n}{lang}\n{text.rstrip()}\n{'`' * n}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", default="ape-g7")
    ap.add_argument("--pages", nargs="+", default=["19", "12"])
    ap.add_argument("--out", default="BRIEF-SAMPLE.md")
    a = ap.parse_args()

    run = ROOT / "runs" / a.label
    briefs = json.loads((run / "briefs.json").read_text(encoding="utf-8"))
    phil = (ROOT / "prompts" / "philosophy.md").read_text(encoding="utf-8")
    cat = skills.catalog()
    sysmsg = IDENTITY + "\n\n" + phil + "\n\n" + cat

    shared = {
        "plan/deck.md": run / "pages/plan/deck.md",
        "CONTRACT.md": run / "CONTRACT.md",
        "assets/CHASSIS.md": run / "pages/assets/CHASSIS.md",
        "assets/theme.css": run / "pages/assets/theme.css",
    }

    picked = []
    for nn in a.pages:
        pid = f"page-{int(nn):02d}"
        b = next((x for x in briefs if pid in x["prompt"]), None)
        if b is None:
            print(f"  ⚠ {pid} 在 briefs.json 里找不到,跳过")
            continue
        spec = run / f"pages/plan/p{int(nn):02d}.md"
        picked.append((pid, b, spec))

    L = []
    L += [f"# builder 收到的完整输入 · `{a.label}`", "",
          "两页做例子,**全文照搬,没有摘要**。",
          "", "## 它收到的东西分三层", "",
          "只有前两层是真正意义上的 prompt —— 每次模型调用都会重发；",
          "第三层是 brief 里的指针，由它自己调 `Read` 拉进上下文。", "",
          "| 层 | 是什么 | 逐页不同？ | 字符数 |", "|---|---|---|---|",
          f"| 一 | 系统指令 | 否，45 页完全相同 | {len(sysmsg):,} |"]
    for pid, b, spec in picked:
        L.append(f"| 二 | 首条用户消息（brief · {pid}） | 是 | {len(b['prompt']):,} |")
    for pid, b, spec in picked:
        L.append(f"| 三 | `plan/p{pid[5:]}.md`（它那一页的规格） | 是 | "
                 f"{len(spec.read_text(encoding='utf-8')):,} |")
    for k, v in shared.items():
        L.append(f"| 三 | `{k}` | 否 | {len(v.read_text(encoding='utf-8')):,} |")
    tot = len(sysmsg) + sum(len(v.read_text(encoding="utf-8")) for v in shared.values())
    L += ["",
          f"一页读完全部指针的话，上下文里大约是 "
          f"**{tot + len(picked[0][1]['prompt']) + len(picked[0][2].read_text(encoding='utf-8')):,} 字符**"
          f"（系统指令 + brief + 自己那份规格 + 四份共享文件）。",
          "",
          "对照：Opus 那条线同类的共享文本是 13,899 字符（`PLAN.md` + `SHARED.md` + 逐页规格），",
          "我们这一轮是 16,580（`deck.md` + `CONTRACT.md` + 逐页规格）—— 上一轮是 28,378。",
          ""]

    L += ["---", "", "# 一 · 系统指令（45 页完全相同）", "",
          f"由三段拼起来：`IDENTITY` + `prompts/philosophy.md` + `skills.catalog()`，"
          f"共 {len(sysmsg):,} 字符。", "",
          "## 1.1 `IDENTITY`", "", fence(IDENTITY), "",
          f"## 1.2 `prompts/philosophy.md`（{len(phil):,} 字符）", "",
          "这一份是 lab 那条线从 `CLAUDE.md` 里量出来会逐字到达每个 subagent 的 12 块，",
          "notale-v2 保留了自己的一份副本。", "", fence(phil, "markdown"), "",
          f"## 1.3 skill 清单（{len(cat):,} 字符）", "",
          "53 份技法文档的一句话说明 + 调用方式。**这是系统指令里最大的一块**，",
          "而实测每页真正读的只有规划指派给它的那两三份。", "", fence(cat, "markdown"), ""]

    for i, (pid, b, spec) in enumerate(picked, start=2):
        L += ["---", "",
              f"# {'二三四五'[i-2]} · 例 {i-1}：`{pid}`", "",
              f"## {i}.1 首条用户消息（brief，{len(b['prompt']):,} 字符）", "",
              "**这就是 harness 唯一直接塞给它的东西。** 注意它几乎全是指针 —— ",
              "`briefs()` 是模板填充，不问模型（全流程唯一不照抄 Claude Code 的一处）。", "",
              fence(b["prompt"], "markdown"), "",
              f"## {i}.2 它那一页的规格 `plan/p{pid[5:]}.md`"
              f"（{len(spec.read_text(encoding='utf-8')):,} 字符）", "",
              "brief 里指到这一份，由它自己 Read 进来。",
              "**这一轮把「每个数值连单位和出处都写进来」改成了「只点名用了 `Lec` 的哪几个函数」**，",
              "所以中位从 3,116 字符掉到 929 —— 值留在 `assets/lec.js`，唯一真相只有一处。", "",
              fence(spec.read_text(encoding="utf-8"), "markdown"), ""]

    L += ["---", "", f"# {'二三四五'[len(picked)]} · 两页都会读到的共享文件", ""]
    for k, v in shared.items():
        t = v.read_text(encoding="utf-8")
        note = ""
        if k == "CONTRACT.md":
            note = ("**这一轮从 13,549 字符降到 5,346。** 原来它末尾会把整份 `CHASSIS.md` "
                    "抄一遍（有一轮 12,802 字符，占 40%）——现在改成指路，"
                    "底盘接口由每页自己读 `assets/CHASSIS.md`。\n\n")
        elif k == "assets/CHASSIS.md":
            note = ("契约改指路之后，这一份的读取次数从**全程 1–3 次**变成**每页各一次（45 次）**。\n\n")
        elif k == "plan/deck.md":
            note = ("整套共享的部分：主线、证据链、页表、页间归属、数字口径。\n"
                    "**它现在是每页共享文本里最大的一项（10,305 字符）** —— "
                    "下一步该做的「给每页切 deck 片」就是治它。\n\n")
        L += [f"## `{k}`（{len(t):,} 字符）", "", note.rstrip(), "",
              fence(t, "css" if k.endswith(".css") else "markdown"), ""]

    out = ROOT / a.out
    out.write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"{out}  {len(out.read_text(encoding='utf-8')):,} 字符  "
          f"{len(picked)} 页例子")


if __name__ == "__main__":
    main()
