"""Planner: one model call produces the shared theme and the ordered page list.

The harness materializes only deterministic planning artifacts.  Page HTML is
intentionally absent until the routed Builder creates it.

    python3 -m core.planner --query "…" --minutes 90 --label orbit-01
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import urllib.request
import sys
import subprocess
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from . import skills
from . import imgcut
from .artifacts import Brief
from . import llm
from .llm import ROOT, config, fill, strip_fence

# harness 的全部外部输入(底盘、库、技法文档)都在这下面,**不指向 notale-v2 外面**。
# 以前是三条写死的绝对路径,指向同级的 `notale/zzz` 和 `notale/zero`;那两个目录
# 一消失,一天里三次中断:图池 0/12、规格的技法文档全空、expand 静默抛异常。
VENDOR = Path(__file__).resolve().parent.parent / "vendor"
from .trace import Writer

PROMPTS = ROOT / "prompts"
IDENTITY = "你在为一套内容做规划。只输出被要求的东西,不写说明、不写总结、不加围栏。"

# 实验开关 --visual-focus:页表每页多一行「视觉焦点」,把主证据场的决定从 builder 挪到 planner。
# 默认不注入,deck.md 里的 {visual_focus} 槽位填空串,基线一字不变。
VISUAL_FOCUS_SPEC = """
### 视觉焦点

每页主题之后再写一行 `视觉焦点：…`：一句话说清读者第一眼落在哪一个画面、它让哪一个关系可见。
它是这一页的主证据场，不是布局说明——写「什么东西、显示什么关系」，不写位置、尺寸、配色和操作。
一页只有一个焦点；`[标题页]` 写主视觉；`[代码页]` 不写这一行。

    # page-NN [内容页]
    袋外评估：未进入某棵树训练样本的观测可形成无需额外验证集的近似评估
    视觉焦点：一张样本×树的 in-bag/OOB 矩阵，每行约三分之一格子是 OOB，由此汇出每个样本的袋外预测
""".strip()
PLANNER_WRITE_SPEC = [{
    "type": "function",
    "name": "Write",
    "description": "写完整文件",
    "parameters": {
        "type": "object",
        "properties": {
            "file_path": {"type": "string", "description": "绝对路径"},
            "content": {"type": "string", "description": "完整内容"},
        },
        "required": ["file_path", "content"],
        "additionalProperties": False,
    },
}]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


@dataclass
class Run:
    query: str
    minutes: int
    audience: str
    label: str
    scenario: str = ""
    canvas: tuple[int, int] = (1600, 900)
    # 提示词目录可换。理由同下面 --skills 那段注释:三个外部依赖要么都能换,要么都不能换。
    # 这一条是为了能一键切两套模板做对照臂,而不必对 prompts/ 做 git 体操。
    prompts: Path = PROMPTS
    # 两张选项菜单表接不接回 direction 块。**有期限的开关**,见 skills.direction_block。
    direction_menus: bool = False
    # 页表每页多一行「视觉焦点」。实验开关,见 VISUAL_FOCUS_SPEC。
    visual_focus: bool = False
    # theme.css 交给 style director(core/director.py)另起一路并行写,deck 这步只写页表。
    style_director: bool = False
    root: Path = field(init=False)
    log: Writer = field(init=False)

    def __post_init__(self) -> None:
        self.root = ROOT / "runs" / self.label
        if self.root.exists():
            raise FileExistsError(
                f"run already exists: {self.root}; use a new --label for a fresh test")
        self.assets.mkdir(parents=True, exist_ok=True)
        self.log = Writer(self.root / "trace.jsonl", str(uuid.uuid4()))

    pages = property(lambda self: self.root / "pages")
    assets = property(lambda self: self.root / "pages" / "assets")

    def prompt(self, name: str, **kw: object) -> str:
        raw = (self.prompts / f"{name}.md").read_text(encoding="utf-8")
        # deck.md 里跟 theme.css 有关的段落用 <!--css:…--> 括着,交给 director 时整段剥掉;
        # 只在那时才生效的说明用 <!--pages-only:…--> 括着。两套标记都从同一个文件走,
        # 免得复制出第二份 deck.md 然后两边各自漂移。
        drop = "css" if self.style_director else "pages-only"
        keep = "pages-only" if self.style_director else "css"
        raw = re.sub(rf"<!--{drop}:start-->.*?<!--{drop}:end-->", "", raw, flags=re.S)
        raw = raw.replace(f"<!--{keep}:start-->", "").replace(f"<!--{keep}:end-->", "")
        return fill(raw, _where=f"{name}.md", **kw)


def _valid_css(text: str) -> str:
    """Validate the shared CSS contract that every page depends on."""
    if text.lstrip().startswith("```"):
        return "theme.css 不能包含 markdown 代码围栏"
    bare = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    # 2026-09-06 删掉「#stage 必须是 flex 列」这道闸。它当初是照抄 Opus 的 deck.css 加的,
    # 实测把填充率从 89% 提到 93–95%、每页 Edit 从 17.2 降到 6.4;但它同时把版面锁成
    # 「切格子」,卡片墙是这个骨架的必然产物 —— 逐页量下来我们每页 5 处像素坐标、0 处
    # absolute,而同一题目下的 Opus 是每页 20 处像素坐标、5 处 absolute,#stage 只有
    # position:absolute 没有 display。填不满的老问题要靠 A/B 盯住(填充率 + 每页 Edit)。
    if "==== INTERFACE ====" not in text or "==== /INTERFACE ====" not in text:
        return "缺少完整的 INTERFACE 接口块"
    return ""


# ── 一次调用的产物:由模型用 `Write` 工具直接写文件 ──────────────────────
#
# **2026-08-28 从「分隔行 + 从散文里抠」改成走工具。这是根因修复,不是加判据。**
#
# 原来的形状是模型吐一篇复合散文(`=== CSS ===` / `=== PAGES ===` 分隔行),
# harness 再用 `_extract_code` 的候选启发式把 CSS 切出来。代价当天就付了:
# CSS 首行残留一个 markdown 围栏,浏览器把它当选择器、连同紧随的 `:root` 一起
# 丢弃,**整套 token 失效、20 页全部无样式渲染**,而所有既有判据都报绿
# (文件在、HTTP 200、解析出 89 条规则、`_valid_css` 的文本检查全过、
#  selfcheck 报 0 失败、占用比因为元素散开反而更高)。
#
# 走工具之后文件内容是 tool call 的 JSON 字符串字段:**没有围栏可言,
# 没有分隔行要找,没有候选要猜** —— 这一整类 bug 消失,而不是被判据兜住。
#
# 仍然是**一次模型调用**:一个响应里带多个 tool call 在这条路由上是实测可行的
# (builder 日志里的 `步 2 Read Read Read`)。大号工具参数也是实测过的 ——
# builder 常规地把整页 HTML 当 `Write` 的参数写出去,iface8 那轮 21 次 Write
# 输出中位 5,253 tok、最大 7,893,而这里的 theme.css 约 3,110 tok。
#
# **只发两个 Write,不是每页一个。** 一次响应里发 21 个 tool call 在这条路由上
# 没有实测证据(观察到的最大是 5 个小 Read);而按 `# page-NN` 切散文**不是**
# 出过问题的地方 —— 那里没有围栏、没有代码,`_split_specs` 已经跑了很多轮。
# 只把出过事的那一份挪到工具上,改动面最小。
N_CEIL = 60  # resource cap; the Planner otherwise decides page count
PAGE_LABELS = frozenset({"标题页", "内容页", "交互页", "代码页"})

CSS_REL = "pages/assets/theme.css"
PAGES_REL = "pages/plan/pages.md"


def write_targets(run: Run) -> dict:
    """Return the Planner's two exact output targets."""
    if getattr(run, "style_director", False):
        return {(run.root / PAGES_REL).resolve(): "pages.md"}
    return {(run.root / CSS_REL).resolve(): "theme.css",
            (run.root / PAGES_REL).resolve(): "pages.md"}


def take_writes(calls, run: Run) -> tuple[dict, list]:
    """Collect one response's writes and report every protocol violation."""
    allow = write_targets(run)
    got, refused = {}, []
    for c in calls:
        if c.name != "Write":
            refused.append(f"只给了 `Write` 工具,不该调 `{c.name}`")
            continue
        try:
            a = json.loads(c.arguments or "{}")
        except json.JSONDecodeError as ex:
            refused.append(f"Write 的参数不是合法 JSON({ex}) —— 多半是被截断了")
            continue
        raw = str(a.get("file_path") or "")
        try:
            target = Path(raw).resolve()
        except OSError:
            target = None
        name = allow.get(target)
        if not name:
            refused.append(f"不许写 `{raw}`;这一步只能写 {CSS_REL} 和 {PAGES_REL}")
            continue
        got[name] = str(a.get("content") or "")
    return got, refused


def split_pages(text: str) -> dict:
    """`pages.md` → `{nn: 正文}`。复用 `_split_specs`:按页号而非位置映射、
    同页号取最后一次、丢弃前言。"""
    return _split_specs(text, range(1, N_CEIL + 1))


def _valid_pages(text: str) -> str:
    """Validate only the page-list protocol used for routing and materialization."""
    pages = split_pages(text)
    if not pages:
        return "没有 `# page-NN` 块 —— 每页一个,页号两位、从 01 连续编"
    nn = sorted(int(k) for k in pages)
    if len(nn) > N_CEIL:
        return f"页数超过资源上限 {N_CEIL}"
    if nn != list(range(1, len(nn) + 1)):
        miss = sorted(set(range(1, max(nn) + 1)) - set(nn))
        return f"页号不连续,缺 {' '.join(f'page-{x:02d}' for x in miss)} —— 从 01 编到 N,不跳号"
    for key, page in pages.items():
        m = re.match(rf"#\s+page-{key}\s+\[([^\]]+)\]\s*\n(.+)", page, re.S)
        if not m:
            return f"page-{key} 必须只有 `[标签]` 标题行和非空主题"
        label, topic = m.group(1).strip(), m.group(2).strip()
        if label not in PAGE_LABELS:
            return f"page-{key} 使用未知标签 `[{label}]`"
        if not topic:
            return f"page-{key} 的主题为空"
        if key == "01" and label != "标题页":
            return "page-01 必须是 `[标题页]`"
    return ""


def iface_gaps(text: str) -> list[str]:
    """正文里定义了、但 INTERFACE 没列的类。**只报不拦。**

    2026-08-29 这条是硬闸,2026-08-30 降级 —— 它连着杀了两轮 Sonnet:
    第一次是我的正则把 `url(https://fonts.googleapis.com/…)` 里的点当成类
    (报 `.googleapis`,模型永远修不掉,已修);第二次是 Sonnet 写的 CSS 更细碎
    (`.is-active`/`.is-selected` 这类状态类、`.ctl-row`/`.col-text` 这类内部子块),
    13 个漏列它三次都补不齐,而同一条闸 GPT-Sol 一次就过。
    **一条只有某个模型能过的闸,是模型指纹,不是质量判据**(同 selfcheck 密度那条的教训)。

    接口不全的后果是软的:builder 少几个可选的类,自己写页内样式。
    比起为此判死整轮(3 次调用 + 一次规划全废),报出来让人看见更划算。
    """
    if "==== /INTERFACE ==== */" not in text:
        return []
    bare = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    sel = re.sub(r"url\([^)]*\)|\"[^\"]*\"|'[^']*'", " ", bare)
    iface = text.split("==== /INTERFACE ==== */", 1)[0]
    svg_guard = set(re.findall(r"svg\s+\.([A-Za-z][\w-]*)", sel))
    defined = {m for m in re.findall(r"\.([A-Za-z][\w-]*)", sel)} - svg_guard
    # 状态类归它的宿主组件,不单独上表
    defined = {c for c in defined if not c.startswith(("is-", "has-"))}
    return sorted(c for c in defined if f".{c}" not in iface and c not in iface)


def _split_specs(text: str, nns) -> dict:
    """把一次回复里的多份规格按 `# page-NN` 切开,返回 `{nn: 正文}`。

    **按页号映射,不按位置** —— 模型可能乱序输出,按位置对齐会把 p07 的正文
    存进 p05.md,而两份都「看起来正常」,这种错没有任何下游闸能发现。

    同一页号出现多次取**最后一次**:沿用 `_extract_spec` 的同一条经验,
    越靠后越可能是「最终答案」,前面那些是写废的草稿。

    第一个 `# page-` 之前的前言直接丢掉(模型爱写「好的,下面是这一幕的规格」)。
    """
    want = {str(n).zfill(2) for n in nns}
    body = strip_fence(text.strip())
    hits = list(re.finditer(r"(?m)^#\s+page-(\d+)", body))
    out: dict[str, str] = {}
    for i, m in enumerate(hits):
        nn = m.group(1).zfill(2)
        if nn not in want:
            continue
        end = hits[i + 1].start() if i + 1 < len(hits) else len(body)
        out[nn] = body[m.start():end].strip()      # 后出现的覆盖先出现的
    return out


DECK_TRIES = 3


def deck_call(run: Run, prompt: str, tries: int = DECK_TRIES) -> tuple[str, str]:
    """Call, validate, retry with the rejection reason, then materialize both writes.

    **The retry is not defensive padding; it is measured.** This step asks for two
    files in one response, and models drop one of them at a rate that makes a
    single shot unusable: 2026-09-04 it failed 6 times running — 5× gemini-3.8-flash
    (across the 999 router and Google's own endpoint, effort low and medium) and
    1× AWS-GPT-5.6-Sol, every time writing a complete, valid `theme.css` and simply
    never calling Write for `pages.md`. Nothing was truncated; the second call just
    never came. One shot with a validator and no retry turns that into a dead run.

    The rejection reason goes back to the model rather than re-rolling a bare
    prompt: what is missing is exactly what the validator already knows.
    """
    css_p, pages_p = run.root / CSS_REL, run.root / PAGES_REL
    for attempt in range(1, tries + 1):
        try:
            return _deck_attempt(run, prompt, css_p, pages_p, attempt)
        except _DeckRejected as exc:
            if attempt == tries:
                rejected = run.root / "deck.rejected.json"
                rejected.write_text(json.dumps(
                    {"bad": exc.bad, "attempts": tries, **exc.got},
                    ensure_ascii=False, indent=1), encoding="utf-8")
                raise RuntimeError(
                    f"deck 交付不合格({tries} 次都没过): {'; '.join(exc.bad)}。"
                    f"诊断见 {rejected}") from None
            print(f"  ⚠ deck 第 {attempt} 次不合格({'; '.join(exc.bad)}),重试")
            prompt = (exc.prompt + "\n\n上一次尝试被判不合格：" + "；".join(exc.bad)
                      + "。两个文件都必须在这一次响应里各调用一次 Write 写出来。")
    raise AssertionError("unreachable")


class _DeckRejected(RuntimeError):
    def __init__(self, bad: list, got: dict, prompt: str):
        super().__init__("; ".join(bad))
        self.bad, self.got, self.prompt = bad, got, prompt


def _deck_attempt(run: Run, prompt: str, css_p: Path, pages_p: Path,
                  attempt: int) -> tuple[str, str]:
    t0, started = time.time(), _now()
    r = llm.respond(IDENTITY, [{"role": "user", "content": prompt}],
                    PLANNER_WRITE_SPEC, config()["planner"]["reasoning_effort"], tag="deck")
    calls = [o for o in r.output if getattr(o, "type", "") == "function_call"]
    tin, tout, cached_tok = llm.usage_of(r)
    run.log.add([{"type": "text", "text": prompt}], llm.text_of(r),
                {"input_tokens": tin, "output_tokens": tout,
                 "cache_read_input_tokens": cached_tok or 0},
                getattr(r, "id", None) or f"req_{uuid.uuid4().hex[:16]}",
                started, _now(),
                {"step": "deck", "tools": [{"name": c.name} for c in calls]})
    got, refused = take_writes(calls, run)
    print(f"  deck         {time.time()-t0:6.1f}s  in={tin:>7,}  out={tout:>6,} tok  "
          f"{len(calls)} 个工具调用 → {sorted(got) or '无产物'}")

    bad = list(refused)
    css_bad = _valid_css(got["theme.css"]) if "theme.css" in got else ""
    pages_bad = _valid_pages(got["pages.md"]) if "pages.md" in got else ""
    if getattr(run, "style_director", False):
        # 主题另有一路在写,这里多写一个文件反而要拦下来(两边会互相覆盖)
        if "theme.css" in got:
            bad.append("这一步不写 theme.css,主题由 style director 另行产出")
    elif "theme.css" not in got:
        bad.append(f"没有写 {CSS_REL}")
    elif css_bad:
        bad.append(f"{CSS_REL}: {css_bad}")
    if "pages.md" not in got:
        bad.append(f"没有写 {PAGES_REL}")
    elif pages_bad:
        bad.append(f"{PAGES_REL}: {pages_bad}")
    if bad:
        raise _DeckRejected(bad, dict(got), prompt)

    if getattr(run, "style_director", False):
        pages_p.parent.mkdir(parents=True, exist_ok=True)
        pages_p.write_text(got["pages.md"], encoding="utf-8")
        return "", got["pages.md"]
    css_p.parent.mkdir(parents=True, exist_ok=True)
    pages_p.parent.mkdir(parents=True, exist_ok=True)
    css_p.write_text(got["theme.css"], encoding="utf-8")
    pages_p.write_text(got["pages.md"], encoding="utf-8")
    return got["theme.css"], got["pages.md"]


def seed(run: Run, chassis: Path, lib: Path) -> None:
    """探环境。nn-06 在这里花了 4 次模型调用去 Read 文件 —— 纯读取没有判断,
    harness 直接做掉。

    **2026-08-28 起不再返回 LIBS.md 正文。** 它以前是喂给写 theme/pages 那一步的
    `{libs}`,8,341 字符、占那次提示词的 26%,而里面大半是 API 用法(mlp.js 怎么用、
    katex 必须连 CSS 一起引、精确版本…)—— 那是建页 agent 的事,不是规划的事。
    builder 侧早就切开了:`builder._libs_index()` 只把开头那张「按要做的事查」路由表
    拼进 `prompts/tech.md`(覆盖每一页),细节留给一次 `Read`(`prompts/brief.md` 指路)。
    规划这一步现在只在 deck.md 里读到一句「库由 harness 预置,选型和 API 归建页 agent」。
    代价记在 runs/direction-trim-experiment.json:散文里不再出现
    `MLP.create({sizes:…})` / `renderer:'svg'` 这类 API 级细节,跨页选库一致性会松。
    """
    # 底盘件一律从 --chassis 取,**不留第二份实现**。
    # 以前 selfcheck 在 notale-v2 里另存了一份 tools_selfcheck.py,结果分叉了:
    # 那份 6,984B、zzz 那份 15,220B,密度(占用比/容器数/文本块数/叠压)、
    # --after、KaTeX .katex-mathml、零宽字符跳过、800×450 截图 —— 全都只在 zzz 那份里。
    # nn-08…nn-10 三轮的仪器改进一条都没进到真实 harness。
    for f in ("base.css", "base.js", "CHASSIS.md", "selfcheck.py"):
        src = chassis / f
        if not src.exists():
            raise FileNotFoundError(f"底盘缺 {src} —— 它是 harness 的输入,不能缺")
        shutil.copy2(src, run.assets / f)
    # **拷贝,不做软链接。** 以前这里是 `symlink_to(lib)`,后果是交付出去的 45 页
    # 依赖 harness 目录还在原地 —— 实测有一轮的 lib 软链接指向 /tmp,
    # 那批页面在 /tmp 被清掉之后全部丢库,而 HTML 照样打得开、只是交互死掉。
    # 6.3MB 换掉这个隐患是划算的:一个 run 目录必须能单独拷走还能跑。
    if not (run.assets / "lib").exists():
        shutil.copytree(lib, run.assets / "lib")
    print(f"  seed         底盘已就位,库 {len(list(lib.glob('*.js')))} 个（真拷贝,非软链接）")


_FIELD = re.compile(r"\s*(?:[-*]\s*)?\*{0,2}[^：:\n]{1,15}[：:]")
_BULLET = re.compile(r"\s*(?:[-*]|\d+[.、)])\s+")


_SOURCES = "wikimedia,nasa,met,loc,internetarchive"


# 两条守卫,都是文本/统计,不是判断:
#   G1 检索词和标题的实词重叠 —— 抓「met 给了一只玛雅陶哨」这种彻底不相干的
#   G2 内容图近白底 —— 抓「拿到的是白底图表不是照片」,那种图放在暗底讲义上很难看
# 都拿真实数据验过:10 个已知案例判对 9 个,唯一漏的那个(Hominin statures 身高图)
# 正好被 G2 拦住(平均亮度 242)。**标题是馆藏编号的放过** ——
# `Galet MHNT PRE.2009.0.200.1.jpg` 是对的图,只是没有词可比,
# 而这个项目为「猜标签里的词」栽过一整轮。
_STOP = set("the a of and in on at for with photo image museum specimen object cast view "
            "detail close up jpg png file wikimedia commons during test".split())


def _words(s: str) -> set:
    return {w for w in re.findall(r"[a-z]{4,}", (s or "").lower()) if w not in _STOP}


def _off_topic(query: str, title: str) -> bool:
    """检索词和标题一个实词都不重叠 → 判为不相干。

    **豁免只给带馆藏编号(≥3 位数字)的标题。** 第一版豁免的是「实词少于 3 个」,
    结果 `Whistling vessel`(一只玛雅陶哨,用在讲用火遗址的页上)靠两个词溜过去了;
    而真正该豁免的是 `Galet MHNT PRE.2009.0.200.1.jpg` 这种 —— 它没有词可比,
    但那串编号本身就是机构标本记录的标志。换成按数字判之后 8 个已知案例判对 7 个,
    唯一漏的那张(白底身高对比图)由 `_too_pale` 拦住。
    """
    if _words(query) & _words(title):
        return False
    return not re.search(r"\d{3,}", title or "")


def _too_pale(path: Path) -> bool:
    """内容图近白底 —— 白底图表贴在暗底讲义上是剪贴画。"""
    try:
        from PIL import Image
        im = Image.open(path).convert("RGB").resize((48, 48))
        px = list(im.getdata()); n = len(px)
        L = sum(round(.2126 * r + .7152 * g + .0722 * b) for r, g, b in px) / n
        return L > 200
    except Exception:
        return False


def _search(query: str) -> list:
    """跑一次检索,返回 results 列表。输出是 dict 不是 list —— 按 list 迭代会拿到键名。"""
    try:
        r = subprocess.run([sys.executable, str(_WEBMEDIA), query, "--type", "image",
                            "--source", _SOURCES, "--count", "12", "--json"],
                           capture_output=True, text=True, timeout=180)
        return (json.loads(r.stdout or "{}") or {}).get("results") or []
    except Exception:
        return []


_UA = "notale-deck/1.0 (lecture-deck research; +https://github.com/JJchess/Notale)"
_WEBMEDIA = skills.DEFAULT / "web-media-getter" / "webmedia.py"
_GEN = skills.DEFAULT / "make-illustration" / "scripts" / "gen.py"

_IMG_ROW = re.compile(r"^\s*\|\s*([\w.-]+\.(?:jpg|jpeg|png|webp))\s*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|")


def img_plan(plan_text: str) -> list[dict]:
    """图池表 → 逐行的取图任务。

    只认「第一列是个文件名」的行,所以表头和分隔行自动被跳过,
    也不怕模型多写或少写一列的说明文字。

    2026-08-28 起入参是 `=== IMAGES ===` 那一段(见 `segment()`),
    不再需要先去 PLAN.md 里找 `## 0.7` —— 那一节和 PLAN.md 一起没了。
    """
    out = []
    for line in (plan_text or "").splitlines():
        r = _IMG_ROW.match(line)
        if not r:
            continue
        kind = r.group(2).strip()
        out.append(dict(name=r.group(1).strip(),
                        kind="插画" if "插画" in kind else "照片",
                        query=r.group(3).strip().strip("`"),
                        pages=r.group(4).strip(),
                        use=r.group(5).strip()))
    return out


P95_CEIL = 90        # 整页底图的局部亮度上限。见 _dim_backdrop 的注释。


def _lum_p95(path: Path) -> int:
    """图的 p95 亮度 —— **不是平均色**。

    这是量出来的:`illus-savanna-horizon.png` 平均色 `rgb(53,57,62)` 看着很暗,
    可它有一个亮太阳,那块峰值亮度 167。底图压到 `opacity:.19`(精确命中要求的 .16–.22)
    之后,那一页右下角的正文对比只有 **2.60:1**(WCAG 正文要求 4.5:1)。
    **控制不住结果的不是 opacity,是源图的亮度分布** —— 所以要量峰值,不是均值。
    """
    try:
        from PIL import Image
        im = Image.open(path).convert("RGB").resize((96, 96))
        L = sorted(round(.2126 * r + .7152 * g + .0722 * b) for r, g, b in im.getdata())
        return L[int(len(L) * .95)]
    except Exception:
        return -1


def _dim_backdrop(path: Path) -> tuple:
    """整页底图太亮就压暗后落盘,返回 (压暗前 p95, 压暗后 p95)。

    压暗放在图池这一步,而不是让 `theme.css` 再调 opacity ——
    opacity 已经给对了,再调它是把一个控制不住结果的旋钮拧得更紧。
    """
    before = _lum_p95(path)
    if before < 0 or before <= P95_CEIL:
        return before, before
    try:
        from PIL import Image
        im = Image.open(path).convert("RGB")
        k = P95_CEIL / before
        im.point(lambda v: int(v * k)).save(path)
        return before, _lum_p95(path)
    except Exception:
        return before, before


def _mean_rgb(path: Path) -> str:
    """图的平均色 —— 给写 theme.css 那一步判断底色能不能承托这些图。

    这是「看图」的**文字代理**,不是同一件事:同类任务里协调者在写 CSS 之前
    把 14 张图拼成一张联系表**看了一眼**(它的第 22 次调用),然后才定下暖近黑的底色。
    我们的 wire 层现在只有文本块 —— 端点其实支持图片(探过:它把测试图里的
    748291 读对了、两半颜色也说对了),要真的看图得先给 wire 加图像块,那是另一件事。
    """
    try:
        from PIL import Image
        im = Image.open(path)
        # **抠过的图要只算不透明那部分。** 直接 convert("RGB") 会把透明区按它底下的
        # 原像素算进来,而天体照的底是黑的太空 —— 一张亮木星的抠图会报成近黑,
        # 而这个数正是写 theme.css 那一步用来定底色的。
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA").resize((32, 32))
            px = [c[:3] for c in im.getdata() if c[3] > 128]
            if px:
                n = len(px)
                return "rgb(%d,%d,%d)" % tuple(sum(c[k] for c in px) // n for k in range(3))
        im = im.convert("RGB").resize((32, 32))
        px = list(im.getdata())
        n = len(px)
        return "rgb(%d,%d,%d)" % tuple(sum(c[k] for c in px) // n for k in range(3))
    except Exception:
        return "?"


def assets(run: Run, plan_text: str) -> str:
    """建图池:照 PLAN.md 第 0.7 节把图取好,产出 `img/IMG.md` 索引 + `CREDITS.md`。

    **为什么放在 plan 阶段。** 这是量出来的,而且量的是同一个建页模型:
    同类任务里协调者在第 5–21 次调用就把 20 张图取完了,写规格是第 31–35 次 ——
    所以它的规格能**直接点名已存在的文件**加一句现成的 `title=` 归属,
    建页只需引用,它 44 页出图 16 张。我们上一轮的规格 0/51 份含文件路径,
    写的是检索任务,建页要自己搜挑下内联编归属四步,48 页出图 4 张。
    消融证据是干净的:**拿它的规格配我们的建页模型,出图 16 张。**

    只取 8–14 张公共图池。某一页临时需要、池子里没有的,仍然由 builder 侧并行取 ——
    那边是 8–50 路并行,而这里是串行,不该把全部取图都搬过来。

    一行取不到**不阻断**。照 `expand()` 的先例:一页不过不许杀掉整轮。
    """
    plan = img_plan(plan_text)
    d = run.assets / "img"
    d.mkdir(parents=True, exist_ok=True)
    if not plan:
        # **「明说不要图」和「这一段写坏了」是两件事,不能报同一句话。**
        # 提示词允许写一行「本套无需图池」(纯计算/纯示意的题目本来就不需要照片),
        # 模型照做了,而这道闸只会找表格 —— 于是报出「规格将没有文件可点名,
        # 建页只能各自去搜」,而实际上根本不该点名任何文件。判据比语义窄。
        #
        # 2026-08-28:入参从 PLAN.md 全文换成 `=== IMAGES ===` 那一段,所以不再
        # 先去找 `## 0.7` 小节标题 —— 整段就是那一节。**告警措辞也跟着改**:
        # 原来那句点名「PLAN.md 第 0.7 节」,而那两样都不存在了,照着它去改的人
        # 会去找一个没有的东西。删接口要连广告它的话一起删,这里是同一条。
        if re.search(r"无需图池|不需要图池|不用图|无图池", plan_text or ""):
            print("  图池         声明本套无需图池 —— 跳过取图")
            return ""
        print("  图池         ⚠ `=== IMAGES ===` 段里没有可读的表格 —— "
              "这一轮没有文件可点名,建页只能各自去搜(实测到达率 20%)。"
              "确实不需要图就在那一段写明「本套无需图池」")
        return ""
    got, miss = [], []
    for it in plan:
        out = d / it["name"]
        if out.exists() and out.stat().st_size > 4096:
            got.append(dict(it, path=out, credit="（已存在）", p95=-1, dim=-1))
            continue
        try:
            if it["kind"] == "插画":
                # 组件素材要抠图,所以背景必须可分离 —— **这句由 harness 追加,
                # 不靠模型每次记得写。** 确定的事 harness 做。
                #
                # 措辞是三次实测换来的,前两次都被闸挡下:
                #   `flat chroma magenta 背景` → 白色主体被洋红反光染透,
                #     despill 碰到前景 57%(任何饱和底色都会往白主体上反)
                #   `flat black background, no floor` → 模型加了个受光地面,
                #     上两角 [0,0,0]、下两角 [112,111,116],四角差 208
                #   `floats alone in empty black space` + 逐项否掉 ground/floor/
                #     surface/shadow/horizon → 一次过,1331×419、边界 0%
                # **黑底还有一个好处:不反光,所以走和照片完全同一条路,不需要 despill。**
                q = it["query"]
                if "组件素材" in it["use"]:
                    q += (", the object floats alone in empty black space, "
                          "nothing else in frame, pure #000000 void all around it, "
                          "no ground, no floor, no surface, no shadow, no horizon, "
                          "no stars, no glow, centred, filling the frame, "
                          "no text, no labels, no watermark")
                subprocess.run([sys.executable, str(_GEN), q,
                                "--out", str(out), "--size", "1600x900"],
                               capture_output=True, text=True, timeout=300, check=True)
                credit = "生成插画（非真实照片）"
            else:
                res = _search(it["query"])
                if not res:
                    # **检索词太长会 0 结果,砍短再搜。** 实测:GPT 写的 8 个词
                    # `Laetoli hominin footprints trackway cast museum photograph Tanzania`
                    # 可下 0 个,而 3 个词的 `Laetoli footprints hominin` 有 10 个 ——
                    # 同类任务里协调者写的一直是 3–4 个词。
                    short = " ".join(it["query"].split()[:3])
                    if short != it["query"]:
                        res = _search(short)
                cand = sorted((h for h in res if h.get("dl")
                               and not _off_topic(it["query"], h.get("title") or "")),
                              key=lambda h: -(h.get("w") or 0))
                if not cand:
                    raise RuntimeError(
                        f"{len(res)} 个结果里没有一个既可下载又和检索词沾边")
                h = None
                for c in cand[:6]:
                    try:
                        # **必须带 UA。** Wikimedia 对 Python 的默认 UA 直接 403 ——
                        # 实测:默认 UA 403,带 UA 就通。同类任务里协调者为这件事
                        # 连写了 dl.py / dl2.py / dl3.py / dl4.py 四个下载脚本。
                        req = urllib.request.Request(c["dl"], headers={"User-Agent": _UA})
                        with urllib.request.urlopen(req, timeout=45) as resp:  # noqa: S310
                            out.write_bytes(resp.read())
                        from PIL import Image
                        if max(Image.open(out).size) < 800:
                            continue
                        if it["use"].find("底图") < 0 and _too_pale(out):
                            continue          # 近白底图表,换下一个
                        h = c
                        break
                    except Exception:
                        continue
                if h is None:
                    raise RuntimeError(f"{len(cand)} 个候选都下不下来或太小(长边 <800)")
                # 四项分开存。上一版把它们拼成一个字符串,于是无出处图库那串关键词标签
                # (`planet, saturn, space, galaxy…`)原样成了页面上的图注。
                meta = dict(title=(h.get("title") or "").strip(),
                            author=(h.get("author") or "").strip(),
                            license=(h.get("license") or "").strip(),
                            page=(h.get("page_url") or "").strip())
                credit = " · ".join(x for x in (meta["title"], meta["author"],
                                                meta["license"]) if x)
            if not out.exists() or out.stat().st_size < 4096:
                raise RuntimeError("落地的文件太小")
            p95 = dim = -1
            if "底图" in it["use"]:
                p95, dim = _dim_backdrop(out)
            # 「组件素材」= 要当物体用(可拖、可摆、可点选),所以要透明底。
            # **抠图放在这一步,不放建页侧**,理由和取图同一条:同一套规格配同一个建页模型,
            # 直接点名已存在的文件出图 16 张,让建页自己搜挑下内联出图 4 张。
            # 抠图比取图更容易出坏产物(绿边、抠掉一半、水印残留),更不该在 8–12 路
            # 并行里各赌一次。抠不干净就当「没取到」——fail-visible 对 fail-wrong。
            cut_note = ""
            if "组件素材" in it["use"]:
                # 插画也走 key=None:生成的组件素材背景是黑虚空,和天体照同一种输入。
                # `imgcut` 的 chroma/despill 那条路目前没人用,留着是给「深色主体
                # 抠不出来、只能换浅底」那种情况 —— 出现了再说。
                img, acc = imgcut.cut(out)
                if img is None:
                    raise RuntimeError("抠图不合格:" + acc.get("why", ""))
                png = out.with_suffix(".png")
                img.save(png)
                if png != out:
                    out.unlink()
                    out = png
                cut_note = (f"（已抠成透明底 {acc['size'][0]}×{acc['size'][1]}，"
                            f"不透明 {acc['opaque_frac']:.0%}）")
            got.append(dict(it, name=out.name, path=out, credit=credit,
                            p95=p95, dim=dim, cut_note=cut_note,
                            meta=(meta if it["kind"] != "插画" else {})))
        except Exception as e:
            miss.append(dict(it, why=f"{type(e).__name__}: {str(e)[:70]}"))
    lines = ["# 图池 —— 这一轮已经取好的图", "",
             "**逐页规格直接点名这里的文件,并照抄它给好的 `title=`。**", "",
             "| 文件 | 尺寸 | 平均色 | p95 亮度 | 用法 | 用在哪几页 | `title=` 照抄这个 |",
             "|---|---|---|---|---|---|---|"]
    for g in got:
        try:
            from PIL import Image
            w, h_ = Image.open(g["path"]).size
        except Exception:
            w = h_ = 0
        pl = "—" if g.get("p95", -1) < 0 else (
            f"{g['p95']}" if g["p95"] == g["dim"] else f"{g['p95']}→{g['dim']}（已压暗）")
        lines.append(f"| `assets/img/{g['name']}` | {w}×{h_} | {_mean_rgb(g['path'])} "
                     f"| {pl} | {g['use']}{g.get('cut_note', '')} | {g['pages']} | `{g['credit']}` |")
    if miss:
        lines += ["", "**没取到（规格不要点名这些，需要就自己写检索词交给建页）**", ""]
        lines += [f"- `{m['name']}` —— {m['why']}" for m in miss]
    txt = "\n".join(lines) + "\n"
    (d / "IMG.md").write_text(txt, encoding="utf-8")
    (d / "CREDITS.md").write_text(
        "# 出处与许可\n\n"
        + "\n".join(f"- `{g['name']}` —— {g['credit']}"
                    + (f"  <{g['meta']['page']}>" if g.get("meta", {}).get("page") else "")
                    for g in got) + "\n",
        encoding="utf-8")
    # 底图拼成联系表,交给写 theme.css 那一步**看**。只拼底图 ——
    # 内容图它不需要看(同类任务里协调者也只看了三张要当底图的插画)。
    backs = [g for g in got if "底图" in g["use"]]
    sheet = d / "backdrops.jpg"
    if backs:
        try:
            from PIL import Image
            ims = [Image.open(g["path"]).convert("RGB").resize((360, 203)) for g in backs]
            sh = Image.new("RGB", (360 * len(ims), 203))
            for i, im in enumerate(ims):
                sh.paste(im, (i * 360, 0))
            sh.save(sheet, quality=72)
            print(f"  图池         底图联系表 {len(ims)} 张 → {sheet.name}")
        except Exception as e:
            print(f"  图池         ⚠ 联系表拼不出来:{type(e).__name__}")
    print(f"  图池         {len(got)}/{len(plan)} 张就位"
          + (f"，{len(miss)} 张没取到" if miss else "")
          + f"  → {d.name}/IMG.md")
    return txt


def _img_lines(pool: str, nn: str) -> str:
    """这一页能用哪几张图 —— 从图池表的「用在哪几页」列**确定性**地取。

    **不靠散文去点名文件。** 实测代价:规格写检索任务而不是文件名时,48 页出图 4 张;
    点名已存在的文件时出图 16 张(`assets()` 上面那段账)。页面正文现在是自由散文,
    没有字段可写,所以这条由 harness 接 —— 它本来就是确定的事。
    """
    rows = []
    for task in img_plan(pool or ""):
        pages = {x.strip().zfill(2) for x in task["pages"].replace("，", ",").split(",")}
        if nn in pages:
            rows.append(f"- `assets/img/{task['name']}`（{task['use']}）")
    if not rows:
        return ""
    return ("\n\n## 本页可用的图\n\n" + "\n".join(rows)
            + "\n\n用法和 `title=` 见 `assets/img/IMG.md`。不要另找图,也不要重新生成。")


def briefs(run: Run, nns: list, pool: str = "") -> list[Brief]:
    """按模板填。每页 = 标签与主题 + 该页的图片清单。

    **全流程唯一一处没照抄 Claude Code 的地方**,理由是量出来的:nn-03 里主 agent
    逐字手写 14 份 brief,派发时刻拉开 6:24,而 brief 之间七成内容一样。
    要换回原样,把这里改成一次模型调用即可 —— 信息一致,只是慢。
    """
    out = []
    for nn in nns:
        pid = f"page-{nn}"
        out.append(Brief(f"Build {pid}", run.prompt(
            "brief", query=run.query, pid=pid, total=len(nns))
            + _img_lines(pool, nn)))
    lens = sorted(len(b.prompt) for b in out)
    print(f"  briefs       {len(out)} 份,{lens[0]}–{lens[-1]} 字符,中位 {lens[len(lens)//2]}")
    return out


def plan_run(run: Run, chassis: Path, lib: Path,
             workflow_root: Path = None) -> dict:
    """**一次模型调用**,产出每页的标签与主题 + 一份 theme.css。

    2026-08-28 之前这里是 7+ 次串行调用(lec.js → PLAN.md → 图池 → theme.css →
    CONTRACT.md → 逐幕规格),外加一整套围绕页表和规格建立的闸与仪器。
    塌缩掉的不只是调用次数:页表那九列、逐页规格的小节格式、以及它们各自的判据,
    都是"为了让下一步能解析上一步"而存在的中间形态。
    """
    workflow_root = workflow_root or skills.WORKFLOWS
    print(f"\n▸ planner · {run.label}\n  {run.query}  /  {run.minutes} 分钟\n")
    t0 = time.time()
    seed(run, chassis, lib)
    w, h = run.canvas

    # style director 与页表并行。两边互不看对方的输出:director 不知道有几页、
    # 讲什么顺序,planner 不知道底色是什么 —— 这是刻意的,删组件词汇那一轮已经
    # 验证过「模型看见什么词就画什么形状」。语义色与概念的绑定由 builder 那边
    # 按 theme.css 的接口块自己认。
    director_err = []
    director_thread = None
    if run.style_director:
        from . import director as _director

        def _run_director():
            try:
                _director.direct(run, config()["planner"]["reasoning_effort"], workflow_root)
            except Exception as exc:            # noqa: BLE001 —— 失败要能报出来,不能吞
                director_err.append(exc)

        import threading
        director_thread = threading.Thread(target=_run_director, daemon=False)
        director_thread.start()

    css, pages_doc = deck_call(run, run.prompt(
        "deck", query=run.query, minutes=run.minutes,
        audience=run.audience, scenario=run.scenario or "（没写）",
        canvas_w=w, canvas_h=h,
        css_path=run.root / CSS_REL,
        pages_path=run.root / PAGES_REL,
        philosophy=skills.philosophy_block("deck", run.prompts),
        direction=skills.direction_block(run.prompts, menus=run.direction_menus),
        theme_bans=skills.theme_slop_block(workflow_root),
        font_floor=skills.FONT_FLOOR,
        visual_focus=VISUAL_FOCUS_SPEC if run.visual_focus else ""))

    if director_thread:
        director_thread.join()
        if director_err:
            raise RuntimeError(f"style director 失败:{director_err[0]}") from director_err[0]
        css = (run.root / CSS_REL).read_text(encoding="utf-8")

    pages = split_pages(pages_doc)
    gaps = iface_gaps(css)
    if gaps:
        print(f"  ⚠ 接口块漏列 {len(gaps)} 个类(只报不拦,builder 会少几个可选项): "
              f"{' '.join('.' + c for c in gaps[:12])}")
    nns = sorted(pages)

    (run.pages / "plan").mkdir(parents=True, exist_ok=True)
    for nn in nns:
        (run.pages / "plan" / f"p{nn}.md").write_text(pages[nn] + "\n", encoding="utf-8")
    lens = sorted(len(pages[nn]) for nn in nns)
    print(f"  逐页内容     {len(nns)} 页,{lens[0]}–{lens[-1]} 字符,中位 {lens[len(lens)//2]}")

    # 取图排在切分之后:图池表和 CSS 出自同一次调用,所以这一轮 CSS 看不到底图。
    # 那是「一次调用」换来的代价,已知并接受(旧形状里 backdrops.jpg 会作为图片
    # 喂给写 theme 的那一步)。图片本身仍然按表抓、按页发。
    pool = assets(run, pages_doc.split("# page-", 1)[0])

    ch = run.assets / "CHASSIS.md"
    if "Deck.fmt(v, d)" not in ch.read_text(encoding="utf-8"):
        ch.write_text(ch.read_text(encoding="utf-8").rstrip() + '''
`Deck.fmt(v, d)` **给非负数加 `+`**，只用于增量（`+3.2%`）；年代、质量、温度、距离等
绝对量一律 `v.toFixed(d)`。
''', encoding="utf-8")
        print("  接口交接     已知陷阱（Deck.fmt 带符号）→ CHASSIS.md")

    (run.root / "briefs.json").write_text(
        json.dumps([b.as_tool_input() for b in briefs(run, nns, pool)],
                   ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n  合计 {time.time()-t0:.0f}s  →  {run.root}")
    return {"pages": len(nns), "root": str(run.root)}


def main() -> None:
    a = argparse.ArgumentParser()
    a.add_argument("--query", required=True)
    a.add_argument("--minutes", type=int, default=90)
    a.add_argument("--audience", default="学过一点相关基础、但没系统学过这个题目的读者")
    a.add_argument("--label", required=True)
    a.add_argument("--scenario", default="",
                   help="使用场合,例如「课堂授课,教师带着讲;学生课后可以自己重看一遍」")
    a.add_argument("--chassis", default=str(VENDOR / "chassis"))
    a.add_argument("--model")
    a.add_argument("--effort")
    # Anthropic 系必须走 messages 才拿得到 cache_control;走 responses 是全额计费,
    # 而且不会有任何报错。builder 侧同名参数。
    # 路由会挂。2026-08-21 和 08-30 各挂过一次(paratera 配额被砍回 8 个免费模型,
    # 403 team_model_access_denied),而 config.yaml 是共享状态,为一次跑改它不合适。
    # override() 本来就能把任意 kwargs 灌进 model 配置,这里只是把它接到命令行。
    a.add_argument("--base-url", help="覆盖 base_url,路由挂了时切备用线")
    a.add_argument("--key-env", help="覆盖 api_key_env,配合 --base-url")
    a.add_argument("--wire", choices=("responses", "chat", "messages"),
                   help="覆盖 wire_api;Anthropic 系模型要用 messages")
    a.add_argument("--lib", default=str(VENDOR / "chassis" / "lib"))
    # --chassis / --lib 一直可以换,skill 根却写死在 skills.DEFAULT 里。
    # 代价实测:skill 目录不在时,`webmedia.py` 和 `gen.py` 一起消失,
    # 图池 0/12、45 份规格的「必用skill」全空,而**这些都只报警不判死**,
    # 一轮跑完才看得出来。三个外部依赖要么都能换,要么都不能换。
    a.add_argument("--skills", default=str(skills.DEFAULT))
    a.add_argument("--workflows", default=str(skills.WORKFLOWS))
    a.add_argument("--prompts", default=str(PROMPTS),
                   help="提示词模板目录,用来跑模板对照臂;默认 notale-v2/prompts")
    # **有期限的开关**,出了结论就要和 prompts/direction-menus.md 一起删掉。
    # 见 skills.direction_block 的 docstring。
    a.add_argument("--direction-menus", action="store_true",
                   help="把两张选项菜单表接回 direction 块(对照臂用);默认不接")
    a.add_argument("--visual-focus", action="store_true",
                   help="实验开关:页表每页多一行「视觉焦点」(主证据场由 planner 定);默认关")
    a.add_argument("--style-director", action="store_true",
                   help="theme.css 由 core.director 并行产出(两次调用 + 四道闸);默认关")
    n = a.parse_args()
    if not Path(n.prompts).is_dir():
        raise SystemExit(f"✗ --prompts 指的 {n.prompts} 不是目录")
    missing = [f"{x}.md" for x in ("brief", "deck")
               if not (Path(n.prompts) / f"{x}.md").is_file()]
    if missing:
        raise SystemExit(f"✗ --prompts 指的 {n.prompts} 缺 {', '.join(missing)} —— "
                         f"缺哪份要当场报错,不能等跑到那一步才 FileNotFoundError。")
    if not Path(n.skills).is_dir():
        raise SystemExit(f"✗ --skills 指的 {n.skills} 不是目录 —— "
                         f"缺了它取图脚本找不到,图池会全空,而那条只报警。")
    workflow_root = Path(n.workflows)
    if not workflow_root.is_dir():
        raise SystemExit(f"✗ --workflows 指的 {workflow_root} 不是目录")
    missing = [name for name in skills.PAGE_WORKFLOWS
               if not (workflow_root / name / "SKILL.md").is_file()]
    if missing:
        raise SystemExit(f"✗ --workflows 缺少建页工作流: {' '.join(missing)}")
    # `_WEBMEDIA` / `_GEN` 是模块级常量,**导入时就绑定了 `skills.DEFAULT`** ——
    # 只加一个 `--skills` 参数,取图那两行仍然指着旧路径,属于「改了参数不生效」。
    # 所以这里显式重绑,并且立刻验证两个脚本真的在。
    global _WEBMEDIA, _GEN
    skills.DEFAULT = Path(n.skills)
    _WEBMEDIA = Path(n.skills) / "web-media-getter" / "webmedia.py"
    _GEN = Path(n.skills) / "make-illustration" / "scripts" / "gen.py"
    for _p, _why in ((_WEBMEDIA, "取照片"), (_GEN, "生成插画")):
        if not _p.exists():
            raise SystemExit(f"✗ {_why}的脚本不在:{_p}")
    llm.override(name=n.model, wire_api=n.wire, base_url=n.base_url, api_key_env=n.key_env)
    if n.effort: config()["planner"]["reasoning_effort"] = n.effort
    plan_run(Run(n.query, n.minutes, n.audience, n.label, n.scenario,
                 prompts=Path(n.prompts), direction_menus=n.direction_menus,
                 visual_focus=n.visual_focus, style_director=n.style_director),
             Path(n.chassis), Path(n.lib), workflow_root)


if __name__ == "__main__":
    main()
