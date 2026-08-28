"""builder 的工具面。

给哪几个,是数出来的。lab 那条线**全部**建页 subagent 的轨迹数完了 ——
3 个会话、**76 个建页 agent、1,688 次工具调用** —— 它们用过的只有四个工具:

    Bash 1,024(command 1024 / description 235) · Read 632(只用过 file_path)
    Write 27 · Edit 5

没有 Monitor、没有 run_in_background、没有 Grep/Glob/WebFetch,Read 也从没用过
offset/limit。(这个文件以前写着「nn-06 用了 5 个,含 Monitor」—— 那是**单轮**的数。)
所以名字上我们本来就是超集:Read/Write/Edit/Bash 再加一个我们自己的 Skill。

**不完备的地方在四个工具的行为里,只有一处,但它是最大的一处:Read 读不了图。**
Opus 那 632 次 Read 里 **455 次是 `.png`(72%)**、3 次 `.jpg` —— 折合每页看 6 张图,
文件名说明它在看什么:page-NN.png 196 · page-NN-afterNN.png 72(交互之后的状态) ·
crop/marked/lit 一批(裁出来放大的局部)。而我们这边 Read 是 `read_text` ——
喂一张 png 进去会回 30,000 个替换字符,比不给更坏。实测我们 g17 的 374 次 Read
一张图都没有,`--shot` 只用过 1 次 / 304 次自检(0.3%),Opus 是 338 / 595(57%)。
不是模型不想看,是这条路不通。现在通了(`Out.images` → builder 追加一条带图消息)。

另外三个工具(Check / Patch / Look)不是 Opus 缺的工具,是它**每页用 Bash 现搓**
的三段代码,这里固化成工具,做法不改:

    Check ← 595 条 selfcheck 的 shell 拼装(其中 305 条在手工 `| head/tail` 自己的报告)
    Patch ← 279 条 `python3 - <<PY  s=s.replace(old,new)`,63% 一条改 ≥2 处、
            39% 带 `assert old in s`、**82% 同一条命令里紧跟 selfcheck**
    Look  ← 37 条 `Image.open(shot).crop(box).resize(box*zoom)`,分布在 11 页

Bash 不设白名单。审计过那 1,024 次的真实用途:

    selfcheck 595 · 原地改页 279 · cat/sed 读回自己的页 263 · grep 60 · ls 33

白名单要覆盖这些就等于放开全部,挡住任何一类都会逼模型绕路 —— 禁掉 heredoc
它就没法做轨道数值验算。改成三条护栏:cwd 钉死、超时、输出截断。
这不是沙箱:模型仍然写得到目录外。忠实照抄和绝对安全在这里不可兼得。
"""

from __future__ import annotations

import base64
import io
import re
import subprocess
import sys
import threading
from dataclasses import dataclass, field
from pathlib import Path

from . import skills

CAP = 30_000  # 普通 tool_result 的字符上限。实测 nn-06 最大一个 679,500 字符,
              # 不截断的话一次就把上下文灌爆。
WORKFLOW_REFERENCE_CAP = 160_000
TIMEOUT = 120
SHOT_TIMEOUT = 300   # 渲染要起无头 Chromium,还可能带几个 --after 状态,给宽一点

IMG_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif"}

# ── 越界访问 ────────────────────────────────────────────────────────
# 上面那段说三条护栏是「cwd 钉死、超时、输出截断」,但 **`cd` 一下 cwd 就不算数了**。
# 2026-08-28 实测(sonB 那轮 page-06 的 44 次 Bash):模型 `cd` 去别的 run 目录
# `cat` 页面、`diff` 两个 run 的 CHASSIS.md、`echo BASHTEST >` 往别的 run 写文件。
# 同一天 Sonnet 全量那轮 page-06 花了 46 步、43 次 Bash,**一次 Write 都没有**。
#
# 所以这不是新加一条策略,是把已经声明过的那条护栏补成真的:
#     本页只能碰自己 run 的 pages/,page-*.html 里只能碰自己那一页。
#
# **仍然不是沙箱,也不是白名单。** 限制的是**位置**不是**能跑什么命令** ——
# 上面拒绝给 Bash 上白名单的理由(挡住任何一类都会逼模型绕路)照旧成立:
# selfcheck、原地改页、cat/sed 读回自己的页、grep、ls 全在 run 目录内,一个不受影响。
# `cat page-0*.html` 这种通配符、变量拼接、heredoc 里的 python 都挡不住 ——
# 挡的是老实写法。模型不是对手,是在照指令行事,挡住老实写法就够。
_PAGE_FILE = re.compile(r"page-\d+\.html")
# 绝对路径必须是**一个 token 的开头**。写成 `/[\w./-]+` 会把 `assets/lib/mlp.js`
# 里那个斜杠当成绝对路径 `/lib/mlp.js`,于是正常的相对读被误拦 —— 这个坑踩过一次。
_ABS_PATH = re.compile(r"(?:^|[\s'\"=(:])(/[\w./-]+)")
# 正文型参数不参与判定:它们是**内容**不是**引用**。页面正文里出现 `page-05.html`
# 字样(比如写进一个链接)不该被当成跨页访问。
# 用「排除正文型」而不是「枚举引用型」是故意的 —— 将来新工具带引用参数会自动被管住
# (fail-closed);带正文参数最多误拦一次,看得见、改得动。
_CONTENT_KEYS = frozenset({"content", "old_string", "new_string", "edits"})


def _out_of_bounds(args: dict, cwd: Path, pid: str) -> str | None:
    """→ 越界的那个东西(用于拒绝语),没越界就 None。"""
    root = cwd.resolve()
    for k, v in args.items():
        if k in _CONTENT_KEYS:
            continue
        s = str(v)
        if k == "command":
            # Bash 只能扫命令串 —— 逃出 run 目录的绝对路径就拒。
            outside = [p for p in _ABS_PATH.findall(s)
                       if not Path(p).resolve().is_relative_to(root)]
        else:
            # 路径型参数能解析,就精确判。**只比基名挡不住「别的 run 里的同名页」。**
            outside = [] if (cwd / s).resolve().is_relative_to(root) else [s]
        if outside:
            return f"{outside[0]}(在本页的 run 目录之外)"
        for m in _PAGE_FILE.findall(s):
            if m != f"{pid}.html":
                return m
    return None
IMG_MAX_W = 1600     # 比这更宽的图先缩到这个宽度再进上下文。素材图有 3000px 的,
                     # 原样 base64 一张就能顶掉半个上下文,而看清版面并不需要那些像素。
MAX_IMAGES = 2       # 一次工具调用最多内联几张图。builder 那边 hist 只留最近 2 张
                     # (见 builder.evict_images),一次回 4 张的话前两张会在下一次
                     # 请求前就被挤掉 —— 等于白算。多出来的**报出路径**让它自己 Read,
                     # 不静默丢弃:静默丢弃正是这一轮修的那个 bug 的形状。

SELFCHECK = "assets/selfcheck.py"


@dataclass
class Out:
    """一次工具调用的结果。

    `images` 非空时 builder 会在 `function_call_output` 之后**再追加一条带图的
    user 消息** —— tool_result 本身在 responses 和 chat 两条 wire 上都只装字符串。
    """

    text: str
    images: list[tuple[str, str]] = field(default_factory=list)  # (media_type, base64)


def _cap(s: str, cap: int = CAP) -> str:
    return s if len(s) <= cap else s[:cap] + f"\n…（已截断，原文 {len(s):,} 字符）"


def _is_workflow_reference(path: Path, skill_root: Path) -> bool:
    """A routed workflow reference is a deliberate one-shot context load."""
    try:
        rel = path.resolve().relative_to(skill_root.resolve())
    except (OSError, ValueError):
        return False
    return (len(rel.parts) == 3 and rel.parts[1] == "references"
            and path.suffix.lower() == ".md")


SCHEMAS = [
    {"name": "Read", "description":
        "读一个文件。普通文本回带行号的内容;png/jpg 回图片本身。"
        "工作流 references/*.md 总是一次返回全文并明确标记 EOF,不要分段重读。",
     "parameters": {"type": "object", "properties": {
         "file_path": {"type": "string", "description": "绝对路径"},
         "offset": {"type": "integer", "description": "从第几行开始读"},
         "limit": {"type": "integer", "description": "读多少行"}},
         "required": ["file_path"], "additionalProperties": False}},
    {"name": "Write", "description": "写文件,已存在则整体覆盖。",
     "parameters": {"type": "object", "properties": {
         "file_path": {"type": "string", "description": "绝对路径"},
         "content": {"type": "string", "description": "完整内容"}},
         "required": ["file_path", "content"], "additionalProperties": False}},
    {"name": "Edit", "description": "精确字符串替换。old_string 必须唯一匹配,否则失败。"
                                    "要一次改好几处就用 Patch。",
     "parameters": {"type": "object", "properties": {
         "file_path": {"type": "string", "description": "绝对路径"},
         "old_string": {"type": "string", "description": "要被替换的原文"},
         "new_string": {"type": "string", "description": "替换成什么"},
         "replace_all": {"type": "boolean", "description": "替换全部出现处"}},
         "required": ["file_path", "old_string", "new_string"], "additionalProperties": False}},
    {"name": "Patch", "description":
        "一次改页面里的好几处,然后默认立刻重新自检。"
        "任何一处的 old 找不到就整批不写,并告诉你是哪一处 —— 不会改一半。"
        "这是改页的首选:比一处一次地 Edit 少几倍来回。",
     "parameters": {"type": "object", "properties": {
         "page": {"type": "string", "description": "页面文件名,例 page-07.html"},
         "edits": {"type": "array", "description": "要替换的若干处,按顺序应用",
                   "items": {"type": "object", "properties": {
                       "old": {"type": "string", "description": "原文,要能在文件里找到"},
                       "new": {"type": "string", "description": "替换成什么"}},
                       "required": ["old", "new"], "additionalProperties": False}},
         "check": {"type": "boolean", "description": "改完是否立刻自检,默认 true"}},
         "required": ["page", "edits"], "additionalProperties": False}},
    {"name": "Check", "description":
        "把页面真渲染一遍并报告:JS 报错、超出画布、被裁、字号地板、画面占用比。"
        "after 每给一段 JS 就**多测一个状态**(点按钮、拖滑块),交互之后的版面同样要合格。",
     "parameters": {"type": "object", "properties": {
         "page": {"type": "string", "description": "页面文件名,例 page-07.html"},
         "after": {"type": "array", "items": {"type": "string"},
                   "description": "在页面里依次跑的 JS,每段之后重测一遍。"
                                  "例 [\"document.getElementById('go').click()\"]"},
         "shot": {"type": "boolean", "description": "顺便把 800×450 的整页截图给你看"}},
         "required": ["page"], "additionalProperties": False}},
    {"name": "Look", "description":
        "把画面里的一块裁出来放大看。box 用 Check 报告里 @x,y w×h 那四个数。"
        "看不清某处到底怎么了就用这个,不要靠猜。box 给小一点(一个元素左右),整页看用 Check 的 shot。",
     "parameters": {"type": "object", "properties": {
         "page": {"type": "string", "description": "页面文件名,例 page-07.html"},
         "box": {"type": "array", "items": {"type": "integer"},
                 "description": "[x, y, w, h],1600×900 画布里的坐标"},
         "after": {"type": "array", "items": {"type": "string"},
                   "description": "先跑这几段 JS 再裁,用来看交互之后的样子"},
         "zoom": {"type": "integer", "description": "放大倍数,默认 2"}},
         "required": ["page", "box"], "additionalProperties": False}},
    {"name": "Bash", "description": f"执行 shell 命令。工作目录固定为该页所在的 pages/,超时 {TIMEOUT}s。",
     "parameters": {"type": "object", "properties": {
         "command": {"type": "string", "description": "要执行的命令"},
         "description": {"type": "string", "description": "一句话说明这条命令做什么"}},
         "required": ["command"], "additionalProperties": False}},
    {"name": "Skill", "description": "取一份技法文档的正文。名字从清单里选。",
     "parameters": {"type": "object", "properties": {
         "skill": {"type": "string", "description": "skill 名字"}},
         "required": ["skill"], "additionalProperties": False}},
]


def specs() -> list[dict]:
    return [{"type": "function", **s} for s in SCHEMAS]


def run(name: str, args: dict, cwd: Path, skill_root: Path, pid: str) -> str | Out:
    """`pid` 是本页的 id(形如 `page-06`),**必填**。

    不给默认值是故意的:默认值等于「忘了传就静默不设防」,而静默退化正是这个仓库
    反复栽过的形状 —— 分不清「设防了」和「以为设防了」。
    """
    off = _out_of_bounds(args, cwd, pid)
    if off:
        return (f"拒绝:`{off}` 不在你负责的范围内。你只负责 `{pid}.html`,"
                f"只能读写自己 run 的 `pages/` 目录。\n"
                f"别的页现在多半还是空骨架 —— 整套是并发建的,它不一定已经建好;"
                f"而且照抄邻页会让整套页面长得一个样。\n"
                f"这一页要用的数据、文字和边界都在 brief 的 `<page_spec>` 里,"
                f"库的用法在 `assets/lib/LIBS.md`。")
    try:
        r = _dispatch(name, args, cwd, skill_root)
        cap = CAP
        if name == "Read" and args.get("file_path") \
                and _is_workflow_reference(Path(args["file_path"]), skill_root):
            cap = WORKFLOW_REFERENCE_CAP
        return Out(_cap(r.text, cap), r.images) if isinstance(r, Out) else _cap(r, cap)
    except Exception as e:  # 工具出错要回给模型让它自己修,不能把循环打断
        return f"{type(e).__name__}: {e}"


# ── 图片 ────────────────────────────────────────────────────────────
def _image(p: Path) -> Out:
    """一张图 → 可以进上下文的 base64。

    比 IMG_MAX_W 宽的先缩。这不是省钿,是防灌爆:`assets/img/` 里有 3000px 的素材,
    原样一张 base64 就能顶掉半个上下文,而判版面并不需要那些像素。
    """
    from PIL import Image

    im = Image.open(p)
    w, h = im.size
    note = ""
    if w > IMG_MAX_W:
        im = im.convert("RGB").resize((IMG_MAX_W, round(h * IMG_MAX_W / w)), Image.LANCZOS)
        note = f",已从 {w}×{h} 缩到 {im.width}×{im.height} 再给你"
    buf = io.BytesIO()
    im.save(buf, "PNG")
    b = buf.getvalue()
    return Out(f"{p.name}({im.width}×{im.height},约 {im.width * im.height // 750} token{note})",
               [("image/png", base64.b64encode(b).decode())])


# ── 自检 ────────────────────────────────────────────────────────────
# 每页最近一次 Check 的计数,给 Patch 做「改前 → 改后」的差。
# builder 是每页一个线程,键是页面的绝对路径,所以同一个键不会被两个线程写。
_LAST: dict[str, dict] = {}
_LOCK = threading.Lock()

_COUNT_RE = {
    "超出画布": re.compile(r"✗ 超出画布"),
    "被裁": re.compile(r"✗ 被裁"),
    "JS 报错": re.compile(r"✗ (?:JS 报错|console\.error)"),
    "资源加载失败": re.compile(r"✗ 资源加载失败"),
}


def _counts(report: str) -> dict:
    """从报告的**初始状态那一段**里取几个可比的数。交互后的状态不算进来 ——
    那几段的多少取决于这次给了几个 after,拿来做差会得出假的「变好了」。"""
    head = report.split("┄", 1)[0]
    d = {k: len(r.findall(head)) for k, r in _COUNT_RE.items()}
    m = re.search(r"画面占用 (\d+)%", head)
    d["占用%"] = int(m.group(1)) if m else None
    m = re.search(r"文字叠压 (\d+) 处", head)
    d["文字叠压"] = int(m.group(1)) if m else 0
    return d


def _delta(page_key: str, report: str) -> str:
    """和上一次 Check 比。**只报变了的项** —— 没变的项写出来只是噪声。"""
    now = _counts(report)
    with _LOCK:
        was = _LAST.get(page_key)
        _LAST[page_key] = now
    if not was:
        return ""
    parts = [f"{k} {was[k]} → {now[k]}" for k in now
             if was.get(k) != now[k] and was.get(k) is not None and now[k] is not None]
    return ("\n和上次自检相比:" + "、".join(parts)) if parts else "\n和上次自检相比:这几项没变"


def _selfcheck(cwd: Path, page: str, after=(), shot=False, crop=None, zoom=2) -> str:
    if not (cwd / SELFCHECK).exists():
        return f"失败:找不到 {SELFCHECK} —— 自检脚本应该在 pages/assets/ 下"
    if not (cwd / page).exists():
        return f"失败:{page} 不存在。页面文件名形如 page-07.html"
    cmd = [sys.executable, SELFCHECK, page]
    # 截图存到 pages/ **外面**。存里面会被 builder 的野文件闸当成讲义的一页。
    shots = cwd.parent / ".shots"
    if shot or crop:
        cmd += ["--shot", "--shot-dir", str(shots)]
    if crop:
        cmd += ["--crop", ",".join(str(int(v)) for v in crop), "--zoom", str(int(zoom))]
    for js in after or ():
        cmd += ["--after", js]
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=SHOT_TIMEOUT)
    return ((r.stdout or "") + (("\n[stderr]\n" + r.stderr) if r.stderr else "")).strip() \
        or f"(自检没有输出,退出码 {r.returncode})"


def _shot_paths(report: str, kind: str) -> list[Path]:
    return [Path(m) for m in re.findall(rf"^\s*{kind} (\S+\.png)", report, re.M)]


def _check(cwd: Path, a: dict) -> Out:
    page = str(a["page"])
    rep = _selfcheck(cwd, page, a.get("after") or (), shot=bool(a.get("shot")))
    rep += _delta(str((cwd / page).resolve()), rep)
    imgs: list[tuple[str, str]] = []
    if a.get("shot"):
        shots = [p for p in _shot_paths(rep, "截图") if p.exists()]
        for p in shots[:MAX_IMAGES]:
            imgs += _image(p).images
        if len(shots) > MAX_IMAGES:
            rep += ("\n（只把前 " + str(MAX_IMAGES) + " 张图给你了，其余的要看就单独 Read："
                    + "、".join(str(p) for p in shots[MAX_IMAGES:]) + "）")
    return Out(rep, imgs)


def _look(cwd: Path, a: dict) -> Out:
    box = a.get("box") or []
    if len(box) != 4:
        return Out("失败:box 要给四个数 [x, y, w, h]。Check 报告里 @x,y w×h 就是这四个。")
    rep = _selfcheck(cwd, str(a["page"]), a.get("after") or (), crop=box,
                     zoom=int(a.get("zoom") or 2))
    crops = [p for p in _shot_paths(rep, "裁图") if p.exists()]
    if not crops:
        return Out(rep + "\n\n(没裁出图 —— box 可能整块落在画布外,或者页面根本没渲染出来)")
    lines, imgs = [], []
    for p in crops[:MAX_IMAGES]:
        o = _image(p)
        lines.append(o.text)
        imgs += o.images
    if len(crops) > MAX_IMAGES:
        lines.append(f"(另外 {len(crops) - MAX_IMAGES} 张没内联,要看单独 Read:"
                     + "、".join(str(p) for p in crops[MAX_IMAGES:]) + ")")
    return Out("裁出来放大给你看:" + "、".join(lines) + "\n\n" + rep, imgs)


# ── 改页 ────────────────────────────────────────────────────────────
def _patch(cwd: Path, a: dict) -> str | Out:
    """一次改好几处。

    照 lab 那条线的做法:每处 `s.replace(old, new)` 替换**全部**出现处,
    但**任何一处的 old 找不到就整批不写** —— 那就是它 279 条里 109 条
    `assert old in s` 干的事。逐处回报命中几次,免得一个 old 意外命中五处而没人看见。
    """
    page = str(a["page"])
    p = cwd / page
    if not p.exists():
        return f"失败:{page} 不存在。页面文件名形如 page-07.html"
    edits = a.get("edits") or []
    if not edits:
        return "失败:edits 是空的,没有要改的东西"

    s = p.read_text(encoding="utf-8")
    hits, miss = [], []
    for i, e in enumerate(edits, 1):
        old = e.get("old", "")
        n = s.count(old) if old else 0
        hits.append(n)
        if n == 0:
            miss.append(f"第 {i} 处:«{(old or '')[:60]}…» 在 {page} 里找不到")
    if miss:
        return ("失败,一处都没改(整批不写,免得改一半):\n  " + "\n  ".join(miss) +
                "\n先 Read 一下当前内容,照原文一字不差地给 old。")

    for e in edits:
        s = s.replace(e["old"], e.get("new", ""))
    p.write_text(s, encoding="utf-8")
    tail = "、".join(f"第 {i} 处 {n} 次" for i, n in enumerate(hits, 1) if n != 1)
    msg = (f"{page} 改了 {len(edits)} 处,共 {sum(hits)} 次替换"
           + (f"(注意有的不止一次:{tail})" if tail else "") + "。")

    if a.get("check", True) is False:
        return msg
    rep = _selfcheck(cwd, page)
    return msg + _delta(str(p.resolve()), rep) + "\n\n" + rep


# ── 分发 ────────────────────────────────────────────────────────────
def _dispatch(name: str, a: dict, cwd: Path, skill_root: Path) -> str | Out:
    if name == "Read":
        p = Path(a["file_path"])
        if p.suffix.lower() in IMG_EXT:
            return _image(p)
        if _is_workflow_reference(p, skill_root):
            text = p.read_text(encoding="utf-8", errors="replace")
            n = text.count("\n") + 1
            return (f"（工作流 reference 全文开始：{p.name}，共 {n} 行）\n"
                    + text
                    + f"\n（工作流 reference 全文结束：{p.name} · EOF）")
        lines = p.read_text(encoding="utf-8", errors="replace").split("\n")
        off = max(0, int(a.get("offset") or 1) - 1)
        lines = lines[off:off + int(a.get("limit") or 2000)]
        return "\n".join(f"{off + i + 1:6}\t{l}" for i, l in enumerate(lines))

    if name == "Write":
        p = Path(a["file_path"])
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(a["content"], encoding="utf-8")
        return f"已写入 {p}({len(a['content']):,} 字符)"

    if name == "Edit":
        p = Path(a["file_path"])
        s = p.read_text(encoding="utf-8")
        old, new = a["old_string"], a["new_string"]
        n = s.count(old)
        if n == 0:
            return "失败:old_string 在文件里找不到。先 Read 确认当前内容。"
        if n > 1 and not a.get("replace_all"):
            return f"失败:old_string 出现了 {n} 次,不唯一。加长上下文,或用 replace_all。"
        p.write_text(s.replace(old, new) if a.get("replace_all") else s.replace(old, new, 1),
                     encoding="utf-8")
        return f"已替换 {n if a.get('replace_all') else 1} 处"

    if name == "Patch":
        return _patch(cwd, a)

    if name == "Check":
        return _check(cwd, a)

    if name == "Look":
        return _look(cwd, a)

    if name == "Bash":
        r = subprocess.run(a["command"], shell=True, cwd=cwd, capture_output=True,
                           text=True, timeout=TIMEOUT)
        out = (r.stdout or "") + (("\n[stderr]\n" + r.stderr) if r.stderr else "")
        return out.strip() or f"(无输出,退出码 {r.returncode})"

    if name == "Skill":
        return skills.load(a["skill"], skill_root)

    return f"未知工具 {name}"
