"""builder —— 每页一个自由循环,并发跑。

Harness 不把创作过程做成状态机,也不补催、不重启。模型不再要求工具就结束；
提示词要求最多 11 次响应并在 4–7 次内完成，但 harness 不在第 11 次截断，
而是让模型自然结束并事后记录是否超出目标。最终产物与一次独立审计分别记录。

    python3 -m core.builder --label orbit-01 [--only page-01] [--concurrency 20]
"""

from __future__ import annotations

import argparse
import html
import json
import re
import time
import uuid
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from . import code_runtime, skills, tools
from . import llm
from .llm import ROOT, config, respond, text_of
from .trace import Writer

RESPONSE_TARGET = 11  # 行为目标与事后指标，不是运行时熔断
MAX_SECONDS = 3600


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


IDENTITY = """你负责这一套里的一页画面。你只负责当前页面。

技术契约、主题接口、章节提纲、本章页表和本页型的 SKILL.md 都在提示里,不必为了确认再读
源文件。严格遵守 SKILL.md 的第一轮加载规则,按 brief 完成目标页面。

你最多有 11 次响应（包含最后一次不调用工具的结束响应），通常应在 4–7 次内完成。
同一响应中的多个工具调用会按列出顺序执行：首次创作可先 Write、再 Check；修正时把所有
已确认问题合并为一次 Patch。代码页可在同一响应写完多个 lesson 文件,再 Check。
首次 Write 前先核对确定性数据、公式和预期状态的一致性,并按 SKILL.md 与随后返回的
<sample_use> 完成 Main 的选择与模式迁移;不要把能事先算清的逻辑矛盾留到截图后逐项修补。

一次 Check 用 after 覆盖主要主动状态,决定性终态放在最后一段。Check 返回的是测量,不是
质量批准;按随报告返回的 <check_use> 检查截图、内容和行为。发现具体违约时,把全部问题
合并为一次 Patch,再做一次回归 Check。

当 <check_use> 要求的证据完整且没有具体违约时,下一次响应直接结束。不得为了填满画面
反复调整字号、间距或加装饰,也不得为了“再优化一点”重读目标文件、继续 Look、Bash 或重复 Check。

不写额外说明文档、构建日志或旁路测试(`lesson/tests.py` 属于学习内容,不在此列)。
做完直接结束,不要问问题。"""

# 实验开关 --visual-focus:与 planner 的同名开关配对。页表每页多一行「视觉焦点」,
# 这段告诉 builder 怎么用它。默认不注入,基线 system 一字不变。
VISUAL_FOCUS_BLOCK = """<chapter_context> 里每页的「视觉焦点」一行是 planner 定下的主证据场,本页的构图从它出发:
- 第一眼必须落在它上面;它占主区,标题、注释、控件围着它排,不得让它缩小成配图。
- 不得替换成别的图,不得拆散;它显示的那个关系必须在初态就读得出来,不靠 hover 或播放。
- 选 Main sample 时按它的证据几何选(矩阵、分布、机构、地图……),不按题目名。
- Check 之后先对着截图回答三件事:它在不在、是不是第一眼落点、那个关系读不读得出;都成立再看别的。
没有这一行的页(代码页)照常处理。"""


# 实验开关 --notes:cap = 只给画面字数硬数;notes = 硬数 + 讲稿区出口。默认 off,基线 system 一字不变。
# 2026-09-05 量的:生成页每页可见字符中位 550–750,金样本中位 206;用户的直觉是「字太密、一堆卡片」。
# 假设:模型把所有想说的都写上画面,是因为没有别处可写。cap 臂回答「光给数够不够」,notes 臂回答「出口有没有额外作用」。
TEXT_CAP_BLOCK = """<text_budget>
画面上的可见文字总量不超过 200 个字符(标题、正文、标签、数值都算;Check 报告会给出实测字数)。
超了就删:一页只留读者必须看见的那一句判断、必要的标签和数值;解释、推导、背景不上画面。
不得用缩小字号、压行高、折叠或切换来"藏"字。
</text_budget>"""
NOTES_BLOCK = TEXT_CAP_BLOCK + """

<speaker_notes>
不上画面但要讲的话,写进 `<aside class="notes" hidden>…</aside>`,放在 `</body>` 之前 ——
这是 `#stage` 之外唯一允许写的东西。讲稿按讲的顺序分段,写老师会对学生说的话(解释、推导、例子、过渡),
不写页面说明;Check 报告会同时给画面字数和讲稿字数。
</speaker_notes>"""
# only = 只给讲稿出口,不提字数 —— 单独检验「出口本身能不能疏导」这条假设(C 臂把它和硬数混在一起了)。
NOTES_ONLY_BLOCK = """<speaker_notes>
不上画面但要讲的话,写进 `<aside class="notes" hidden>…</aside>`,放在 `</body>` 之前 ——
这是 `#stage` 之外唯一允许写的东西。讲稿按讲的顺序分段,写老师会对学生说的话(解释、推导、例子、过渡),
不写页面说明;Check 报告会同时给画面字数和讲稿字数。
</speaker_notes>"""
NOTES_BLOCKS = {"off": "", "cap": TEXT_CAP_BLOCK, "notes": NOTES_BLOCK, "only": NOTES_ONLY_BLOCK}

# 实验开关 --frame-cap:对准「每个区块画一圈描边」这个动作。2026-09-06 同题重跑后 judge 判 AI 的前三条线索
# 是边框/卡片/面板(17/15/14 次),而删词汇只把版块从 11 压到 8、没动描边。硬数 + Check 报数,不再靠词。
FRAME_CAP_BLOCK = """<frame_budget>
带描边或底色的区块最多 1 个,而且只能是主体本身;其余内容靠留白、对齐和共享基线分组,不加框、不铺底色。
对照(A 与 B)放在同一条基线或同一坐标系上并排表达,不用并排的框。Check 报告里「区块 N 个」就是这个数,超过 1 就改。
</frame_budget>"""


LABEL_WORKFLOWS = {
    "标题页": "build-cover",
    "内容页": "build-page",
    "交互页": "build-interaction",
    "代码页": "build-code",
}
_SPEC_HEADING = re.compile(
    r"^#\s+(page-(\d+))\s+\[(标题页|内容页|交互页|代码页)\]\s*$", re.M
)


def _tag_of(c) -> str:
    """一次工具调用的关键参数,用于事后审计。只取能标识「做了什么」的那一个。"""
    try:
        a = json.loads(c.arguments or "{}")
    except Exception:
        return ""
    if c.name == "CodeScaffold":
        return "fixed-python-workbench"
    if c.name == "Bash":
        return str(a.get("command", ""))[:120]
    if c.name == "Check":
        n = len(a.get("after") or [])
        return str(a.get("page", "")) + (f" +after×{n}" if n else "") + (
            " +shot" if a.get("shot") else "")
    if c.name == "Patch":
        return f"{a.get('page','')} ×{len(a.get('edits') or [])}"
    if c.name == "Look":
        return f"{a.get('page','')} @{a.get('box')}"
    return str(a.get("file_path", "")).split("/")[-1]


def _replay(item: dict) -> dict:
    """把一个 output item 变成可以回传的形态。

    `model_dump()` 会带上 `status` 这类只出不进的字段,原样回传会被
    400 `Unknown parameter: input[1].status` 打回来。递归剥掉,别的原样保留 ——
    `call_id` 和 reasoning 的 `id` 都是回传必需的,不能一起清掉。
    """
    if isinstance(item, dict):
        return {k: _replay(v) for k, v in item.items() if k != "status" and v is not None}
    if isinstance(item, list):
        return [_replay(x) for x in item]
    return item


@dataclass
class Page:
    pid: str
    prompt: str
    calls: int = 0
    steps: list[str] = None
    why: str = ""
    seconds: float = 0.0

    images: int = 0      # 这一页进上下文的图片张数(Opus 那条线是每页 6.0 张)
    evicted: int = 0     # 被挤出上下文的图片张数

    # token 账。2026-08-26 之前这三个数一个都没记,于是「前缀缓存到底生效没有」
    # 只能靠离线探针 —— 而实测这条路由自动缓存能到 99.9%,一次淘汰却会把它打回 0。
    # 没有这三个数就看不见那件事,所以先记再谈优化。
    tok_in: int = 0      # 累计输入 token(每步都含被重发的全部历史)
    tok_cached: int = 0  # 其中命中前缀缓存的部分(读,便宜)
    tok_write: int = 0   # 其中写进缓存的部分(写,通常带溢价 —— 和读不是一个价)
    tok_out: int = 0     # 累计输出 token
    tok_max: int = 0     # 单步输入峰值 —— 判 CONTEXT_SOFT 用
    artifact_present: bool = False
    audit: dict | None = None
    cache_seen: bool = False   # 这条路由到底报不报 cached;不报和没命中要分得开
    label: str = ""
    workflow: str = ""
    spec_text: str = ""
    total: int = 0

    def __post_init__(self):
        self.steps = []
        self.steps_arg = {}
        self.reference_reads = []
        self.termination = ""


def route_page(root: Path, page: Page) -> Page:
    """Read the planner-owned pNN heading and assign exactly one production workflow."""
    path = root / "pages" / "plan" / f"{page.pid.replace('page-', 'p')}.md"
    if not path.is_file():
        raise FileNotFoundError(f"cannot route {page.pid}: missing planner spec {path}")
    text = path.read_text(encoding="utf-8", errors="replace")
    matches = list(_SPEC_HEADING.finditer(text))
    if len(matches) != 1:
        raise ValueError(
            f"cannot route {page.pid}: expected one "
            "'# page-NN [标题页|内容页|交互页|代码页]' heading"
        )
    heading_pid, digits, label = matches[0].groups()
    if heading_pid != page.pid or int(digits) != int(page.pid.split("-")[1]):
        raise ValueError(f"planner spec id {heading_pid!r} does not match {page.pid!r}")
    page.label = label
    page.workflow = LABEL_WORKFLOWS[label]
    page.spec_text = text
    return page


def _lesson_title(page: Page) -> str:
    """Derive a concise scaffold title from the planner prose without another model choice."""
    for raw in page.spec_text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith("<"):
            continue
        line = re.sub(r"^[\-*]\s*", "", line)
        return line[:80]
    return page.pid


def page_from_brief(raw: dict) -> Page:
    """A brief contains only the target id and the Planner's compact prose."""
    return Page(raw["description"].replace("Build ", ""), raw["prompt"])


KEEP_IMAGES = 2  # 真触发淘汰时,hist 里留几张图

# 淘汰的触发线:上一次调用的真实输入 token 超过它才清图,否则**一个字节都不动历史**。
#
# 2026-08-26 改的。原来是「图片数 > KEEP_IMAGES 就淘汰」,于是淘汰频率≈截图张数
# (wf2 那轮 143 张图、102 次挤出)。而 evict_images 是原地改写 hist[i],
# 实测「未改写 100% 命中 → 淘汰当次 0% → 下一次 99.9%」——
# **每次淘汰 = 一次全价重算整段前缀**,按 trace 里的真实 input_tokens 折算,
# 图多的轮次有 28–34% 的输入 token 是这么烧掉的。
#
# 换成按上下文大小判,理由是三条实测:
#   · 上下文窗口 ≥375,011 token(超额请求回 context_length_exceeded,逐级试到 375k 仍通过);
#     而实测输入峰值只有 36k–70k,不到 19%。
#   · evict_images 的 docstring 里那句「11/16 个 subagent 上下文撑爆」写的是
#     **lab 那条线** —— 那条线有自动压缩、是另一个 harness。这条路由上从没发生过。
#   · 缓存命中的 input token 按折扣计费。留着旧图 = 每轮多花「几千 token × 折扣价」;
#     淘汰 = 下一次全价重算约两万 token。**自动缓存生效时,留着比扔掉便宜。**
#
# 150k 是峰值的两倍多,仍不到已验证下限的 40%。正常轮次一次都不触发。
# 判据晚一步(先调用才知道大小)无害:150k → 155k 离 375k 仍很远。
CONTEXT_SOFT = 150_000


def _is_image_msg(m) -> bool:
    return (isinstance(m, dict) and m.get("role") == "user"
            and isinstance(m.get("content"), list)
            and any(isinstance(b, dict) and b.get("type") == "input_image"
                    for b in m["content"]))


def evict_images(hist: list, tok_in: int) -> int:
    """输入超过 `CONTEXT_SOFT` 时,`hist` 里只留最近 KEEP_IMAGES 张图,更早的换成一句话。

    **触发条件 2026-08-26 从「图片数」改成「真实输入 token」** —— 理由见 CONTEXT_SOFT
    上面那段账。下面这段是原来的记录,它解释的是**为什么要有这个机制**,仍然成立;
    但「什么时候该动手」已经不再由图片数决定。

    **这不是省钱,是防炸,而且是量出来的**(原始记录在 zzz/selfcheck.py 的 docstring 里):
    lab 那条线一轮 171 张截图约 324k token,而图片随每一步重发、**永久占上下文** ——
    结果 11/16 个 subagent 上下文撑爆被自动压缩,整轮墙钟拉长 1.9 倍。
    我们这条线没有自动压缩,撑爆就是撞 max_output_tokens 或者直接 400。

    换成一句话而不是整条删掉,理由只剩一条:**告诉模型那张图被拿走了**,
    否则它会凭记忆改页面。原先还写着「删元素会让 parentUuid 那条链和步数对不上」——
    2026-08-26 查证不成立:`parentUuid` 在 trace.py 里按**轮次**串(Writer.prev),
    与 `hist` 下标无关;`page.calls` / `page.steps` 也都不由 `hist` 长度推导。
    不过这不构成改写法的理由 —— **删元素和改写元素一样会断前缀缓存**,
    所以保持原样,只把触发条件挪到 CONTEXT_SOFT 上。
    确定的事 harness 做 —— 这属于确定的事。
    """
    if tok_in <= CONTEXT_SOFT:
        # **没超线就一个字节都不碰。** 动了历史(改写或删除都算)前缀缓存就断,
        # 而这条路由的自动缓存实测能到 99.9%。
        return 0
    idx = [i for i, m in enumerate(hist) if _is_image_msg(m)]
    n = 0
    for i in idx[:-KEEP_IMAGES] if len(idx) > KEEP_IMAGES else []:
        hist[i] = {"role": "user", "content": [{"type": "input_text", "text":
            "（这里原来有一张图，为了不撑爆上下文已经拿掉了。要再看就重新 Check/Look 一次。）"}]}
        n += 1
    return n


# Shared material stays byte-identical across pages for prefix caching. Per-page
# chapter context stays in the first user message.
PRELOAD_TAGS = (("chassis", "CHASSIS.md"), ("theme_css", "theme.css"),
                ("deck_outline", "pages.md"))

# 技术契约 2026-08-28 从「每轮让模型写一份 CONTRACT.md」改成**仓库常量**
# `prompts/tech.md`,由 builder 填几个槽位。
#
# 它本来就几乎全是跳轮不变的东西(画布尺寸、flex 规则、字号地板、库表、禁 CDN),
# 每轮重新生成一遍既花一次调用,又让 21 页共享的那段前缀按轮次变化、吃不到跨轮缓存。
# 而按轮次真正会变的两节(§1 全课主线、§7 文字风格口径)交给每页自己的内容承载。
#
# **同时替掉了 `skills.FLOORS`。** 那两份是同一批规则的两份副本,而 FLOORS 默认不注入 ——
# `runs/floors-ab-experiment.json` 的结论是 `reject_no_effect`,并写着「不要靠 system 块
# 前言去替代 CONTRACT.md」。注意那次搬的是**摘要式前言**、CONTRACT 原文仍在(所以只是
# 第三份副本,自然无效应);这次是把契约原文本身放进 system 块,不是同一件事。
TECH_SLOTS = dict(canvas_w=1600, canvas_h=900)


def _wrap(tag: str, path: Path) -> str:
    """读一份文件,包一层标签。和 skills.anti_slop_block 同一条确定性路径:
    读原文、不摘要、路径给错就报错 —— 静默跳过会让人以为预置了其实没有。"""
    if not path.is_file():
        raise FileNotFoundError(f"预置 <{tag}> 需要 {path},但它不存在")
    return f"<{tag}>\n{path.read_text(encoding='utf-8', errors='replace').strip()}\n</{tag}>"


_LIBS_INDEX = "## 按「要做的事」查"


def _libs_index(root: Path) -> str:
    """Inject only the dependency routing table, not every library's API details."""
    f = root / "pages" / "assets" / "lib" / "LIBS.md"
    if not f.is_file():
        raise FileNotFoundError(f"dependency index is missing: {f}")
    text = f.read_text(encoding="utf-8")
    if _LIBS_INDEX not in text:
        raise ValueError(f"dependency index anchor {_LIBS_INDEX!r} is missing: {f}")
    body = text.split(_LIBS_INDEX, 1)[1]
    body = body.split("\n## ", 1)[0]
    return (body.strip()
            + "\n\n用法细节、版本和适用边界在 `assets/lib/LIBS.md`,需要时再读。")


def tech_block(root: Path, n_pages: int, prompts: Path = None) -> str:
    """静态技术契约,填上这一轮的页数和库路由表。见 TECH_SLOTS 上面那段账。"""
    tpl = ((prompts or ROOT / "prompts") / "tech.md").read_text(encoding="utf-8")
    return "<tech>\n" + llm.fill(
        tpl, _where="tech.md", n_pages=n_pages, font_floor=skills.FONT_FLOOR,
        libs=_libs_index(root), **TECH_SLOTS).strip() + "\n</tech>"


def _page_entries(text: str) -> list[tuple[str, str, str]]:
    """Parse planner's compact page blocks into ``(pid, label, body)`` rows."""
    hits = list(_SPEC_HEADING.finditer(text))
    rows = []
    for i, match in enumerate(hits):
        pid, _, label = match.groups()
        end = hits[i + 1].start() if i + 1 < len(hits) else len(text)
        rows.append((pid, label, text[match.end():end].strip()))
    return rows


def _xml_page(pid: str, label: str, body: str, current: bool = False) -> str:
    attrs = f'id="{html.escape(pid, quote=True)}" label="{html.escape(label, quote=True)}"'
    if current:
        attrs += ' current="true"'
    return f"  <page {attrs}>{html.escape(body, quote=False)}</page>"


def _deck_outline(path: Path) -> str:
    """Return only title-page boundaries from ``pages.md`` as compact XML.

    The image-pool preface and content-page details do not belong in the shared system
    prefix. Title pages are enough to show the whole-deck arc; current-chapter details
    arrive separately in ``<chapter_context>``.
    """
    rows = _page_entries(path.read_text(encoding="utf-8", errors="replace"))
    titles = [_xml_page(pid, label, body) for pid, label, body in rows if label == "标题页"]
    return "<deck_outline>\n" + "\n".join(titles) + "\n</deck_outline>"


def chapter_preloads(root: Path, n_pages: int) -> dict[str, str]:
    """Build one XML chapter block per page from the Planner's ``pNN.md`` files.

    Every ``[标题页]`` starts a chapter group. The opening cover therefore travels with
    the first chapter, while a final closing title may form a one-page group. Each
    result is appended to that page's first user message.
    """
    rows: list[tuple[str, str, str, Path]] = []
    for nn in range(1, n_pages + 1):
        pid = f"page-{nn:02d}"
        path = root / "pages" / "plan" / f"p{nn:02d}.md"
        if not path.is_file():
            raise FileNotFoundError(f"预置 <chapter_context> 需要 {path},但它不存在")
        entries = _page_entries(path.read_text(encoding="utf-8", errors="replace"))
        if len(entries) != 1 or entries[0][0] != pid:
            raise ValueError(f"{path} 必须且只能包含 {pid} 的一份规格")
        entry_pid, label, body = entries[0]
        rows.append((entry_pid, label, body, path))

    groups: list[list[tuple[str, str, str, Path]]] = []
    group: list[tuple[str, str, str, Path]] = []
    for row in rows:
        if row[1] == "标题页" and group:
            groups.append(group)
            group = []
        group.append(row)
    if group:
        groups.append(group)

    out: dict[str, str] = {}
    for chapter in groups:
        for current_pid, _, _, _ in chapter:
            body = "\n".join(
                _xml_page(pid, label, prose, pid == current_pid)
                for pid, label, prose, _ in chapter
            )
            out[current_pid] = (
                f'<chapter_context current="{current_pid}">\n{body}\n</chapter_context>'
            )
    return out


def _theme_interface(path: Path) -> str:
    """Return the validated theme interface rather than the full CSS implementation."""
    text = path.read_text(encoding="utf-8", errors="replace")
    end = "==== /INTERFACE ==== */"
    if end not in text:
        raise ValueError(f"theme interface delimiter is missing: {path}")
    return text.split(end, 1)[0] + end


def shared_preload(root: Path, n_pages: int, prompts: Path = None) -> str:
    """Return the byte-identical shared Builder prefix for every page."""
    paths = {"CHASSIS.md": root / "pages" / "assets" / "CHASSIS.md",
             "theme.css": root / "pages" / "assets" / "theme.css",
             "pages.md": root / "pages" / "plan" / "pages.md"}
    text = "\n\n".join(
        (f"<{tag}>\n{_theme_interface(paths[name]).strip()}\n</{tag}>"
         if name == "theme.css" else
         _deck_outline(paths[name])
         if name == "pages.md" else _wrap(tag, paths[name]))
        for tag, name in PRELOAD_TAGS)
    return text + "\n\n" + tech_block(root, n_pages, prompts)


def environment_context(pages_dir: Path, page: Page, resource_root: Path) -> str:
    """Describe the real working directory in the same user message as the brief."""
    target = pages_dir / f"{page.pid}.html"
    return (
        "<environment_context>\n"
        f"  <cwd>{html.escape(str(pages_dir.resolve()))}</cwd>\n"
        f"  <target>{html.escape(str(target.resolve()))}</target>\n"
        "  <target_state>absent</target_state>\n"
        f"  <read_only_skill>{html.escape(str(resource_root.resolve()))}</read_only_skill>\n"
        "</environment_context>"
    )


_FATAL_PREFIX = re.compile(
    r"^(?:失败:|拒绝[：:]|Traceback|TimeoutExpired:|[A-Za-z]+Error:)"
)
_FATAL_CHECK = re.compile(
    r"✗.*(?:JS 报错|console\.error|资源加载失败|无法渲染|代码工作台自检失败)"
)


def _audit_lines(report: str) -> tuple[list[str], list[str]]:
    fatal, visual = [], []
    for raw in report.splitlines():
        line = raw.strip()
        if not line:
            continue
        if _FATAL_PREFIX.search(line) or _FATAL_CHECK.search(line):
            fatal.append(line)
        elif line.startswith("✗"):
            visual.append(line)
    return fatal, visual


def audit_delivery(
    pages_dir: Path,
    page: Page,
    resource_root: Path,
) -> dict:
    """Audit once after the agent stops; never feed the result back into its loop."""
    target = pages_dir / f"{page.pid}.html"
    if not target.is_file() or target.stat().st_size == 0:
        return {
            "fatal_errors": [f"target missing: {target}"],
            "visual_warnings": [],
            "code_result": None,
        }

    checked = tools.run(
        "Check",
        {"page": target.name, "shot": False},
        pages_dir,
        resource_root,
        page.pid,
    )
    report = checked.text if isinstance(checked, tools.Out) else str(checked)
    fatal, visual = _audit_lines(report)
    code_result = None
    if page.workflow == "build-code":
        code_result, _ = code_runtime.run_browser_check(pages_dir, page.pid, False)
        code_fatal, code_visual = _audit_lines(code_result)
        fatal.extend(code_fatal)
        visual.extend(code_visual)
    return {
        "fatal_errors": fatal,
        "visual_warnings": visual,
        "code_result": code_result,
    }


def build_one(
    page: Page,
    pages_dir: Path,
    trace: Path,
    workflow_root: Path,
    instructions: str,
    effort: str,
    vision_input: bool = True,
    runtime: llm.ModelRuntime | None = None,
) -> Page:
    """Run one free-form agent loop to natural stop and audit separately."""
    log = Writer(trace, str(uuid.uuid4()))
    resource_root = (
        workflow_root / page.workflow if page.workflow else workflow_root
    ).resolve()
    hist: list = [{"role": "user", "content": page.prompt}]

    specs = tools.specs()
    if not vision_input:
        specs = [row for row in specs if row["name"] != "Look"]
    if page.workflow == "build-code":
        allowed = {"Read", "Write", "Edit", "Check"}
        if vision_input:
            allowed.add("Look")
        specs = [code_runtime.tool_schema()] + [
            row for row in specs if row["name"] in allowed
        ]
    else:
        # Patch covers both one and many local page edits. Keeping Edit as a
        # second equivalent choice induced low-effort agents to repair one
        # literal per response; normal pages therefore expose only Patch.
        specs = [row for row in specs if row["name"] != "Edit"]

    t0 = time.time()
    while True:
        if time.time() - t0 > MAX_SECONDS:
            page.why = f"超过单页时限 {MAX_SECONDS}s"
            page.termination = "max_seconds"
            break

        started = _now()
        response = (
            runtime.respond(instructions, hist, specs, tag=page.pid)
            if runtime
            else respond(instructions, hist, specs, effort, tag=page.pid)
        )
        page.calls += 1
        tin, tout, cached = llm.usage_of(response)
        page.tok_in += tin
        page.tok_out += tout
        page.tok_write += llm.cache_write_of(response)
        page.tok_max = max(page.tok_max, tin)
        if cached is not None:
            page.cache_seen = True
            page.tok_cached += cached

        calls = [
            item for item in response.output
            if getattr(item, "type", "") == "function_call"
        ]
        log.add(
            [{"type": "text", "text": page.prompt if page.calls == 1 else "(tool results)"}],
            text_of(response),
            {
                "input_tokens": tin,
                "output_tokens": tout,
                "cache_read_input_tokens": cached or 0,
                "cache_creation_input_tokens": llm.cache_write_of(response),
            },
            getattr(response, "id", None) or f"req_{uuid.uuid4().hex[:16]}",
            started,
            _now(),
            {
                "page": page.pid,
                "tools": [{"name": call.name, "arg": _tag_of(call)} for call in calls],
            },
        )

        if not calls:
            page.why = text_of(response).strip()[:200]
            page.termination = "no_tool_use"
            break

        print(
            f"      {page.pid} 步{page.calls:>3}  "
            f"{' '.join(call.name for call in calls)[:52]}",
            flush=True,
        )
        replay = (
            runtime.replay(response)
            if runtime
            else [item.model_dump() for item in response.output]
        )
        hist += [_replay(item) for item in replay]
        pending_images: list[tuple[str, str]] = []

        for call in calls:
            try:
                args = json.loads(call.arguments or "{}")
            except json.JSONDecodeError as exc:
                hist.append(
                    {
                        "type": "function_call_output",
                        "call_id": call.call_id,
                        "output": (
                            f"{call.name} arguments 不是合法 JSON：{exc}。"
                            "请缩短内容并重发同一调用。"
                        ),
                    }
                )
                page.steps.append(f"{call.name}!badjson")
                continue

            page.steps.append(
                call.name
                if call.name != "Bash"
                else (
                    "SELFCHECK"
                    if "selfcheck" in str(args.get("command", ""))
                    else "Bash"
                )
            )
            page.steps_arg.setdefault(call.name, []).append(_tag_of(call))

            if call.name == "CodeScaffold":
                try:
                    made = code_runtime.scaffold(
                        pages_dir,
                        page.pid,
                        _lesson_title(page),
                        page.total,
                    )
                    result: str | tools.Out = json.dumps(
                        made, ensure_ascii=False, indent=2
                    )
                except (OSError, RuntimeError, ValueError) as exc:
                    result = f"CodeScaffold 失败：{type(exc).__name__}: {exc}"
            else:
                actual_args = dict(args)
                if call.name == "Check":
                    if vision_input:
                        actual_args.setdefault("shot", True)
                    else:
                        actual_args["shot"] = False

                denied = None
                if page.workflow == "build-code":
                    denied = code_runtime.tool_guard(
                        call.name,
                        actual_args,
                        pages_dir,
                        page.pid,
                        resource_root,
                    )
                if denied:
                    result = "拒绝：" + denied
                else:
                    result = tools.run(
                        call.name,
                        actual_args,
                        pages_dir,
                        resource_root,
                        page.pid,
                    )
                    if page.workflow == "build-code" and call.name == "Check":
                        base_text, base_images = (
                            (result.text, list(result.images))
                            if isinstance(result, tools.Out)
                            else (str(result), [])
                        )
                        extra, shots = code_runtime.run_browser_check(
                            pages_dir,
                            page.pid,
                            bool(actual_args.get("shot")) and vision_input,
                        )
                        for shot in shots[: max(0, tools.MAX_IMAGES - len(base_images))]:
                            base_images.extend(tools._image(shot).images)
                        result = tools.Out(base_text + "\n\n" + extra, base_images)

            if call.name == "Read" and args.get("file_path"):
                path = Path(str(args["file_path"]))
                path = path if path.is_absolute() else pages_dir / path
                try:
                    rel = path.resolve().relative_to(resource_root)
                    if (
                        rel.parts[:1] == ("references",)
                        or rel.parts[:2] == ("samples", "bundles")
                    ):
                        page.reference_reads.append(rel.as_posix())
                except (OSError, ValueError):
                    pass

            output, images = (
                (result.text, result.images)
                if isinstance(result, tools.Out)
                else (str(result), [])
            )
            if call.name == "Patch" and output.startswith("失败"):
                # 记成 Patch!miss,和 Write!badjson 同一风格。没有这一笔,
                # Patch→Patch(占全部 Patch 的 41.6%)里多少是失败重试无从判断。
                page.steps[-1] = "Patch!miss"
            if images and not vision_input:
                images = []
                output += "\n\n（当前模型不接收图片输入；仅保留文本报告。）"
            hist.append(
                {
                    "type": "function_call_output",
                    "call_id": call.call_id,
                    "output": output,
                }
            )
            pending_images.extend(images)

        for media_type, encoded in pending_images:
            hist.append(
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_image",
                            "image_url": f"data:{media_type};base64,{encoded}",
                        }
                    ],
                }
            )
            page.images += 1
        page.evicted += evict_images(hist, page.tok_max)

    target = pages_dir / f"{page.pid}.html"
    page.artifact_present = target.is_file() and target.stat().st_size > 0
    page.audit = audit_delivery(pages_dir, page, resource_root)
    page.seconds = time.time() - t0
    mark = "✓" if page.artifact_present else "✗"
    print(
        f"  {page.pid}  {mark}  {page.calls:>3} 次调用  "
        f"{page.seconds / 60:>5.1f} 分  图 {page.images:>2}  "
        f"{page.termination}",
        flush=True,
    )
    return page


def workflow_runtimes(cfg: dict, default: llm.ModelProfile,
                      uniform: bool = False) -> dict[str, llm.ModelRuntime]:
    """One runtime per workflow. ``builder.workflow_profiles`` overrides the default per page type.

    ``uniform`` drops those overrides so one run can put every page type on the
    same profile. config.yaml is shared state, so a single ablation must not
    have to edit it — same reason planner has ``--base-url`` / ``--key-env``.
    """
    overrides = {} if uniform else (cfg.get("builder") or {}).get("workflow_profiles") or {}
    unknown = sorted(set(overrides) - set(skills.PAGE_WORKFLOWS))
    if unknown:
        raise ValueError(f"workflow_profiles names unknown workflows: {unknown}")
    cache = {default.id: llm.ModelRuntime(default)}
    out = {}
    for name in skills.PAGE_WORKFLOWS:
        pid = overrides.get(name, default.id)
        if pid not in cache:
            cache[pid] = llm.ModelRuntime(llm.resolve_builder_profile(cfg, pid))
        out[name] = cache[pid]
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", required=True)
    parser.add_argument("--only", action="append", help="只跑指定页面，可重复")
    parser.add_argument("--concurrency", type=int, default=100)
    parser.add_argument("--profile", help="config.yaml 中的 Builder profile")
    parser.add_argument("--workflows", default=str(skills.WORKFLOWS))
    parser.add_argument(
        "--samples",
        choices=skills.SAMPLE_MODES,
        default="full",
        help="样本消融臂：full=完整实例，mini=紧凑实例（代码页=单个作者层），none=只给 reference",
    )
    parser.add_argument(
        "--uniform",
        action="store_true",
        help="忽略 config 的 workflow_profiles，所有页型都用 --profile 那一个",
    )
    parser.add_argument(
        "--aux-samples",
        action="store_true",
        help="实验开关：在 Main 之外注册可选 mini samples；默认关闭",
    )
    parser.add_argument(
        "--sample-shots",
        action="store_true",
        help="实验开关：读 Main bundle 时附上该 sample 的多态截图拼图（samples/<cat>/<id>/shots.png）；默认关闭",
    )
    parser.add_argument(
        "--visual-focus",
        action="store_true",
        help="实验开关：页表带「视觉焦点」行时，system 追加使用规则；默认关闭（基线不变）",
    )
    parser.add_argument(
        "--frame-cap",
        action="store_true",
        help="实验开关：带描边/底色的区块 ≤1（只能是主体）；默认关",
    )
    parser.add_argument(
        "--notes",
        choices=tuple(NOTES_BLOCKS),
        default="off",
        help="实验开关：cap=画面 ≤200 字的硬数 + Check 报字数；notes=cap + 讲稿区 <aside class=notes>；默认 off（基线不变）",
    )
    args = parser.parse_args()
    tools.SAMPLE_SHOTS = args.sample_shots
    tools.TEXT_REPORT = args.notes != "off"

    cfg = config()
    profile = llm.resolve_builder_profile(cfg, args.profile)
    runtimes = workflow_runtimes(cfg, profile, args.uniform)

    root = ROOT / "runs" / args.label
    briefs = json.loads((root / "briefs.json").read_text(encoding="utf-8"))
    workflow_root = Path(args.workflows).resolve()
    missing = [
        name
        for name in skills.PAGE_WORKFLOWS
        if not (workflow_root / name / "SKILL.md").is_file()
    ]
    if missing:
        raise FileNotFoundError(
            "生产 workflow 未安装完整: " + ", ".join(missing)
        )

    pages = [route_page(root, page_from_brief(raw)) for raw in briefs]
    for page in pages:
        page.total = len(briefs)
    if args.only:
        wanted = set(args.only)
        pages = [page for page in pages if page.pid in wanted]

    manifest_path = root / "builder-manifest.json"
    if manifest_path.exists():
        raise FileExistsError(
            f"{manifest_path} 已存在；新实验请使用新的 run label"
        )
    pages_dir = root / "pages"
    for page in pages:
        target = pages_dir / f"{page.pid}.html"
        lesson = code_runtime.lesson_root(pages_dir, page.pid)
        if target.exists() or lesson.exists():
            raise FileExistsError(
                f"{page.pid} 已有构建产物；新实验必须从 absent target 开始"
            )

    manifest = {
        "schemaVersion": 3,
        "label": args.label,
        "profile": profile.id,
        "model": profile.model,
        "baseUrl": profile.base_url,
        "apiKeyEnv": profile.api_key_env,
        "adapter": profile.adapter,
        "reasoningEffort": profile.reasoning_effort,
        "visionInput": profile.vision_input,
        "workflowProfiles": {name: rt.profile.id for name, rt in runtimes.items()},
        "auxiliarySamples": args.aux_samples,
        "samples": args.samples,
        "sampleShots": args.sample_shots,
        "visualFocus": args.visual_focus,
        "notesMode": args.notes,
        "frameCap": args.frame_cap,
        # mini 臂里因为缺 mini 而仍用 full 的样本。统计时用到它们的页要剔除,
        # 否则那几页混着对照条件。见 skills.MINI_FALLBACKS。
        "miniFallbacks": dict(skills.MINI_FALLBACKS),
        "pages": [page.pid for page in pages],
        "startedAt": _now(),
    }
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    base = (IDENTITY + "\n\n" + skills.philosophy_block("page")
            + "\n\n" + skills.anti_slop_block(workflow_root))
    if args.visual_focus:
        base += "\n\n" + VISUAL_FOCUS_BLOCK
    if NOTES_BLOCKS[args.notes]:
        base += "\n\n" + NOTES_BLOCKS[args.notes]
    if args.frame_cap:
        base += "\n\n" + FRAME_CAP_BLOCK
    shared = shared_preload(root, len(briefs))
    base += "\n\n" + shared
    chapters = chapter_preloads(root, len(briefs))
    routed_blocks = {
        name: skills.routed_workflow(
            name,
            workflow_root,
            include_aux=args.aux_samples,
            samples=args.samples,
        )
        for name in skills.PAGE_WORKFLOWS
    }
    for page in pages:
        resource_root = workflow_root / page.workflow
        page.prompt = (
            environment_context(pages_dir, page, resource_root)
            + "\n\n"
            + page.prompt
            + "\n\n"
            + chapters[page.pid]
        )

    instructions = {
        page.pid: base + "\n\n" + routed_blocks[page.workflow]
        for page in pages
    }
    groups = Counter(instructions.values())
    lengths = sorted(map(len, groups)) or [0]
    print(
        f"\n▸ builder · {args.label}\n"
        f"  {len(pages)} 页，并发 {args.concurrency}，"
        f"profile={profile.id}，model={profile.model}，"
        f"adapter={profile.adapter}，effort={profile.reasoning_effort}，"
        f"vision={'on' if profile.vision_input else 'off'}，"
        + "".join(f"{n}→{rt.profile.id}，" for n, rt in runtimes.items() if rt.profile.id != profile.id)
        + f"samples={args.samples}，"
        + f"sample-shots={'on' if args.sample_shots else 'off'}，"
        + f"visual-focus={'on' if args.visual_focus else 'off'}，"
        + f"notes={args.notes}，frame-cap={'on' if args.frame_cap else 'off'}，"
        + f"aux-samples={'on' if args.aux_samples else 'off'}\n"
        f"  完整 system {lengths[0]:,}–{lengths[-1]:,} 字符，"
        f"按 workflow 分 {len(groups)} 组共享\n"
    )

    started = time.time()

    def guard(page: Page) -> Page:
        rt = runtimes[page.workflow]
        try:
            return build_one(
                page,
                pages_dir,
                root / "trace.jsonl",
                workflow_root,
                instructions[page.pid],
                rt.profile.reasoning_effort,
                rt.profile.vision_input,
                rt,
            )
        except Exception as exc:  # noqa: BLE001
            page.why = f"{type(exc).__name__}: {str(exc)[:160]}"
            page.termination = "agent_exception"
            target = pages_dir / f"{page.pid}.html"
            page.artifact_present = target.is_file() and target.stat().st_size > 0
            page.audit = audit_delivery(
                pages_dir, page, workflow_root / page.workflow
            )
            print(
                f"  {page.pid}  ✗ agent_exception，不影响其他页：{page.why}",
                flush=True,
            )
            return page

    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        done = list(pool.map(guard, pages))

    wall = time.time() - started
    delivered = [page for page in done if page.artifact_present]
    calls = sorted(page.calls for page in done) or [0]
    print(
        f"\n  {len(delivered)}/{len(done)} 页留下产物，墙钟 {wall / 60:.1f} 分\n"
        f"  每页调用数 {calls[0]}–{calls[-1]}，"
        f"中位 {calls[len(calls) // 2]}，合计 {sum(calls)}"
    )
    over_target = [page.pid for page in done if page.calls > RESPONSE_TARGET]
    print(
        f"  响应目标 ≤{RESPONSE_TARGET}："
        f"{len(done) - len(over_target)}/{len(done)} 达成"
    )
    fatal_pages = [
        page.pid
        for page in done
        if page.audit and page.audit.get("fatal_errors")
    ]
    warning_pages = [
        page.pid
        for page in done
        if page.audit and page.audit.get("visual_warnings")
    ]
    print(
        f"  独立审计：致命错误 {len(fatal_pages)} 页，"
        f"视觉警告 {len(warning_pages)} 页"
    )

    results = {
        page.pid: {
            "calls": page.calls,
            "within_response_target": page.calls <= RESPONSE_TARGET,
            "seconds": round(page.seconds, 1),
            "label": page.label,
            "workflow": page.workflow,
            "profile": runtimes[page.workflow].profile.id,
            "termination": page.termination,
            "artifact_present": page.artifact_present,
            "audit": page.audit,
            "steps": page.steps,
            "args": page.steps_arg,
            "reference_reads": page.reference_reads,
            "images": page.images,
            "evicted": page.evicted,
            "tok_in": page.tok_in,
            "tok_cached": page.tok_cached,
            "tok_write": page.tok_write,
            "tok_out": page.tok_out,
            "tok_max": page.tok_max,
            "cache_reported": page.cache_seen,
            "why": page.why,
        }
        for page in done
    }
    (root / "builder-results.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    manifest.update(
        {
            "completedAt": _now(),
            "wallSeconds": round(wall, 1),
            "artifacts": len(delivered),
            "attempted": len(done),
            "fatalAuditPages": fatal_pages,
            "visualWarningPages": warning_pages,
            "overResponseTargetPages": over_target,
            "inputTokens": sum(page.tok_in for page in done),
            "outputTokens": sum(page.tok_out for page in done),
            "checkCalls": sum(page.steps.count("Check") for page in done),
        }
    )
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    reads = Counter(
        tag
        for page in done
        for tag in page.steps_arg.get("Read", [])
    )
    top = "  ".join(f"{name} {count}" for name, count in reads.most_common(8))
    print(f"  读取次数(前 8)：{top or '无'}")
    for page in done:
        if not page.artifact_present:
            print(f"  ✗ {page.pid}: 没有产物；{page.termination} {page.why}")


if __name__ == "__main__":
    main()
