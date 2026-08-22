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
    # 措辞是量出来的,不是写顺口的。原来这里写「调不调、调哪个、什么时候调,你自己判断」——
    # 那句话对应的实测是 **Skill 调用在 nn-03 / nn-06 / nn-07 / nn-09 四轮全是 0 次**
    # (换成 Sonnet 照样 0,不是 Opus 的怪癖)。库那边是同一条规律:预置了 4 轮、
    # 用量 2/1/3/0,改成硬禁令之后手写 canvas 降 80%。所以这里也改成硬措辞。
    return ("下面这些 skill 可以通过 Skill 工具调用,调用后会把那份技法文档的正文给你。\n"
            "**清单里有对应技法文档的,先读了再动手,不要自己从头摸索一套。**\n"
            "理由和库一样:每页各自重新试一遍,产出不稳定、也慢。\n"
            "清单里没有对应的,就自己写,不必硬凑。\n\n" + body)


# 技法文档里的路径占位符。**必须替换成真实绝对路径。**
#
# 这是量出来的,而且代价是一整类功能缺失:`Skill` 工具原来把 SKILL.md 原文照搬返回,
# 而文档里写的是
#     python3 <skill-dir>/scripts/gen.py "<prompt>" --out pages/assets/img/x.png
#     **Script:** `webmedia.py` (in this dir)
# 占位符无人替换,而 builder 的 Bash cwd 钉在 pages/ —— 它拿到的是一条指向不存在的
# 位置的命令。实测一轮 409 次工具调用里,碰到 skill 脚本的 Bash **0 次**;
# 那一轮 assets/img 0 个文件、`<img>` 0 处。而 Claude Code 原生的 Skill 工具会
# 解析出真实目录,所以同样两个 skill 在 lab 那条线上拿到了 20 张图。
#
# 有意思的是模型的反应不一样:GPT 照文档写、路径不通就放弃(0 张图);
# DeepSeek-V4-Pro 自己绕过去直接用 Wikimedia 的 URL(16 张图)。
# 两种都不是我们想要的 —— 前者丢功能,后者绕过了取图脚本的许可与出处记录。
_PATH_HINTS = (
    ("<skill-dir>", None),          # None = 用 skill 自己的目录
    ("(in this dir)", None),
    ("（in this dir）", None),
)


def load(name: str, root: Path = DEFAULT) -> str:
    f = root / name / "SKILL.md"
    if not f.is_file():
        avail = ", ".join(sorted(p.name for p in root.iterdir() if (p / "SKILL.md").is_file()))
        return f"没有名为 {name!r} 的 skill。可用的: {avail}"
    t = f.read_text(encoding="utf-8", errors="replace")
    d = (root / name).resolve()
    t = t.replace("<skill-dir>", str(d))
    t = t.replace("(in this dir)", f"(在 {d}/ 下)").replace("（in this dir）", f"(在 {d}/ 下)")
    # 文档里裸写的脚本名(webmedia.py / gen.py / freesound-fetch.py …)也补成绝对路径,
    # 否则「`webmedia.py "rocket launch"`」这种示例照抄下来还是跑不了。
    for script in sorted(d.rglob("*.py")):
        bare = script.name
        if bare in t:
            t = re.sub(rf"(?<![\w/.-]){re.escape(bare)}", str(script), t)
    return (t + f"\n\n---\n\n**路径已由 harness 解析:这份文档所在目录是 `{d}`,"
            f"上面出现的脚本路径都是可以直接跑的绝对路径。**\n")
