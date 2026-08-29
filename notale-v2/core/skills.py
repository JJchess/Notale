"""skill 清单。

保留 skill 的理由不是 nn-06 的数据 —— 那一轮 841 次调用里 Skill 用了 0 次。
但那是 Opus 5 跑出来的。harness 最终用的是 Sonnet 5 和 gpt-5.6-sol,能力弱一些,
技法指引的边际价值反而更高;拿 Opus 的 0 次去否定弱模型的需要,是取错了样本。

成本不构成理由:49 份的名字加描述合计约 9k 字符,一个 system 块装得下。
正文合计 486k、单份中位 6.4k —— 所以只注入清单,正文按需由 `Skill` 工具取。
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
PROMPTS = Path(__file__).resolve().parent.parent / "prompts"
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
    "build-page",
)
# plan-direction 2026-08-28 迁出:唯一的消费者是 planner 的 `{direction}`,
# 合成 `prompts/direction.md` 之后就不再是 workflow 了。见 DIRECTION_FILE 上面那段。
# get-photo-ref / get-illustration 2026-08-29 迁出:它们的正文是教 agent 用 Bash
# 拼 webmedia.py / gen.py 的命令行 —— 确定性的命令拼装不该靠说明书教。
# 升格成 tools.py 的 ImageSearch / ImageGen 两个工具(schema 校验参数、
# 越界检查覆盖 out 路径),原文归档 attic/。
ALL_WORKFLOWS = PAGE_WORKFLOWS + ("check-page",)
# scrub-copy-slop.md / scrub-visual-slop.md 不是 workflow —— 没有 SKILL.md,不会被
# `Skill` 工具或 available() 发现。之所以不挂靠成 workflow:
# 它们管的是每一页都成立的底线,不该依赖 agent 愿不愿意去装载。
# (旧注释说 Skill 被硬拦到只能读 primary_workflow —— 那道拦 2026-08-28 已删,
# 现在是全清单自选;但"底线不走自选"这个理由照旧成立。)
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
    return ("下面这些 skill 可以通过 `Skill` 工具调用,调用后会把那份技法文档的正文给你。\n"
            "**清单里有对应技法文档的,先读了再动手,不要自己从头摸索一套。**\n"
            "理由和库一样:每页各自重新试一遍,产出不稳定、也慢。\n"
            "清单里没有对应的,就自己写,不必硬凑。\n\n" + body)


def available(root: Path) -> tuple[str, ...]:
    """Return names that really exist under a Skill/workflow root."""
    if not root.is_dir():
        return ()
    return tuple(sorted(d.name for d in root.iterdir() if (d / "SKILL.md").is_file()))


def workflow_catalog(root: Path = WORKFLOWS, paths: bool = False) -> str:
    """Compact catalog, in deterministic routing order.

    `paths=True` 给绝对路径而不是裸名字 —— `Skill` 工具删掉之后建页侧要用这一种。
    清单只给名字、而 SKILL.md 正文里的 reference 却是路径,这个不一致正是
    sonnet-full2-20260828 那 5 次错用的来源(见 core/tools.py 那段账):
    模型照着正文的形状往工具里传了 `widget-core`。两边都给路径就没有这个歧义。
    """
    rows = []
    existing = set(available(root))
    for name in PAGE_WORKFLOWS:
        if name not in existing:
            continue
        f = root / name / "SKILL.md"
        desc = _desc(f.read_text(encoding="utf-8", errors="replace"))
        head = str(f.resolve()) if paths else name
        rows.append(f"- {head}: {desc}" if desc else f"- {head}")
    return "\n".join(rows)


# 字号地板。**唯一一份**,由 `prompts/tech.md` 的 `{font_floor}` 槽位引用 ——
# 抄成第二份就会悄悄分裂(theme.md 的字阶单独调过而契约没跟着改,这种事发生过)。
FONT_FLOOR = ("正文与成句说明 ≥16px，控件标签、图例、图注和提示 ≥14px，"
              "纯数字刻度 ≥12px，多行文字行高 ≥1.35。")


# `FLOORS` 2026-08-28 删除。它和 CONTRACT §5 一直是同一批规则的两份副本,
# 而现在那批规则有了唯一正本:`prompts/tech.md`,由 builder 直接拼进 system 块、
# 覆盖 21/21 页。原来那段账记的正是覆盖问题 —— 通用规则经 workflow 只能到 8/21 或 0/21 页:
#     占用 45%/85%          只有 build-page 写了        8/21
#     字号地板              只有 plan-typography 写了    0/21(那一轮没路由到它)
#     data-page/data-total  只有 build-interaction 写了  9/21
# `--skill-floors` 那条对照臂一并删掉:它的实验早就出了结论
# (runs/floors-ab-experiment.json,reject_no_effect),而结论成立的前提
# ——「CONTRACT 才是唯一覆盖 21/21 页的载体」—— 现在由 tech.md 承担了。


# 视觉方向 2026-08-28 从 `workflows/plan-direction/` 的三份文件合成 `prompts/direction.md`。
#
# 三份文件一直是被 `direction_block()` 按顺序原文拼起来送进同一次调用的,所以文件边界
# 带来的东西全是纯开销:那节 `## Reference routing`(449 字符)让模型先去 `Read` 两份
# **已经内联在它后面**的文件 —— 而同一个块的开场白写的是「已原文内联,不需要再去读任何
# 文件」,自相矛盾;两份 reference 各自的「Read this reference when…」开场同理;
# 再加包三层标签的开销。合成一份之后这些一起消失,plan-direction 也就不再是 workflow
# (它本来也不在 PAGE_WORKFLOWS 里,builder 永远路由不到它)。
DIRECTION_FILE = "direction.md"
DIRECTION_MENUS_FILE = "direction-menus.md"
# 菜单表正文从这一行开始 —— 文件抬头那段中文是给人看的账,不进模型输入。
_MENUS_START = "## Direction families"


def direction_block(root: Path = PROMPTS, menus: bool = False) -> str:
    """把视觉方向拼成一块,给 `prompts/deck.md` 的 `{direction}` 用。

    确定性路径,和 `anti_slop_block()` 同一套:读原文、包一层标签、不摘要、
    路径给错就报错 —— 静默跳过会让人以为注入了其实没有。

    `menus=True` 把两张选项菜单表接回来(`--direction-menus`)。**这个开关是有期限的。**
    它存在的唯一理由是让「那两张表留还是删」变成一次 flag 对照,而不是 git revert:
    上一轮删掉它们的那一臂因为两个 planner 并发写同一个 run 目录而作废,而白得的那组
    同条件重复采样恰好证明 `check_palette` 的判据在 n=1 下读不出效应
    (家族在「暗底科技」和「其他」之间跳,语义色明度极差在 5pp 和 57pp 之间跳)。
    实验出结论之后 —— 留就把两张表并回 `direction.md`、删就按
    `attic/plan-typography/README.md` 的先例挪进 `attic/` 并写清为什么 ——
    这个参数、`--direction-menus` 和 `prompts/direction-menus.md` 要一起删掉,
    不许留成永久配置项。见 `runs/direction-trim-experiment.json`。
    """
    parts = ["下面是视觉方向的作业方法,已**原文内联**,不需要再去读任何文件。",
             "它规定的是这套讲义的视觉世界:配色、材质、几何、字体角色、标志性元素、"
             "媒体处理和动效基调。按它做,不要另起一套。"]
    rels = [DIRECTION_FILE] + ([DIRECTION_MENUS_FILE] if menus else [])
    for rel in rels:
        f = root / rel
        if not f.is_file():
            raise FileNotFoundError(f"direction_block 需要 {f}，但它不存在")
        text = f.read_text(encoding="utf-8")
        if rel == DIRECTION_MENUS_FILE:
            if _MENUS_START not in text:
                raise ValueError(f"{f} 里没有 {_MENUS_START!r} —— 格式变了就不要静默注入抬头那段账")
            text = text.split(_MENUS_START, 1)[1]
            text = _MENUS_START + text
        parts.append(f"<direction src=\"{rel}\">\n" + text.strip() + "\n</direction>")
    return "\n\n".join(parts)


ANTI_SLOP_FILES = (
    ("anti_ai_slop_copy", "scrub-copy-slop.md"),
    ("anti_ai_slop_visual", "scrub-visual-slop.md"),
)
# **`scrub-theme-slop.md` 故意不在上面那个元组里。** 它管的是整套视觉系统的配色决定,
# 而那个决定只发生一次 —— 在写 `theme.css` 那一步。塞进 builder 的 system 块等于
# 让 21 页 × 每一步都重发一份它们无权执行的规则:页面只能消费主题给的 token,
# 改不了调色板。按决定发生在哪一层切,每份只加载一次。
THEME_SLOP_FILE = ("anti_ai_slop_theme", "scrub-theme-slop.md")


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


def theme_slop_block(root: Path = WORKFLOWS) -> str:
    """配色禁用清单,只给写 `theme.css` 那一步。

    和 `anti_slop_block()` 同一条确定性路径:读原文、包 XML 标签、不摘要、
    路径给错就报错。**不要把它加进 `ANTI_SLOP_FILES`** —— 见那里的注释。
    """
    tag, fname = THEME_SLOP_FILE
    f = root / fname
    if not f.is_file():
        raise FileNotFoundError(f"theme_slop_block 需要 {f}，但它不存在")
    return f"<{tag}>\n{f.read_text(encoding='utf-8', errors='replace').strip()}\n</{tag}>"


def assigned_workflow(name: str, root: Path = WORKFLOWS) -> str:
    """Builder system block for one routed workflow; no catalog and no gate."""
    f = root / name / "SKILL.md"
    if not name or not f.is_file():
        raise ValueError(f"未知主工作流 {name!r}; 可用: {', '.join(available(root))}")
    desc = _desc(f.read_text(encoding="utf-8", errors="replace"))
    row = f"- {name}: {desc}" if desc else f"- {name}"
    return ("本页只装载下面一个 workflow。先用 `Skill` 工具读取它，再严格执行 SKILL.md "
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
            "用 `Skill` 工具把名字原样传进去,读完再动手。\n\n" + "\n".join(rows))


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


def inline_paths(text: str, skill_dir: Path) -> str:
    """把 SKILL.md 里的路径占位符换成真实绝对路径。

    从 `load()` 里抽出来,是因为 `Read` 到 SKILL.md 时也要做同一件事 ——
    它管的是「文档里写的命令能不能真的跑」,和模型用哪个工具读无关。
    两条路都要走它,少一条就是那条路上静默退化成「命令指向不存在的位置」。
    """
    d = skill_dir.resolve()
    t = text.replace("<skill-dir>", str(d))
    t = t.replace("(in this dir)", f"(在 {d}/ 下)").replace("（in this dir）", f"(在 {d}/ 下)")
    # 文档里裸写的脚本名(webmedia.py / gen.py / freesound-fetch.py …)也补成绝对路径,
    # 否则「`webmedia.py "rocket launch"`」这种示例照抄下来还是跑不了。
    for script in sorted(d.rglob("*.py")):
        bare = script.name
        if bare in t:
            t = re.sub(rf"(?<![\w/.-]){re.escape(bare)}", str(script), t)
    return (t + f"\n\n---\n\n**路径已由 harness 解析:这份文档所在目录是 `{d}`,"
            f"上面出现的脚本路径都是可以直接跑的绝对路径。**\n")


def _wrap_reference(f: Path) -> str:
    """reference 一次给全文,带 EOF 标记 —— 和 `tools._dispatch` 的 Read 分支同一形状。

    两条路给出来的东西必须长得一样,否则模型换个工具读同一份文件会看到不同的边界,
    又得自己判断「读全了没有」。
    """
    text = f.read_text(encoding="utf-8", errors="replace")
    n = text.count("\n") + 1
    return (f"（工作流 reference 全文开始：{f.name}，共 {n} 行）\n" + text
            + f"\n（工作流 reference 全文结束：{f.name} · EOF）")


def load(name: str, root: Path = DEFAULT) -> str:
    """按名字取一份技法文档的正文。

    **解析顺序是照模型实际传进来的形状定的,不是照我们希望它传的形状。**
    实测 sonnet-full2-20260828 那轮 15 次调用里有 5 次传的是 reference 的名字
    (`widget-core` ×2、`pattern-routing` ×2、`relationship-compositions` ×1)——
    因为它刚在 SKILL.md 正文里读到 `[widget-core.md](references/widget-core.md)`,
    照着那个形状传是完全合理的推断。原来的实现只认第 1 种,于是这 5 次全部撞死、
    page-07 就此放弃、一份 reference 都没读。

    所以这里认四种,依次尝试:
      1. workflow 名          `build-page`
      2. 相对路径             `build-interaction/references/widget-core.md`
      3. workflow 名/SKILL.md `build-page/SKILL.md`
      4. 裸 reference 名      `widget-core` / `widget-core.md`(全局唯一才认)
    第 4 种撞名时不猜,把候选列出来让它自己选 —— 猜错会静默给错文档,比报错更坏。
    """
    raw = (name or "").strip().strip("/")
    if not raw:
        return "Skill 需要一个名字。可用的 workflow: " + ", ".join(available(root))

    # 1 / 3:workflow 名,或 workflow 名/SKILL.md
    head = raw[:-len("/SKILL.md")] if raw.endswith("/SKILL.md") else raw
    f = root / head / "SKILL.md"
    if f.is_file():
        return inline_paths(f.read_text(encoding="utf-8", errors="replace"), root / head)

    # 2:相对路径直指 reference
    p = (root / raw)
    if p.is_file() and p.suffix.lower() == ".md":
        try:
            rel = p.resolve().relative_to(root.resolve())
        except (OSError, ValueError):
            rel = None
        if rel and len(rel.parts) == 3 and rel.parts[1] == "references":
            return _wrap_reference(p)

    # 4:裸 reference 名 —— 全局唯一才认,撞名列出候选
    stem = raw[:-3] if raw.lower().endswith(".md") else raw
    hits = [q for q in sorted(root.glob(f"*/references/{stem}.md")) if q.is_file()]
    if len(hits) == 1:
        return _wrap_reference(hits[0])
    if len(hits) > 1:
        opts = ", ".join(f"{q.parent.parent.name}/references/{q.name}" for q in hits)
        return (f"{stem!r} 在多个 workflow 下都有,不替你猜。指定是哪一份: {opts}")

    avail = ", ".join(available(root))
    return (f"没有名为 {raw!r} 的技法文档。\n"
            f"workflow 传名字即可: {avail}\n"
            f"reference 传 `<workflow>/references/<文件名>.md`,或它的裸名字。")
