"""skill 清单。

保留 skill 的理由不是 nn-06 的数据 —— 那一轮 841 次调用里 Skill 用了 0 次。
但那是 Opus 5 跑出来的。harness 最终用的是 Sonnet 5 和 gpt-5.6-sol,能力弱一些,
技法指引的边际价值反而更高;拿 Opus 的 0 次去否定弱模型的需要,是取错了样本。

成本不构成理由:49 份的名字加描述合计约 9k 字符,一个 system 块装得下。
正文合计 486k、单份中位 6.4k —— 所以只注入清单,正文按需由 Skill 工具取。
"""

from __future__ import annotations

import re
from pathlib import Path

DEFAULT = Path("/data1/home/zhuyifan/ws2/Notale/notale/zero/.claude/skills")
_FM = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.S)


def _desc(text: str) -> str:
    m = _FM.match(text)
    if not m:
        return ""
    d = re.search(r"^description:\s*(.+?)\s*$", m.group(1), re.M)
    return d.group(1).strip() if d else ""


def catalog(root: Path = DEFAULT) -> str:
    """拼出注入 system 的那一块。

    描述用的是压缩过的那一版:nn-06 抓包证实注入侧 65 条**全部带描述、裸名字 0 条**,
    截断问题已经解决,不会出现「看得见名字但不知道干什么」。
    """
    rows = []
    for d in sorted(root.iterdir()):
        f = d / "SKILL.md"
        if f.is_file():
            rows.append((d.name, _desc(f.read_text(encoding="utf-8", errors="replace"))))
    body = "\n".join(f"- {n}: {t}" for n, t in rows if t)
    return ("下面这些 skill 可以通过 Skill 工具调用,调用后会把那份技法文档的正文给你。\n"
            "调不调、调哪个、什么时候调,你自己判断。\n\n" + body)


def load(name: str, root: Path = DEFAULT) -> str:
    f = root / name / "SKILL.md"
    if not f.is_file():
        avail = ", ".join(sorted(p.name for p in root.iterdir() if (p / "SKILL.md").is_file()))
        return f"没有名为 {name!r} 的 skill。可用的: {avail}"
    return f.read_text(encoding="utf-8", errors="replace")
