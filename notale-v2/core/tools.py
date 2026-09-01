"""Small, workspace-scoped tool surface for page Builders."""

from __future__ import annotations

import base64
import io
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

CAP = 30_000  # 普通 tool_result 的字符上限。实测 nn-06 最大一个 679,500 字符,
              # 不截断的话一次就把上下文灌爆。
WORKFLOW_RESOURCE_CAP = 160_000
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


def _out_of_bounds(
    name: str,
    args: dict,
    cwd: Path,
    pid: str,
    resource_root: Path | None = None,
) -> str | None:
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
            target = (Path(s) if Path(s).is_absolute() else cwd / s).resolve()
            allowed_resource = (
                name == "Read"
                and _is_workflow_resource(target, resource_root)
            )
            outside = [] if target.is_relative_to(root) or allowed_resource else [s]
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


def _is_workflow_resource(path: Path, resource_root: Path | None) -> bool:
    """References and generated sample bundles are deliberate full-file reads."""
    if resource_root is None:
        return False
    try:
        rel = path.resolve().relative_to(resource_root.resolve())
    except (OSError, ValueError):
        return False
    return (
        path.suffix.lower() == ".md"
        and (
            (len(rel.parts) == 2 and rel.parts[0] == "references")
            or (len(rel.parts) >= 3 and rel.parts[:2] == ("samples", "bundles"))
        )
    )


SCHEMAS = [
    {"name": "Read", "description":
        "读一个文件。普通文本回带行号的内容;png/jpg 回图片本身。"
        "工作流 references/*.md 总是一次返回全文并明确标记 EOF,不要分段重读。",
     "parameters": {"type": "object", "properties": {
         "file_path": {"type": "string", "description": "相对 pages/ 的路径；也接受绝对路径"},
         "offset": {"type": "integer", "description": "从第几行开始读"},
         "limit": {"type": "integer", "description": "读多少行"}},
         "required": ["file_path"], "additionalProperties": False}},
    {"name": "Write", "description":
        "写入完整文件，适合首次创建或确需整体重构；已有页面的局部修正优先用 Patch/Edit。",
     "parameters": {"type": "object", "properties": {
         "file_path": {"type": "string", "description": "相对 pages/ 的路径；也接受绝对路径"},
         "content": {"type": "string", "description": "完整内容"}},
         "required": ["file_path", "content"], "additionalProperties": False}},
    {"name": "Edit", "description": "精确字符串替换。old_string 必须唯一匹配,否则失败。"
                                    "要一次改好几处就用 Patch。",
     "parameters": {"type": "object", "properties": {
         "file_path": {"type": "string", "description": "相对 pages/ 的路径；也接受绝对路径"},
         "old_string": {"type": "string", "description": "要被替换的原文"},
         "new_string": {"type": "string", "description": "替换成什么"},
         "replace_all": {"type": "boolean", "description": "替换全部出现处"}},
         "required": ["file_path", "old_string", "new_string"], "additionalProperties": False}},
    {"name": "Patch", "description":
        "一次原子地改页面里的好几处。"
        "任何一处的 old 找不到就整批不写,并告诉你是哪一处 —— 不会改一半。"
        "这是改页的首选:比一处一次地 Edit 少几倍来回。",
     "parameters": {"type": "object", "properties": {
         "page": {"type": "string", "description": "页面文件名,例 page-07.html"},
         "edits": {"type": "array", "description": "要替换的若干处,按顺序应用",
                   "items": {"type": "object", "properties": {
                       "old": {"type": "string", "description": "原文,要能在文件里找到"},
                       "new": {"type": "string", "description": "替换成什么"}},
                       "required": ["old", "new"], "additionalProperties": False}},
         },
         "required": ["page", "edits"], "additionalProperties": False}},
    {"name": "Check", "description":
        "把页面真渲染一遍并报告:JS 报错、超出画布、被裁、字号地板、画面占用比。"
        "每次都会重新加载页面并在加载约 1.2 秒后采样初态,不是等待或调试被动动画的工具。"
        "把用户能主动触发且会改变学习结果或版面的主要状态合并进同一次 after,不要拆成多次 Check。",
     "parameters": {"type": "object", "properties": {
         "page": {"type": "string", "description": "页面文件名,例 page-07.html"},
         "after": {"type": "array", "items": {"type": "string"},
                   "description": "在页面里依次跑的 JS,每段之后重测一遍主要交互状态。"
                                  "例 [\"document.getElementById('go').click()\"]"},
         "shot": {"type": "boolean", "description": "是否返回 800×450 整页截图；视觉模型默认 true"}},
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
]


def specs() -> list[dict]:
    return [{"type": "function", **s} for s in SCHEMAS]


def run(
    name: str,
    args: dict,
    cwd: Path,
    resource_root: Path | None,
    pid: str,
) -> str | Out:
    """`pid` 是本页的 id(形如 `page-06`),**必填**。

    不给默认值是故意的:默认值等于「忘了传就静默不设防」,而静默退化正是这个仓库
    反复栽过的形状 —— 分不清「设防了」和「以为设防了」。
    """
    off = _out_of_bounds(name, args, cwd, pid, resource_root)
    if off:
        return (f"拒绝:`{off}` 不在当前页面的工作范围内。"
                f"只能修改 `{pid}.html` 及宿主明确授予的代码 lesson 文件；"
                f"当前 workflow 资源只读。")
    # The scope guard has always interpreted relative file paths from ``pages/``.  Dispatch
    # must use the same base.  Otherwise a valid ``page-08.html`` passes the guard and is then
    # written relative to the harness process cwd, outside the run it was checked against.
    call_args = dict(args)
    if name in {"Read", "Write", "Edit"} and call_args.get("file_path"):
        path = Path(str(call_args["file_path"]))
        if not path.is_absolute():
            call_args["file_path"] = str((cwd / path).resolve())
    try:
        r = _dispatch(name, call_args, cwd, resource_root)
        cap = CAP
        if name == "Read" and call_args.get("file_path") \
                and _is_workflow_resource(Path(call_args["file_path"]), resource_root):
            cap = WORKFLOW_RESOURCE_CAP
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

    return msg


# ── 分发 ────────────────────────────────────────────────────────────
def _dispatch(name: str, a: dict, cwd: Path, resource_root: Path | None) -> str | Out:
    if name == "Read":
        p = Path(a["file_path"])
        if p.suffix.lower() in IMG_EXT:
            return _image(p)
        if _is_workflow_resource(p, resource_root):
            text = p.read_text(encoding="utf-8", errors="replace")
            n = text.count("\n") + 1
            return (f"（工作流资源全文开始：{p.name}，共 {n} 行）\n"
                    + text
                    + f"\n（工作流资源全文结束：{p.name} · EOF）")
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

    return f"未知工具 {name}"
