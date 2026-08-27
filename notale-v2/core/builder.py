"""builder —— 每页一个循环,并发跑。

planner 能做成固定流水线,是因为 nn-03 和 nn-06 两轮动作序列完全一致。
builder 不行:实测每页 16–73 次调用,相差 4.6 倍,工具配比也各不相同
(page-09 是 Bash×22,page-20 是 Edit×26)。所以这里只能是循环。

循环在什么上收敛也是数出来的:nn-06 里 `Write` 恒等于 1,之后全是 Edit + Bash + Read,
而 Bash 的 67% 是 selfcheck。每页跑 3–10 次 selfcheck,中位 8。
**写一次 + 闸驱动收敛。**

⚠ 「Write 恒等于 1」这条**已被 nn-09 推翻,不要再当判据用**。同样是 Opus 5、
同样的指令骨架,nn-09 的 subagent 侧是 `Bash 302 / Read 187 / Write 5 / Edit 3`
—— Edit 从 133 掉到 3,页面改用 `cat > page-XX.html <<EOF` 整页重写,
16 页约 156 次整页写入(每页 ~10 次)。

所以收敛机制的可迁移部分只有后半句:**闸驱动**(每页反复 selfcheck 直到干净)。
前半句「写一次」是 nn-06 的偶然形状,不是这类任务的性质。
判「这一页收敛了没有」要看闸过没过,不要看 Write 的次数。

终止照抄 Claude Code:模型不再要求调工具就结束。Skill 是提示和事后观测项,
不在模型停止之后再补催或反过来判交付失败。

    python3 -m core.builder --label orbit-01 [--only page-01] [--concurrency 20]
"""

from __future__ import annotations

import argparse
import json
import re
import time
import uuid
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from . import skills, tools
from . import llm
from .llm import ROOT, config, respond, text_of
from .trace import Writer

MAX_STEPS = 100      # 实测最多 73;打满记为失败,不静默交付
MAX_SECONDS = 3600


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


IDENTITY = """你是这套互动讲义的单页构建 agent。你只负责一个 HTML 文件。

按 brief 说的做:先读契约和规划,再施工,完工前用 Check 自检到干净为止。
不写说明文档、不写测试、不写总结。做完直接结束,不要问问题。

施工分两段,工具面会跟着变,不必自己记:
1. **一次 `Write` 落成整页。** 读完契约、规划和 workflow 之后,把整页一次写出来。
   这一段里只有 `Write` 能改页面 —— 没有 `Patch` 和 `Edit`,不要试图用增量方式起页。
2. **此后只增量改。** `Write` 从工具面消失,改用 `Patch`(一次改好几处,首选)或 `Edit`。
   对着 `Check` 报的问题逐条改,不要重写整页 —— 重写会连已经改对的地方一起冲掉。"""


def _tag_of(c) -> str:
    """一次工具调用的关键参数,用于事后审计。只取能标识「做了什么」的那一个。"""
    try:
        a = json.loads(c.arguments or "{}")
    except Exception:
        return ""
    if c.name == "Skill":
        return str(a.get("skill", ""))
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
    ok: bool = False
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
    wrote: bool = False  # 整页 Write 已经发生过一次(此后只许 Edit/Patch)
    cache_seen: bool = False   # 这条路由到底报不报 cached;不报和没命中要分得开

    def __post_init__(self):
        self.steps = []
        self.steps_arg = {}
        self.stray = []
        self.loaded_skills = []
        self.reference_reads = []
        self.workflow_script_runs = []
        self.termination = ""
        # 预置之后模型仍然去 Read 的那几份。**这是判「预置到底省没省下调用」的读数** ——
        # 仿真省 25.8% 的前提是这 3 次往返真的消失了,而提示词管不住行为。
        # 这个数不为零,就说明 brief 那几句没起作用,收益要按实测重算。
        self.preload_reads = []


def page_from_brief(raw: dict) -> Page:
    """A brief is now just an id and its prose. 2026-08-28 起不再解析任何指派。

    原来这里认两种形状:新 brief 的 `## 主工作流`(必须且只有一项)和旧 brief 的
    `## 必用skill`。两种都没了 —— 技法文档由建页 agent 自己从清单里挑。
    老 run 的 briefs.json 里那几节还在,但不再被读;它们只是正文里的几行字。
    """
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


_PAGE_RE = re.compile(r"page-\d+\.html$")


# ── 确定性备料:预置进 system 块,而不是让每页各花一次往返去 Read ────────────
#
# **这三份是 21/21 页都读的,而且是 `prompts/brief.md` 自己明文命令模型去读的。**
# 把它们留在历史里由模型 Read,代价量出来是三份(runs/iface8-20260827,21 页 376 次调用):
#
#   · **每页 3 次纯搬运的往返** —— 76 次调用里这 3 类占 55 次,占全部调用的 15%
#   · **每页那一次缓存失效要把它们重付一遍。** 失效点是 `Write` 之后切工具面那一步
#     (见 build_one 里 spec_norewrite 上面那段);实测失效时**只有 system 块保住缓存**
#     (page-11 第 8 步:输入 42,991,命中只剩 4,380 = system 块大小),
#     工具面之后的整段历史全部重付。全轮 22 次失效事件、每页正好 1.0 次,
#     合计重付 593,513 tok = **付全价支出的 38%**。放进 system 块就躲开这一笔。
#   · **CHASSIS.md 和 CONTRACT.md 跨页逐字节相同**,却因为排在按页不同的 brief 之后,
#     永远吃不到跨页前缀缓存 —— 21 页各付一次全价。进了 system 块就只付第一次。
#     (实测 system 块本身跨页命中:第 1 步输入 4,684、命中 4,186 = 89%。)
#
# 仿真(按 trace 逐步重算,校准偏差 +4%):付全价 1,603,359 → 1,189,378,**-25.8%**。
#
# **`Skill` 那一次故意不预置。** 再省 4.3pp、再少 21 次调用,但它会把
# `loaded_skills` / 「指派指导 N 项,实际读到 N 项」那条读数变成空判 ——
# 这个仓库反复栽在「采集了不打印/恒读同一个值的判据」上(见 plan_quality.py 的
# handoff 计数、planner.py 的 chassis= 参数)。少 4.3pp 换一条还活着的观测项,值。
#
# **`pNN.md` 绝对不能进 system 块 —— 这是量出来的,我第一版就是这么写的,错了。**
#
# 这条路由的自动前缀缓存**按整个 `instructions` 字段粗粒度匹配**,不做细粒度的
# 最长公共前缀。证据是基线自己的数(runs/iface8-20260827 第 1 步的命中量):
#     page-12(build-chart) cached=4,139   page-20/21(build-page) cached=4,162
# 同一个 workflow 的页命中量一模一样、不同 workflow 的不一样 —— 因为基线的
# system 块里没有任何按页内容,同 workflow 的 `instructions` 逐字节相同,所以能跨页共享。
#
# 我把 `pNN.md` 拼在 system 块尾部之后,每一页的 `instructions` 都成了独一份,
# **跨页共享被整条掐死**。3 页对照实测(runs/preload-smoke):
#     page-12  步1 cached=15,614 ✓  失效步 cached=15,239 ✓  全价 -48%
#              ← 它命中只是因为前一次单页冒烟用完全相同的块预热过
#     page-20  步1 cached=0 ✗  失效步 cached=0 ✗  全价 +19%
#     page-21  步1 cached=0 ✗  失效步 cached=0 ✗  全价 +37%
# 三页合计付全价只降 3.5%,而仿真按细粒度前缀算出的是 -25.8%。
#
# 所以规矩是:**system 块里只许放同 workflow 逐字相同的东西。**
#     IDENTITY + anti_slop(+philosophy)   ← 21 页逐字相同
#     CHASSIS.md + CONTRACT.md            ← 21 页逐字相同(本次新增)
#     指派 workflow 块                     ← 按 workflow 分组,组内逐字相同
# `pNN.md` 改为拼进 brief(首条 user 消息)。它本来就每页唯一,放那里不损失任何共享;
# 代价只是它会跟着历史在失效步被重付一次(约 1,253 tok/页),
# 远小于换回来的「13.6k 共享块 × 20 页」。
# `theme.css` 2026-08-28 加进来:**把 CSS 源码整份给建页 agent。**
# 在此之前 brief 明令不许打开 assets/ 下的 CSS,唯一通道是 theme.css 自报的
# INTERFACE 块 —— 而那个块因此被迫承担整套视觉系统的声明,一度被推到八节、
# 近 7,000 字符,还配了一道会把整轮判死的硬闸。实测这份 CSS 本身也才 16,467 字符,
# 直接给源码比让它转述一遍更便宜也更准。给了源码之后八节和硬闸就都不需要了。
PRELOAD_TAGS = (("chassis", "CHASSIS.md"), ("theme_css", "theme.css"))

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
    """只取 LIBS.md 开头那张「要做的事 → 引用哪一行」的路由表。

    **不注入 LIBS.md 全文。** 那份 8,321 字符里大半是用法细节(mlp.js 怎么用、
    tf 的适用边界、katex 必须连 CSS 一起引…),按需读就行 —— `prompts/brief.md`
    本来就写着「仅在需要确认库版本时读 LIBS.md」。常驻块里放路由表:
    告诉它有什么、该引哪一行;细节留在一次 `Read` 后面。
    旧流程是让写 CONTRACT 的模型把它压成短表,现在这一步不存在了,改由 harness 切。
    """
    f = root / "pages" / "assets" / "lib" / "LIBS.md"
    if not f.is_file():
        return "(这一轮没有 LIBS.md)"
    text = f.read_text(encoding="utf-8")
    if _LIBS_INDEX not in text:
        return text.strip()          # 格式变了就整份给,别静默给空
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


def shared_preload(root: Path, n_pages: int, prompts: Path = None) -> tuple[str, dict]:
    """21 页共享的那几份。返回(文本, 路径表)。

    路径表给 build_one 做兜底:模型仍然去 Read 这些路径时,回一句指路而不是再灌一遍全文。
    `tech.md` 不进路径表 —— 它是仓库常量,不在 run 目录下,模型没有路径可读。
    """
    paths = {"CHASSIS.md": root / "pages" / "assets" / "CHASSIS.md",
             "theme.css": root / "pages" / "assets" / "theme.css"}
    text = "\n\n".join(_wrap(tag, paths[name]) for tag, name in PRELOAD_TAGS)
    return text + "\n\n" + tech_block(root, n_pages, prompts), paths


def spec_preload(root: Path, pid: str) -> tuple[str, Path]:
    """本页规格 pNN.md。**拼进 brief,不进 system 块** —— 见上面那段实测。"""
    p = root / "pages" / "plan" / f"{pid.replace('page-', 'p')}.md"
    return _wrap("page_spec", p), p


def _preloaded_hit(preloaded: dict | None, args: dict, pages_dir: Path) -> str:
    """这次 `Read` 要的是不是已经预置进 system 块的文件?命中就回它的名字。

    按**解析后的绝对路径**比,不比字符串:brief 给的是绝对路径,而模型也可能
    用相对路径(工作目录是 `pages/assets/..`)或者绕一圈的写法。比字符串会漏,
    而漏了就等于这条兜底不存在。
    """
    if not preloaded:
        return ""
    raw = str(args.get("file_path") or "")
    if not raw:
        return ""
    p = Path(raw)
    try:
        target = (p if p.is_absolute() else pages_dir / p).resolve()
    except OSError:
        return ""
    return preloaded.get(target, "")


def stray(pages_dir: Path) -> list[str]:
    """`pages/` 下既不是 `page-NN.html`、也不在 `assets/` 里的文件。

    **量出来的:** `ape-ds3` 的 pages/ 里留了 10 个 `test_*.html`
    (`test_upper`、`test_dots`、`test_notransform` —— 某页在调缩放和字符渲染),
    `ape-dspro3` 留了 1 个 `page-22-test.html`。后果是实的:
    覆盖闸把它们当页数、`make_deck.py` 把它们拼成幻灯片(实际拼出过 60 页而不是 50)、
    而 `skeletons()` 又不会覆盖同名文件。

    **不做写入白名单。** 实测这三轮里 `Write` 用了 43/86/72 次、`Bash` 用了 260/630 次,
    两条路都能造文件 —— 只堵 Write 只堵住一半。扫一遍目录能同时盖住两条,
    而且是一处实现。
    """
    out = []
    for f in pages_dir.iterdir():
        if f.is_dir():
            continue
        if _PAGE_RE.search(f.name):
            continue
        out.append(f.name)
    return sorted(out)


def build_one(page: Page, pages_dir: Path, trace: Path, skill_root: Path,
              instructions: str, effort: str, compose_effort: str = "",
              preloaded: dict | None = None) -> Page:
    """一页的完整循环。

    历史只增不改 —— 每步追加一个 function_call 和一个 function_call_output。
    Claude Code 每步追加三条,第三条是 `role: system` 的剩余 token 提醒;
    那属于 CLI 自省,状态在 harness 手里,砍掉。
    """
    log = Writer(trace, str(uuid.uuid4()))
    # 开工前先记下已有的野文件 —— 并发时别人留下的不算这一页的账。
    seen_stray = set(stray(pages_dir))
    hist: list = [{"role": "user", "content": page.prompt}]
    spec_full = tools.specs()
    # 整页写过之后就把 `Write` 从工具面里摘掉,而不是等它生成完再拒。
    #
    # **拒绝发生在模型已经把整页内容吐出来之后** —— Sonnet 那次第二个 Write
    # 输出了 7,282 tok,全作废,还要再花一轮改成 Patch。而输出 token 是最贵的一类,
    # 更糟的是它可能一再尝试重写,每次都付这笔钱。工具不在面里就不会去生成。
    #
    # 代价量过:改工具列表会让前缀缓存失效**一次**(实测 100% → 0% → 下一步回到 100%),
    # 每页只发生一次。用一次缓存失效换掉一次(可能多次)整页生成,划算。
    spec_norewrite = [s for s in spec_full if s["name"] != "Write"]
    # 反过来的那一半:**整页写成之前,不给 `Patch` / `Edit`。**
    #
    # 光在 IDENTITY 里写「先 Write」不够 —— 实测 Sonnet 的 page-12 第 6 步用 `Edit`
    # 把骨架从 320 字节改成 5,123 字节,等于用 Edit 做了整页写入,绕开了单次 Write 闸
    # (那条闸只认 Write)。把这两个工具在第一段里摘掉,「先 Write」就从劝导变成
    # 唯一可行路径,而且不浪费任何生成 —— 模型看不见,就不会先去想增量方案。
    spec_compose = [s for s in spec_full if s["name"] not in ("Patch", "Edit")]
    t0 = time.time()

    while True:
        if page.calls >= MAX_STEPS:
            page.why = f"打到步数上限 {MAX_STEPS}"
            page.termination = "max_steps"
            break
        if time.time() - t0 > MAX_SECONDS:
            page.why = f"超过单页时限 {MAX_SECONDS}s"
            page.termination = "max_seconds"
            break

        started = _now()
        # **两档推理:构图一次用高档,之后的修复循环用低档。**
        #
        # 调用之前无法知道这一步会不会是 Write,所以只能按「整页写过没有」分段 ——
        # 写之前那几步是读契约、读 skill、想构图,值得多想;写完之后是对着 Check
        # 的报告一处一处改,那是机械活。实测 Sonnet 的 page-12:第 3 步 Write 之后
        # 的 54 步里,每步输出中位只有 ~400 tok、多是 `Patch ×1`,却全程按高档在推理。
        eff = compose_effort if (compose_effort and not page.wrote) else effort
        spec = spec_norewrite if page.wrote else spec_compose
        r = respond(instructions, hist, spec, eff, tag=page.pid)
        page.calls += 1
        tin, tout, cached = llm.usage_of(r)
        page.tok_in += tin
        page.tok_out += tout
        page.tok_write += llm.cache_write_of(r)
        page.tok_max = max(page.tok_max, tin)
        if cached is not None:
            page.cache_seen = True
            page.tok_cached += cached
        calls = [o for o in r.output if getattr(o, "type", "") == "function_call"]
        log.add([{"type": "text", "text": page.prompt if page.calls == 1 else "(tool results)"}],
                text_of(r),
                # 键名用 wire.Usage 已有的那两个 —— trace.usage_of() 会把未知键
                # 静默丢掉(core/trace.py:97),写 `cached_tokens` 读不回来。
                {"input_tokens": tin, "output_tokens": tout,
                 "cache_read_input_tokens": cached or 0,
                 "cache_creation_input_tokens": llm.cache_write_of(r)},
                getattr(r, "id", None) or f"req_{uuid.uuid4().hex[:16]}",
                started, _now(),
                {"page": page.pid,
                 # 记名字也记关键参数:只记工具名的话,「调了 Skill 11 次」查得到,
                 # 「调了哪个 skill」查不到 —— 而后者才是这一轮要观测的东西。
                 "tools": [{"name": c.name, "arg": _tag_of(c)} for c in calls]})

        if not calls:
            # 模型不再要工具 = 它认为做完了(照抄 Claude Code 的终止条件)。
            # Skill 是给 agent 的指导与事后观测项,不是终止闸。
            # 漏读不再补催、不再把已经停止的 agent 重新拉起来。
            page.ok = True
            page.why = (text_of(r)).strip()[:200]
            page.termination = "no_tool_use"
            break

        print(f"      {page.pid} 步{page.calls:>3}  "
              f"{' '.join(c.name for c in calls)[:52]}", flush=True)
        hist += [_replay(o.model_dump()) for o in r.output]
        for c in calls:
            try:
                args = json.loads(c.arguments or "{}")
            except json.JSONDecodeError as e:
                # 模型把工具参数吐成了畸形 JSON。**这不该让整页死。**
                # 实测:V4-Flash 的 page-24 就是这么丢的 ——
                #   JSONDecodeError: Unterminated string starting at line 1 column 103
                # 参数被截断,通常是那一次输出撞了上限、停在字符串中间。
                # 正常的 agent 循环该把错误当工具输出喂回去,让它重调一次。
                # 而且**必须**喂回去:history 里每个 function_call 都要配一条
                # function_call_output,少一条上游会报 must be passed back to the api
                # (那正好是我们网关抖动特征词里的一条,会被误当成抖动重试八次)。
                print(f"      {page.pid} 工具参数不是合法 JSON,已把错误喂回去让它重调:"
                      f"{e}", flush=True)
                hist.append({"type": "function_call_output", "call_id": c.call_id,
                             "output": f"你这次 {c.name} 的 arguments 不是合法 JSON:{e}。"
                                       f"很可能是参数太长被截断了。把同一个调用重发一次,"
                                       f"内容写短些、分次写。"})
                page.steps.append(f"{c.name}!badjson")
                continue
            page.steps_arg.setdefault(c.name, []).append(_tag_of(c))
            page.steps.append(c.name if c.name != "Bash"
                              else ("SELFCHECK" if "selfcheck" in str(args.get("command", ""))
                                    else "Bash"))
            pre_hit = (_preloaded_hit(preloaded, args, pages_dir)
                       if c.name == "Read" else "")
            # 「本页只装载被指派的那一个 workflow」那道硬拦 2026-08-28 删除。
            # 规划不再逐页指派 workflow(每页只有一段散文,没有 `## 主工作流` 那一行),
            # 改由建页 agent 读完内容自己从清单里挑。挑错的代价是读了一份不太贴的
            # 技法文档;而硬拦的代价是**规划替它做了一个规划看不见的判断** ——
            # 那一行原本由写规格的模型凭一句话猜,现在由真正要动手的 agent 来定。
            if c.name in ("Patch", "Edit") and not page.wrote:
                # 兜底,同上:正路是 spec_compose 把这两个摘掉。
                # 真走到这里说明模型硬喊了一个不在工具面里的工具。
                res = ("整页还没写过 —— 这一段只能用 `Write` 一次落成整页。"
                       "`Patch` / `Edit` 要等整页写出来之后才可用,"
                       "现在用它们等于在空骨架上拼页面,会得到一个半成品。")
            elif (c.name == "Write" and page.wrote
                    and _PAGE_RE.search(str(args.get("file_path", "")))):
                # 兜底。正路是上面把 Write 从工具面里摘掉(spec_norewrite),
                # 那样模型根本不会生成整页内容;但工具不在面里不等于它一定不喊,
                # 所以这条留着 —— 真走到这里说明摘工具那条没生效,值得在 steps 里留痕。
                res = ("本页的整页 `Write` 已经用过一次,不能再覆盖重写。"
                       "现在只能用 `Patch`(一次改好几处,首选)或 `Edit`(改一处)。"
                       "如果你想大改,就把它拆成若干处 Patch —— "
                       "整体覆盖会连已经改对的地方一起冲掉。")
            elif pre_hit:
                # 已经预置进 system 块的那几份,回一句指路,不再灌第二遍全文。
                #
                # **这条兜底是整个预置改动能不能省下钱的前提。** brief 改成了
                # 「不要再 Read」,但提示词管的是意图、不是行为:模型仍然可能出于
                # 「保险」去读一次,而那一次会把同一份内容第二次放进历史 ——
                # 既白付一次全价,又让它重新落到那个会被失效重付的位置上,
                # 等于把这次改动的收益整条抹掉。指路而不是静默回空:
                # 静默会让模型以为文件真的没了,然后自己发明一份契约。
                page.preload_reads.append(pre_hit)
                res = (f"`{pre_hit}` 的全文已经在你的 system 提示里了"
                       f"(标签 `<chassis>` / `<contract>` / `<theme_css>` / `<page_spec>`),"
                       f"内容逐字相同。往上翻即可,不用再 Read —— "
                       f"这一次 Read 没有给你任何新信息。")
            else:
                res = tools.run(c.name, args, pages_dir, skill_root)
                if (c.name == "Write"
                        and _PAGE_RE.search(str(args.get("file_path", "")))):
                    page.wrote = True
                if c.name == "Skill" and args.get("skill"):
                    page.loaded_skills.append(str(args["skill"]))

            # reference / script 的观测项:**对整个 workflow 根解析,不再只认被指派的那一个。**
            # 指派没了,但这两个读数要留着 —— 它们回答的是「装了技法文档之后,
            # 它真的去读分支参考了吗」,而这个问题和谁来选 workflow 无关。
            # 跟着指派一起删会让它们恒读 0,那比没有这个读数更坏。
            if c.name == "Read" and args.get("file_path"):
                path = Path(str(args["file_path"]))
                path = path if path.is_absolute() else pages_dir / path
                try:
                    rel = path.resolve().relative_to(skill_root.resolve())
                    if len(rel.parts) == 3 and rel.parts[1] == "references":
                        page.reference_reads.append("/".join(rel.parts[-2:]))
                except (OSError, ValueError):
                    pass
            if c.name == "Bash":
                command = str(args.get("command", ""))
                for script in sorted(skill_root.glob("*/scripts/*")):
                    if script.is_file() and (str(script) in command
                                             or f"scripts/{script.name}" in command):
                        page.workflow_script_runs.append(script.name)
            out, imgs = ((res.text, res.images) if isinstance(res, tools.Out)
                         else (res, []))
            # 野文件当场喂回去,别等到收尾才发现 —— 和畸形工具参数同一套处理方式:
            # 能说清的问题就说给它,让它自己收拾,不要判死也不要事后由人手动清。
            new_stray = [x for x in stray(pages_dir) if x not in seen_stray]
            if new_stray:
                seen_stray.update(new_stray)
                page.stray += new_stray
                out += ("\n\n⚠ 你在 `pages/` 下建了 " + "、".join(new_stray)
                        + "。**那是交付目录**,里面除了 `page-NN.html` 和 `assets/` "
                          "不该有别的东西 —— 多出来的文件会被当成讲义的一页。"
                          "要临时试就写到 `/tmp/` 下,或者现在删掉。")
            hist.append({"type": "function_call_output", "call_id": c.call_id,
                         "output": out})
            # 图片走**另一条 user 消息**,不塞进 tool_result —— responses 和 chat
            # 两条 wire 的 tool_result 都只装字符串。Opus 那条线是 Read 一张 png
            # 直接回 image 块(632 次 Read 里 455 次是 png),我们这边等价于
            # 「工具回一句话,紧跟一条带图的消息」。
            for mt, b64 in imgs:
                hist.append({"role": "user", "content": [
                    {"type": "input_image", "image_url": f"data:{mt};base64,{b64}"}]})
                page.images += 1
            page.evicted += evict_images(hist, page.tok_max)

    page.seconds = time.time() - t0
    n_sc = page.steps.count("SELFCHECK") + page.steps.count("Check")
    print(f"  {page.pid}  {'✓' if page.ok else '✗'}  {page.calls:>3} 次调用  "
          f"{page.seconds/60:>5.1f} 分  自检 {n_sc:>2}  "
          f"图 {page.images:>2}  skill {page.steps.count('Skill')}  "
          f"{page.why[:60]}", flush=True)
    return page


def main() -> None:
    a = argparse.ArgumentParser()
    a.add_argument("--label", required=True)
    a.add_argument("--only", action="append", help="只跑某几页,可多次给")
    # 并发上限 100 —— config.yaml 顶部那段实测记的就是这条路由的上限,
    # 而默认值一直卡在 50。**排队损耗是纯亏**:22 页并发 8 要排三批,
    # 实测墙钟被长尾页拖到约 45 分钟,而并发拉满时墙钟等于最慢那一页。
    # 注意那段注释里的另一半:20 并发空等 84 分钟是 api.999555999 的账,
    # 不是 paratera 的 —— 别拿那笔账来压这条路由的并发。
    a.add_argument("--concurrency", type=int, default=100)
    a.add_argument("--effort", help="修复循环的推理档(整页写完之后)")
    a.add_argument("--compose-effort",
                   help="构图阶段的推理档(整页 Write 之前);不给就跟 --effort 同档")
    a.add_argument("--skills", default=str(skills.DEFAULT))
    a.add_argument("--workflows", default=str(skills.WORKFLOWS))
    # **默认不注入设计哲学。** 这条是数出来的,原来的说法(下面留着)是错的。
    #
    # 原来的注释写着「lab 那边它经 CLAUDE.md **逐字到达每一个并行 subagent**(抓包实测)」。
    # 把 lab 那条线**全部** 76 个建页 subagent 的轨迹翻了一遍(3 个会话,
    # ~/.claude/projects/-data1-home-zhuyifan-exp-lecture/*/subagents/):
    #
    #   · 哲学正文在 subagent 的 system 提示里出现 **0/76** 次
    #   · 唯一到达路径是编排者把它写进了 PLAN.md,而 subagent 恰好去 Read 了 ——
    #     **17/76**,且全部集中在 `2a85af6c` **一个会话**里
    #   · brief 里提到 Mayer 的 **1/76**,而且是压成了一条具体的禁令
    #     (「不要做要点回顾/总结清单(Mayer 的完成标准是 transfer 不是 retention)」),
    #     不是发一份纲领下去
    #   · **我们照抄结构的那一轮 nn-11(会话 `1f77c220`,43 个 subagent,
    #     唯一读 SHARED.md 的那个会话)—— 43/43 一个字哲学都没看到**
    #
    # 而代价是确定的:整份 5,665 字符 = system 块的 **93%**,`instructions` 每一步重发,
    # 实测占建页阶段输入 token 的 **22%**(第五态 61 次调用里约 244k/1,092k)。
    #
    # 更硬的一条:最大的那块 `page-rhythm`(823 字符)写着「不要把每一个页面理解成
    # 需要被填满的容器」「允许有意保持内容较少的页面」,而 `selfcheck.py` 对同一页硬判
    # 「✗ 画面太空:占用比 41% < 下限 45%」。**同一次请求里,system 块说可以留空,
    # 闸说留空不合格。** 这不是冗余,是互相矛盾的指令。
    #
    # 文件留着不删,`--philosophy prompts/philosophy.md` 随时能把它加回来做对照。
    a.add_argument("--philosophy", default="",
                   help="设计哲学 12 块的路径。**默认不注入**(见代码里的实测)。"
                        "给了路径就整份注入每页 agent 的 system,用来做对照实验。")
    a.add_argument("--model")
    # Anthropic 系必须走 messages 才拿得到 cache_control;走 responses 是全额计费,
    # 而且**不会有任何报错** —— 实测 Sonnet 在 responses 上连打三次前缀,三次 cached=0。
    a.add_argument("--wire", choices=("responses", "chat", "messages"),
                   help="覆盖 wire_api;Anthropic 系模型要用 messages")
    a.add_argument("--rebuild", action="store_true", help="已建好的也重做")
    n = a.parse_args()
    cfg = config()
    builder_cfg = cfg.get("builder", {})
    model = n.model or builder_cfg.get("model") or cfg["model"]["name"]
    effort = n.effort or builder_cfg.get("reasoning_effort", "medium")
    compose_effort = (n.compose_effort or builder_cfg.get("compose_effort", "")
                      or effort)
    llm.override(name=model, wire_api=n.wire)

    root = ROOT / "runs" / n.label
    briefs = json.loads((root / "briefs.json").read_text(encoding="utf-8"))
    workflow_root = Path(n.workflows)
    if not workflow_root.is_dir():
        raise FileNotFoundError(f"--workflows 指的目录不存在: {workflow_root}")
    pages = [page_from_brief(b) for b in briefs]
    if n.only:
        pages = [p for p in pages if p.pid in set(n.only)]
    if not n.rebuild:
        # 已经建好的跳过。和 planner 的 cached() 同一条理由:这条链路会中途挂,
        # 断点续跑是刚需,没道理把已完成的页重烧一遍。--rebuild 强制重做。
        done_already = [p for p in pages
                        if (root / "pages" / f"{p.pid}.html").stat().st_size > 1000]
        if done_already:
            print(f"  跳过已建好的 {len(done_already)} 页: "
                  f"{' '.join(p.pid for p in done_already)}")
        pages = [p for p in pages if p not in done_already]

    # 给了 --philosophy 就整份注入,不挑块 —— 挑了就不是一个干净的对照条件。
    # 路径给错要报错:静默跑一个「以为注入了其实没有」的版本,会让整轮对照白做。
    philosophy = ""
    if n.philosophy:
        pp = Path(n.philosophy)
        if not pp.exists():
            raise FileNotFoundError(f"--philosophy 指的 {pp} 不存在 —— "
                                    f"不注入就别给这个参数,给了就必须能读到")
        philosophy = pp.read_text(encoding="utf-8")
    # 去 AI 味两份是每页都成立的底线,不看 workflow 路由结果 —— 跟 skill_blocks 不同,
    # 这条不走"agent 自己 Read"，直接确定性拼进 system 块，见 skills.anti_slop_block。
    base = (IDENTITY + "\n\n" + skills.anti_slop_block(workflow_root)
            + (("\n\n" + philosophy) if philosophy else ""))
    # **技法清单从此是全局一份,不再按页指派。**
    # 规划那边每页只剩一段散文,没有 `## 主工作流` 那一行了;由建页 agent
    # 读完内容自己挑。`workflow_catalog()` 本来就在(skills.py),原样复用。
    #
    # 副作用是好的:每页的 system 块从此**逐字节相同**,跨页公共前缀不再按
    # workflow 分组 —— 下面那个 `groups` 会从 3 组塌到 1 组。
    catalog = (
        "下面这些技法文档可以用 `Skill` 工具取正文。**先读完本页内容,判断它属于哪一类,"
        "再挑一份读了动手**;清单里没有对应的就自己写,不必硬凑。\n"
        "读完 SKILL.md 要严格执行它顶部的 Reference routing:基础必读项和已选分支项,"
        "都要在任何页面修改前用 `Read` 读取;不要读未选分支或无关 reference。\n\n"
        + skills.workflow_catalog(workflow_root))
    skill_blocks = {p.pid: catalog for p in pages}
    roots = {p.pid: workflow_root for p in pages}
    # ── 确定性备料预置(见 shared_preload 上面那段账)────────────────
    # 共享的两份拼在 base 尾部(仍是 21 页逐字相同的前缀),按页唯一的 pNN.md
    # 拼在指派块之后 —— 顺序不能换,换了跨页公共前缀就被按页内容截断。
    spec_blocks: dict = {}
    preloaded: dict = {}
    if n.preload_docs:
        # 老 run 的目录布局不一样 —— 抽查过:`ape-01` 没有 CONTRACT.md 和 pNN.md,
        # `orbit-01` 没有 CHASSIS.md。预置是**默认开**的,所以缺文件不能让整轮起不来:
        # 断点续跑是刚需(见上面 done_already 那段),为了一个省钱的优化把老 run
        # 的续跑打死是不划算的。**但也不能静默退化** —— 那样就分不清
        # 「预置了」和「以为预置了」,而这正是这个仓库反复栽过的形状。
        # 所以:响亮地说一声,然后按没预置继续。
        try:
            shared, shared_paths = shared_preload(root, len(briefs))
            spec = {p.pid: spec_preload(root, p.pid) for p in pages}
        except FileNotFoundError as e:
            print(f"  ⚠ 预置备料关闭:{e}\n"
                  f"    这一轮按老办法跑(每页自己 Read 那三份)。"
                  f"新 run 不该走到这里 —— 走到了说明 planner 没产出这几份。")
            n.preload_docs = False
        else:
            base = base + "\n\n" + shared
            preloaded = {p.resolve(): name for name, p in shared_paths.items()}
            for p in pages:
                blk, sp = spec[p.pid]
                spec_blocks[p.pid] = blk
                preloaded[sp.resolve()] = sp.name
                # 规格进 brief(首条 user 消息),不进 system 块 —— 见 PRELOAD_TAGS
                # 上面那段:进了 system 块会让每页的 instructions 独一份,
                # 把跨页前缀共享整条掐死(3 页实测 -3.5%,而不是仿真的 -25.8%)。
                p.prompt = p.prompt + "\n\n" + blk
    # brief 和这个开关必须说同一件事。**不一致是 fail-wrong,不是不方便:**
    # brief 里写着「三份已在 system 提示里,不要再 Read」而实际没预置,模型会去找
    # `<chassis>`、找不到、然后自己发明一份契约 —— 而它不会报错。
    # briefs.json 是 planner 烧进去的,所以对照臂要么配一份旧模板
    # (Run.prompts 支持换目录),要么就别用 --no-preload-docs 跑新 brief。
    if not n.preload_docs and any("<chassis>" in p.prompt for p in pages):
        print("  ⚠ brief 说三份材料已在 system 提示里,但这一轮没有预置 —— "
              "两边不一致。\n    模型会去找 `<chassis>` 而找不到,可能自己编一份契约。"
              "对照臂请用旧 brief 模板(Run.prompts 可换目录)重生成 briefs.json。")
    sb = sorted(len(v) for v in skill_blocks.values()) or [0]
    # 同 workflow 的 system 块必须逐字相同,所以这里报的是**按 workflow 分组的组数**
    # 和每组的块长 —— 组数就是跨页缓存能分几摊。组内出现不同长度就说明混进了按页内容。
    groups = Counter(base + "\n\n" + skill_blocks[p.pid] for p in pages)
    per_page = sorted(len(k) for k in groups) or [0]
    print(f"\n▸ builder · {n.label}\n  {len(pages)} 页,并发 {n.concurrency},"
          f"model={model},effort={compose_effort}(构图)/{effort}(修复)\n"
          f"  技法清单 {sb[-1]:,} 字符(全局一份,各页自选)"
          f"\n"
          f"  system 块 {len(base):,} 字符"
          f"({'含设计哲学 ' + str(len(philosophy)) + ' 字符' if philosophy else '不含设计哲学'}"
          f"{'；已预置 CHASSIS+CONTRACT' if n.preload_docs else '；未预置备料'})\n"
          f"  完整 system {per_page[0]:,}–{per_page[-1]:,} 字符,"
          f"按 workflow 分 {len(groups)} 组共享(组内逐字相同,跨页缓存分这几摊)"
          f"{'；本页规格已拼进 brief' if spec_blocks else ''}\n")

    t0 = time.time()
    def guard(p):
        """一页崩掉不许带走整轮。

        实测:一个 subagent 撞上网关的 fallback 型 400,异常经 ThreadPoolExecutor.map
        传出来,**整个 builder 停掉、剩下 38 路一起没了** —— 52 页只交付 21 页。
        每页本来就是独立的一次尝试,单页失败该记下来继续,而不是全局判死。
        """
        try:
            # instructions 到这里为止只含同 workflow 逐字相同的内容 —— 本页规格
            # 已经在上面拼进 p.prompt 了,不能再往 system 块里加任何按页不同的东西。
            return build_one(p, root / "pages", root / "trace.jsonl",
                             roots[p.pid], base + "\n\n" + skill_blocks[p.pid],
                             effort, compose_effort, preloaded)
        except Exception as e:                     # noqa: BLE001
            p.why = f"{type(e).__name__}: {str(e)[:90]}"
            p.termination = "agent_exception"
            print(f"  {p.pid}  ✗ 这一页崩了,不影响其它页: {p.why}", flush=True)
            return p

    with ThreadPoolExecutor(max_workers=n.concurrency) as ex:
        done = list(ex.map(guard, pages))

    ok = [p for p in done if p.ok]
    # `or [0]` 和上面 `sb` 那行同一个理由:整轮全被 done_already 跳过时 done 是空的,
    # 而 `calls[0]` 会抛 IndexError —— 于是一次合法的空操作(对已建好的 run 再跑一次)
    # 以一段 traceback 收场,连 steps.json 都写不出来。
    calls = sorted(p.calls for p in done) or [0]
    print(f"\n  {len(ok)}/{len(done)} 页交付   墙钟 {(time.time()-t0)/60:.1f} 分")
    print(f"  每页调用数 {calls[0]}–{calls[-1]},中位 {calls[len(calls)//2]}   "
          f"合计 {sum(calls)}")
    print(f"  自检合计 {sum(p.steps.count('SELFCHECK') + p.steps.count('Check') for p in done)}"
          f"(Check {sum(p.steps.count('Check') for p in done)} / "
          f"经 Bash {sum(p.steps.count('SELFCHECK') for p in done)})   "
          f"Patch {sum(p.steps.count('Patch') for p in done)}   "
          f"Edit {sum(p.steps.count('Edit') for p in done)}   "
          f"Skill 合计 {sum(p.steps.count('Skill') for p in done)}")
    n_img = sum(p.images for p in done)
    print(f"  进上下文的图 {n_img} 张(每页 {n_img / max(1, len(done)):.1f};"
          f"Opus 那条线是 6.0),被挤出 {sum(p.evicted for p in done)} 张")
    t_in = sum(p.tok_in for p in done)
    t_ca = sum(p.tok_cached for p in done)
    t_mx = max((p.tok_max for p in done), default=0)
    if not any(p.cache_seen for p in done):
        # 不报和没命中要分得开 —— 报 0% 会让人以为缓存失效,其实是这条路由不给数。
        print(f"  输入 {t_in:,} tok,峰值 {t_mx:,}   ⚠ 这条路由没报 cached_tokens,命中率未知")
    else:
        print(f"  输入 {t_in:,} tok,峰值 {t_mx:,}   缓存命中 {t_ca:,} "
              f"({t_ca / max(t_in, 1) * 100:.0f}%)")
    # 各页**自选**了哪份 workflow。指派没了,这个分布就是新的观测项 ——
    # 它回答「让 agent 自己挑,挑出来的是什么形状」,以及有没有页面一份都不读。
    picked = Counter(x for p in done for x in p.loaded_skills)
    none_read = [p.pid for p in done if not p.loaded_skills]
    print(f"  自选 workflow  {dict(picked) or '无'}"
          f"{('；一份都没读: ' + ' '.join(none_read)) if none_read else ''}")
    print(f"  reference 读取 {sum(len(p.reference_reads) for p in done)} 次，"
          f"workflow script {sum(len(p.workflow_script_runs) for p in done)} 次")
    # 预置到底省没省下那 3 次往返 —— 这是本次改动唯一的行为性判据。
    # 不为零说明 brief 那几句没管住,收益要按实测重算,别拿仿真的 -25.8% 交差。
    if n.preload_docs:
        pr = Counter(x for p in done for x in p.preload_reads)
        n_pr = sum(pr.values())
        if n_pr:
            print(f"  ⚠ 已预置的文件仍被 Read {n_pr} 次"
                  f"({', '.join(f'{k}×{v}' for k, v in pr.most_common())})"
                  f" —— 每次都白花一次往返,brief 的措辞没管住,预置收益要按实测重算")
        else:
            print(f"  ✓ 预置生效:没有一页去重读 CHASSIS/CONTRACT/pNN"
                  f"(省下约 {len(done) * 3} 次搬运往返)")
    # ── 把每页做过什么落盘。**这是量出来必须补的。** ──────────────
    # `trace.jsonl` 里 2,836 个块**全是 text,一个 tool_use 都没有** —— 它不记工具调用。
    # 于是「哪次 Read 读了哪个文件」磁盘上没有记录,而 `page.steps_arg` 一直只在内存里。
    # 代价是实的:我曾从 trace 里 grep 出「webmedia.py 8 次」当成调用次数,
    # 那其实是这个字符串在**文本块**里出现的次数(提示词、skill 文档正文、模型的散文都算进去了)。
    # 上下文瘦身那条改动的判据是「CHASSIS.md 的引用次数」——
    # 没有这份文件就根本没法判它有没有生效。
    steps = {p.pid: {"ok": p.ok, "calls": p.calls, "seconds": round(p.seconds, 1),
                     "steps": p.steps, "args": p.steps_arg,
                     "stray": p.stray,
                     "images": p.images, "evicted": p.evicted,
                     "tok_in": p.tok_in, "tok_cached": p.tok_cached,
                     "tok_write": p.tok_write, "tok_out": p.tok_out,
                     "tok_max": p.tok_max,
                     "cache_reported": p.cache_seen,
                     "loaded_skills": p.loaded_skills,
                     "reference_reads": p.reference_reads,
                     "workflow_script_runs": p.workflow_script_runs,
                     "preload_reads": p.preload_reads,
                     "termination": p.termination,
                     "why": p.why} for p in done}
    (root / "steps.json").write_text(
        json.dumps(steps, ensure_ascii=False, indent=1), encoding="utf-8")
    reads = Counter()
    for p in done:
        for t in p.steps_arg.get("Read", []):
            reads[t] += 1
    top = "  ".join(f"{k} {v}" for k, v in reads.most_common(6))
    print(f"  读取次数(前 6):{top or '无'}")
    n_stray = sorted({x for p in done for x in p.stray})
    if n_stray:
        print(f"  ⚠ pages/ 下多出 {len(n_stray)} 个非页面文件: {' '.join(n_stray[:8])}"
              f"  —— 会被当成讲义的一页,已在过程中提醒过对应的页")
    for p in done:
        if not p.ok:
            print(f"  ✗ {p.pid}: {p.why}")


if __name__ == "__main__":
    main()
