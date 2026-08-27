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

# **不指向 notale-v2 外面。** 以前这里是 `../notale/zero/.claude/skills`,
# 那个目录被删掉之后:图池 0/12、45 份规格的「必用skill」全空、expand 静默抛
# FileNotFoundError —— 一天里三次中断都出在这一类。
# 现在 harness 的输入全部在 notale-v2/vendor 下,跟着这个包一起走。
LEGACY = Path(__file__).resolve().parent.parent / "vendor" / "skills"
WORKFLOWS = Path(__file__).resolve().parent.parent / "workflows"
DEFAULT = LEGACY

# Planner 只在这八个“建页工作流”里选一个。另两份各有单独职责：
# plan-direction 属于全课主题阶段，check-page 只用于已有页面的修复。
# build-motion 已并入 build-page（构图与动效互斥单选是错误建模——静态页
# 几乎都同时需要两者），不再是独立候选。
# plan-typography 已挪去 attic/（见该目录 README）：wf2 那轮 21 页 0/21 命中,
# 字号地板已经在 CONTRACT.md 里对每页强制生效、不依赖这条路由；真正打不到的是
# 它更深的排版规则，而这类判断只有正文写出来之后(build 阶段)才看得见，
# 不该指望 planner 提前预判。
PAGE_WORKFLOWS = (
    "build-learning-game",
    "build-3d-scene",
    "build-2d-sim",
    "build-chart",
    "build-interaction",
    "get-photo-ref",
    "get-illustration",
    "build-page",
)
ALL_WORKFLOWS = PAGE_WORKFLOWS + ("plan-direction", "check-page")
# scrub-copy-slop.md / scrub-visual-slop.md 不是 workflow —— 没有 SKILL.md,不会被
# `Skill` 工具或 available() 发现。之所以不挂靠成第 13/14 个 workflow:`Skill` 工具在
# builder 循环里被硬拦到只能读 page.primary_workflow(core/builder.py:345-347),而这
# 两份从不是任何页面的 primary_workflow,挂成 workflow 只会让正文变成没有代码路径
# 会读到的死文本。
#
# 也不再靠"在别的 workflow 的 Reference routing 里点名一行 Read"这条路径——
# 那条路径能不能生效,取决于 agent 愿不愿意在改页面前先调 Read,是概率性的。
# 这两份内容管的是每一页都成立的底线（不看 workflow 路由结果都不该出现的 AI 味），
# 跟 FLOORS 是同一类东西，所以走同一条确定性路径：`anti_slop_block()` 把两份原文
# 整段读出来，包 XML 标签后拼进每页 agent 的 system 块（core/builder.py 的 `base`），
# 从第一次请求起就在场，且随每一步重发——不依赖 agent 主动去读。
_FM = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.S)


def _desc(text: str) -> str:
    m = _FM.match(text)
    if not m:
        return ""
    d = re.search(r"^description:\s*(.+?)\s*$", m.group(1), re.M)
    if not d:
        return ""
    value = d.group(1).strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1]
    return value


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


def available(root: Path) -> tuple[str, ...]:
    """Return names that really exist under a Skill/workflow root."""
    if not root.is_dir():
        return ()
    return tuple(sorted(d.name for d in root.iterdir() if (d / "SKILL.md").is_file()))


def workflow_catalog(root: Path = WORKFLOWS) -> str:
    """Compact Planner-facing catalog, in deterministic routing order."""
    rows = []
    existing = set(available(root))
    for name in PAGE_WORKFLOWS:
        if name not in existing:
            continue
        text = (root / name / "SKILL.md").read_text(encoding="utf-8", errors="replace")
        desc = _desc(text)
        rows.append(f"- {name}: {desc}" if desc else f"- {name}")
    return "\n".join(rows)


# 通用地板。**默认不注入** —— 它今天不是覆盖修复,是第三份副本。
#
# 量出来的:一页只装载一个 workflow(core/builder.py:286-289 硬拦),所以每条通用规则
# 经 skill 能覆盖到几页,取决于路由。拿 wf2 那轮 21 页的真实路由数:
#
#     占用 45%/85%          只有 build-page 写了        8/21
#     字号地板 16/14/12      只有 plan-typography 写了    0/21  ← 那一轮没路由到它
#     .min0 / .cv-fill      只有 build-page 写了        8/21
#     data-page/data-total  只有 build-interaction 写了  9/21
#     Lec.K / Lec.P 口径     12 份 SKILL.md 一份都没写      0/21
#
# **12 个 workflow 不是 CONTRACT 的超集,是 12 个互相重叠的子集。**
# 但这不构成今天就注入的理由:CONTRACT.md 实测 21/21 页都读,上面每一条它都有。
# 所以现在打开这个开关只会让同一条规则出现第三次 —— 而仓库里记录在案的重复伤害
# (core/planner.py:343-345 的场景构图、core/builder.py:369-374 的哲学与占用闸)
# 全都是「两个来源各说一遍」造成的。
#
# 它存在是为了让「先补 skill 侧覆盖,再砍 CONTRACT」那一步可对照:
# B 臂打开这个开关,确认非 build-page 路由页的占用比/字号不退,才谈得上砍 CONTRACT。
# 照 --philosophy 的先例做成开关而不是直接写死(core/builder.py:376-379:
# 「文件留着不删,随时能把它加回来做对照」)。
FLOORS = """无论装载哪个 workflow,下面这几条对每一页都成立:

- 逻辑画布固定 1600×900,不滚动。只改 `#stage` 内容,保留 `data-page` 和 `data-total`。
- `#stage` 是 flex 列;主内容区 `flex:1` 且 `min-height:0`,需要收缩的 flex/grid 子元素加 `.min0`。
- 画面占用保持在 45%–85%。低于 45% 先查失控的 flex 空隙,再放大有教学意义的关系;
  不得靠加装饰、缩字号、压行高或压间距来凑。
- 字号只用主题 token:正文与成句说明 ≥16px,控件标签、图例、图注和提示 ≥14px,
  纯数字刻度 ≥12px,多行文字行高 ≥1.35。
- 不移除或覆盖 `.min0`、`.cv-fill`、`.no-pan` 的机制;缩放画布内禁止 `position:fixed`。
  Canvas 用 `Deck.fit()` / `Deck.autofit()`,指针坐标用 `Deck.pt()`,动画用 `Deck.loop()`。
- 教学常量、范围和初值来自 `Lec.K`;要推导的结果当场调用 `Lec.P`。
  禁止硬编码预录结果或伪造数据;随机过程必须固定种子。
"""

# tag 名和文件名的对应关系是唯一事实来源；改文件名要跟着改这里。
ANTI_SLOP_FILES = (
    ("anti_ai_slop_copy", "scrub-copy-slop.md"),
    ("anti_ai_slop_visual", "scrub-visual-slop.md"),
)


def anti_slop_block(root: Path = WORKFLOWS) -> str:
    """把两份去 AI 味参考文件整段读出来，各自包一层 XML 标签，拼成一块。

    不做任何裁剪或摘要——摘要过的版本和原文不同步是自找的维护负担，直接注入原文。
    路径给错要报错，不要静默跳过：那样会让人以为注入了其实没有。
    """
    parts = []
    for tag, fname in ANTI_SLOP_FILES:
        f = root / fname
        if not f.is_file():
            raise FileNotFoundError(f"anti_slop_block 需要 {f}，但它不存在")
        text = f.read_text(encoding="utf-8", errors="replace").strip()
        parts.append(f"<{tag}>\n{text}\n</{tag}>")
    return "\n\n".join(parts)


def assigned_workflow(name: str, root: Path = WORKFLOWS,
                      floors: bool = False) -> str:
    """Builder system block for one routed workflow; no catalog and no gate.

    `floors=True` 在前面拼上 FLOORS —— 只给对照臂用,见 FLOORS 上面的账。
    """
    f = root / name / "SKILL.md"
    if not name or not f.is_file():
        raise ValueError(f"未知主工作流 {name!r}; 可用: {', '.join(available(root))}")
    desc = _desc(f.read_text(encoding="utf-8", errors="replace"))
    row = f"- {name}: {desc}" if desc else f"- {name}"
    head = (FLOORS + "\n") if floors else ""
    return (head
            + "本页只装载下面一个 workflow。先用 Skill 工具读取它，再严格执行 SKILL.md "
            "顶部的 Reference routing：所有基础必读项和已选分支项，都要在任何页面修改前"
            "用 `Read` 读取，包括 `Write`、`Edit`、`Patch` 或会改文件的 `Bash`；不要读取"
            "未选分支或无关 reference。scripts 只在 workflow 明确要求时使用。\n\n" + row)


def assigned(names, root: Path = DEFAULT) -> str:
    """只列这一页被指派的那几条 —— builder 侧用这个,不用全 49 条的 `catalog()`。

    量出来的:16 轮里 builder 侧的**自选**合计 33 次,33 次全是 `web-access`,
    而且 33 次里 33 次都已经指派了 `web-media-getter`。**那不是「发现规划漏指的技法」,
    是在找第二条取图的路** —— 也就是本文件下面那段注释里记的那条绕行道
    (绕过取图脚本,丢掉许可与出处记录)。图池修好之后 sol47/sol48/g14/g16 自选全是 0。

    所以全清单在这一侧换来的唯一行为是一条我们不想要的绕行道,而它占每页 9,221 字符
    (34 页一轮 = 313k)。**注意前提:这条只在「规划照旧逐页指派」时成立** ——
    `nn11-low`/`nn11-med` 指派 0、模型自选 33/59 次,那时候清单是唯一入口,不能一起砍。
    """
    names = [n for n in dict.fromkeys(names) if n]
    if not names:
        return ("这一页没有指派技法文档,直接动手。需要什么技法自己写,不要去猜有哪些 skill 可调。")
    rows = []
    for n in names:
        f = root / n / "SKILL.md"
        d = _desc(f.read_text(encoding="utf-8", errors="replace")) if f.is_file() else ""
        rows.append(f"- {n}: {d}" if d else f"- {n}")
    # 措辞跟 catalog() 一致:硬措辞是量出来的,软措辞对应过四轮 0 次调用。
    return ("下面这些技法文档是规划阶段按这一页的真实需要指派的,**不是可选项**。\n"
            "用 Skill 工具把名字原样传进去,读完再动手。\n\n" + "\n".join(rows))


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
