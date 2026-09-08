"""Small, workspace-scoped tool surface for page Builders."""

from __future__ import annotations

import base64
import io
import json
import re
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

from . import media
from .redact import redact

CAP = 30_000  # 普通 tool_result 的字符上限。实测 nn-06 最大一个 679,500 字符,
              # 不截断的话一次就把上下文灌爆。
WORKFLOW_RESOURCE_CAP = 160_000
TIMEOUT = 120
SHOT_TIMEOUT = 300   # 渲染要起无头 Chromium,还可能带几个 --after 状态,给宽一点

VISUAL_SAMPLE_WORKFLOWS = frozenset({
    "build-cover",
    "build-page",
    "build-interaction",
})
VISUAL_SAMPLE_USE = """<sample_use>
This is a worked example, not a template. Adapt its chosen composition,
visual mechanism or state loop at comparable fidelity. Replace subject matter,
data, copy, palette, host skeleton and unrelated navigation with this page's
contract. Retain the visual relationship, not just component syntax.
</sample_use>"""

_CHECK_USE_HEAD = (
    "This report is instrumentation, not approval. Verify screenshots, content "
    "and actual state changes against the reference."
)
_CHECK_USE_ITEMS = {
    "build-cover": (
        "Check that the title, the main visual, and the representative frame form one composition.",
        "Copy, legends, and ARIA may only describe behavior the code actually produces.",
        "If the visual claims to show an algorithm's result, trace one representative "
        "result; decoration must not imitate the algorithm.",
    ),
    "build-page": (
        "Remove fills, borders and shadows that only group content; use proximity and alignment. Keep boundaries that encode a set, shape or interaction state.",
        "Check that there is one main evidence field, not several equal parts.",
        "Recompute at least one derived value from the page's own data and formulas.",
        "The same data must agree across prose, chart, and annotations.",
    ),
    "build-interaction": (
        "Remove fills, borders and shadows that only group content; use proximity and alignment. Keep boundaries that encode a set, shape or interaction state.",
        "Walk one legal progression path with the after states.",
        "Also cover the applicable illegal or boundary case, the completion state, and Reset.",
        "A legal action must change the real model and the visible evidence; an action "
        "the copy declares invalid must not be committable.",
        "Every result must offer the next legal action.",
    ),
}


def check_use(workflow: str | None) -> str:
    """Acceptance prompt returned with every Check report of a visual workflow."""
    items = _CHECK_USE_ITEMS.get(workflow or "")
    if not items:
        return ""
    body = "\n".join(f"- {item}" for item in items)
    return f'<check_use workflow="{workflow}">\n{_CHECK_USE_HEAD}\n{body}\n</check_use>'


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
            image_root = root / "assets/img"
            if name in {"Write", "Edit", "Patch"} and target.is_relative_to(image_root):
                relative = target.relative_to(image_root)
                if not relative.parts or not relative.parts[0].startswith(pid + "-"):
                    return f"{s}(共享或其他页面的素材只读)"
            # Check/Look 的截图存在 run/.shots/(见 _selfcheck),报告会列出没内联的
            # 那些路径让模型自己 Read。实测模型照做被这里拒了,然后凭前两张收尾。
            allowed_resource = name == "Read" and (
                _is_workflow_resource(target, resource_root)
                or target.is_relative_to(root.parent / ".shots")
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
MAX_IMAGES = 2       # 每次调用内联首尾两张，其余列路径；历史仅超软上限时淘汰。

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


SAMPLE_SHOTS = False  # 消融开关（builder --sample-shots）：读 Main bundle 时附上该 sample 的多态拼图
TEXT_REPORT = False   # 实验开关（builder --notes cap|notes）：Check 报告多报一行画面字数/讲稿字数


def _sample_sheet(path: Path, resource_root: Path | None) -> Path | None:
    """`samples/bundles/<cat>/<id>.<variant>.md` → `samples/<cat>/<id>/shots.png`，没有就 None。"""
    if not SAMPLE_SHOTS or resource_root is None:
        return None
    try:
        rel = path.resolve().relative_to(resource_root.resolve())
    except (OSError, ValueError):
        return None
    if len(rel.parts) != 4 or rel.parts[:2] != ("samples", "bundles"):
        return None
    sample_id = path.name.split(".")[0]
    sheet = resource_root / "samples" / rel.parts[2] / sample_id / "shots.png"
    return sheet if sheet.is_file() else None


def _visual_main_sample(path: Path, resource_root: Path | None) -> bool:
    """Visual full and mini bundles share the same migration boundary."""
    if resource_root is None or resource_root.name not in VISUAL_SAMPLE_WORKFLOWS:
        return False
    try:
        rel = path.resolve().relative_to(resource_root.resolve())
    except (OSError, ValueError):
        return False
    return (
        len(rel.parts) >= 3
        and rel.parts[:2] == ("samples", "bundles")
        and path.name.endswith((".full.md", ".mini.md"))
    )


SCHEMAS = [
    {"name": "Read", "description":
        "读一个文件。普通文本回带行号的内容;png/jpg 回图片本身。"
        "工作流 reference 和 sample bundle 返回全文及 EOF，忽略 offset/limit。路径按环境块解析。",
     "parameters": {"type": "object", "properties": {
         "file_path": {"type": "string", "description": "文件路径"},
         "offset": {"type": "integer", "description": "从第几行开始读"},
         "limit": {"type": "integer", "description": "读多少行"}},
         "required": ["file_path"], "additionalProperties": False}},
    {"name": "Write", "description":
        "写入完整文件，适合首次创建或确需整体重构；已有页面的局部修正优先用 Patch/Edit。",
     "parameters": {"type": "object", "properties": {
         "file_path": {"type": "string", "description": "文件路径"},
         "content": {"type": "string", "description": "完整内容"}},
         "required": ["file_path", "content"], "additionalProperties": False}},
    {"name": "Edit", "description": "精确字符串替换。old_string 必须唯一匹配；replace_all=true 时替换全部匹配。",
     "parameters": {"type": "object", "properties": {
         "file_path": {"type": "string", "description": "文件路径"},
         "old_string": {"type": "string", "description": "要被替换的原文"},
         "new_string": {"type": "string", "description": "替换成什么"},
         "replace_all": {"type": "boolean", "description": "替换全部出现处"}},
         "required": ["file_path", "old_string", "new_string"], "additionalProperties": False}},
    {"name": "Patch", "description":
        "批量修改页面：先确认每个 old 在原文件中存在，否则整批不写；"
        "然后按顺序将每个 old 的全部匹配替换为 new。",
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
        "渲染页面，报告运行/资源错误、越界、裁切、字号统计、主题字阶偏离和构图指标。"
        "每次重新加载，在加载约 1.2 秒后采样。"
        "页面声明了 data-step 时会逐步各拍一张,越界与字号按末步判。"
        "把用户能主动触发且会改变学习结果或版面的主要状态合并进同一次 after,不要拆成多次 Check;"
        "决定性终态放在最后一段。截图超过两张时只内联初态和最后一个状态,其余列出路径可单独 Read。",
     "parameters": {"type": "object", "properties": {
         "page": {"type": "string", "description": "页面文件名,例 page-07.html"},
         "after": {"type": "array", "items": {"type": "string"},
                   "description": "在页面里依次跑的 JS,每段之后重测一遍主要交互状态。"
                                  "例 [\"document.getElementById('go').click()\"]"},
         "shot": {"type": "boolean", "description": "是否返回 800×450 整页截图；视觉模型默认 true"}},
         "required": ["page"], "additionalProperties": False}},
    {"name": "Look", "description":
        "重新加载页面，执行 after 后裁图放大。box 取 Check 报告的 @x,y w×h；整页截图用 Check。",
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
         "command": {"type": "string", "description": "要执行的命令"}},
         "required": ["command"], "additionalProperties": False}},
]


def specs(workflow: str | None = None, *, vision_input: bool = True) -> list[dict]:
    rows = [{"type": "function", **s} for s in SCHEMAS]
    if workflow == "build-code":
        rows = [s for s in rows if s["name"] in {"Read", "Write", "Edit", "Check", "Look"}]
    elif workflow:
        rows = [s for s in rows if s["name"] != "Edit"]
    if not vision_input:
        rows = [s for s in rows if s["name"] != "Look"]
    for s in rows:
        if s["name"] == "Write" and workflow:
            edit = "Edit" if workflow == "build-code" else "Patch"
            s["description"] = f"写完整文件，用于创建或整体重构；局部修正用 {edit}。"
    if vision_input:
        rows += media.SCHEMAS
    return rows


def media_call(name: str, args: dict, cwd: Path, owner: str) -> Out:
    """Same executor and image-return path for Planner and Builders."""
    started = time.monotonic()
    backend = media.search_backend() if name == "ImageSearch" else None
    out, rows, errors = media.fetch(name, args, cwd, owner, backend=backend)
    images = []
    for row in rows:
        if "path" not in row:
            row.setdefault("error", "未取得可用图片")
            continue
        try:
            if name == "ImageSearch":
                _, row["w"], row["h"] = media.image_info(cwd / row["path"])
            shot = _image(cwd / row["path"])
            images.extend(shot.images)
        except (OSError, ValueError) as exc:
            row["error"] = str(exc)
            row.pop("path", None)
    if name == "ImageSearch":
        fields = ("query_index", "title", "source", "page_url", "url", "author", "license", "path", "w", "h", "error")
        result = {"results": [{k: row[k] for k in fields if row.get(k) is not None and row.get(k) != ""}
                              for row in rows], "errors": errors}
        result = json.loads(redact(json.dumps(result, ensure_ascii=False)))
        try:
            media.record_search(out, cwd, args, backend, time.monotonic() - started, result, rows)
        except (OSError, ValueError) as exc:
            result["errors"].append(media._error("record", exc))
        return Out(json.dumps(result, ensure_ascii=False), images)
    return Out(json.dumps(rows, ensure_ascii=False), images)


def resolve_read_path(file_path: str, cwd: Path, resource_root: Path | None) -> Path:
    """Use identical resolution for Read execution and reference-read accounting."""
    path = Path(file_path)
    resolved = (path if path.is_absolute() else cwd / path).resolve()
    if not path.is_absolute() and not resolved.exists() and resource_root is not None:
        alt = (resource_root / path).resolve()
        if alt.is_file() and _is_workflow_resource(alt, resource_root):
            return alt
    return resolved


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
    if name in media.NAMES:
        try:
            return media_call(name, args, cwd, pid)
        except Exception as exc:
            return f"{type(exc).__name__}: {exc}"
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
        if name == "Read":
            call_args["file_path"] = str(resolve_read_path(str(path), cwd, resource_root))
        elif not path.is_absolute():
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
    if TEXT_REPORT:
        cmd += ["--text-report"]
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=SHOT_TIMEOUT)
    return ((r.stdout or "") + (("\n[stderr]\n" + r.stderr) if r.stderr else "")).strip() \
        or f"(自检没有输出,退出码 {r.returncode})"


def _shot_paths(report: str, kind: str) -> list[Path]:
    return [Path(m) for m in re.findall(rf"^\s*{kind} (\S+\.png)", report, re.M)]


def _pick_shots(shots: list[Path]) -> tuple[list[Path], list[Path]]:
    """Inline the initial state and the last after state; list the rest by path."""
    if len(shots) <= MAX_IMAGES:
        return shots, []
    return [shots[0], shots[-1]], shots[1:-1]


def _check(cwd: Path, a: dict, workflow: str | None = None) -> Out:
    page = str(a["page"])
    rep = _selfcheck(cwd, page, a.get("after") or (), shot=bool(a.get("shot")))
    imgs: list[tuple[str, str]] = []
    if a.get("shot"):
        shots = [p for p in _shot_paths(rep, "截图") if p.exists()]
        inline, rest = _pick_shots(shots)
        for p in inline:
            imgs += _image(p).images
        inline_set = set(inline)
        rep = re.sub(r"(?m)^(\s*截图 )(\S+\.png)([^\n]*)$",
                     lambda m: m[0] + (" [已内联]" if Path(m[2]) in inline_set else " [可 Read]"), rep)
    use = check_use(workflow)
    return Out((use + "\n\n" + rep) if use else rep, imgs)


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


# ── Patch 失败的仪表 ─────────────────────────────────────────────────
# 只记录,不改行为。2026-09-04 起加的:全部 47 轮 trace 里,关于 Patch 为什么失败
# 只有模型自己猜的一句「可能是转义问题」—— trace 不存工具输入输出,而 Patch→Patch
# 占全部 Patch 的 41.6%,其中多少是失败重试、失败的 old 和文件差在哪,一条都查不到。
# 每次失败按处写一行到 run 根的 patch-misses.jsonl,并把差异归到能直接对应修法的类别。
_WS = re.compile(r"\s+")


def _classify_miss(old: str, src: str) -> tuple[str, str, float]:
    """返回 (类别, 文件里最接近的一段, 相似度)。类别直接对应修法:
    空白差异 → 匹配时归一化空白就能过;转义差异 → old 里带了 JSON 转义;
    近似 → 改了字;不存在 → 引用了从没有过的内容。"""
    import difflib
    if not old.strip():
        return "空 old", "", 0.0
    if _WS.sub("", old) in _WS.sub("", src):
        return "空白差异", "", 1.0
    unescaped = old.replace('\\"', '"').replace("\\n", "\n").replace("\\/", "/")
    if unescaped != old and unescaped in src:
        return "转义差异", "", 1.0
    lines = src.splitlines()
    probe = next((l for l in old.splitlines() if l.strip()), old)[:200]
    best_i = max(range(len(lines)), key=lambda i: difflib.SequenceMatcher(
        None, probe.strip(), lines[i].strip()).ratio(), default=0)
    ratio = difflib.SequenceMatcher(None, probe.strip(), lines[best_i].strip()).ratio() if lines else 0.0
    lo, hi = max(0, best_i - 2), min(len(lines), best_i + 3)
    near = "\n".join(f"{j+1}│{lines[j]}" for j in range(lo, hi))
    return ("近似" if ratio >= 0.6 else "不存在"), near, round(ratio, 3)


def _log_patch_miss(cwd: Path, page: str, index: int, old: str, src: str) -> None:
    try:
        kind, near, ratio = _classify_miss(old, src)
        row = {"page": page, "edit": index, "kind": kind, "ratio": ratio,
               "old_len": len(old), "old_lines": old.count("\n") + 1,
               "old": old[:400], "nearest": near[:600]}
        with (cwd.parent / "patch-misses.jsonl").open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    except Exception as exc:  # 仪表不能把工具本身弄挂
        print(f"      ⚠ patch-miss 记录失败:{type(exc).__name__}: {exc}", flush=True)


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
            _log_patch_miss(cwd, page, i, old, s)
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
            guidance = (
                VISUAL_SAMPLE_USE + "\n\n"
                if _visual_main_sample(p, resource_root)
                else ""
            )
            body = (guidance
                    + f"（工作流资源全文开始：{p.name}，共 {n} 行）\n"
                    + text
                    + f"\n（工作流资源全文结束：{p.name} · EOF）")
            sheet = _sample_sheet(p, resource_root)
            if sheet is None:
                return body
            shot = _image(sheet)
            return Out(body + "\n\n随附这个 sample 的多态截图拼图（按编号顺序是它的真实状态序列）："
                       + shot.text, shot.images)
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
        return _check(cwd, a, resource_root.name if resource_root else None)

    if name == "Look":
        return _look(cwd, a)

    if name == "Bash":
        r = subprocess.run(a["command"], shell=True, cwd=cwd, capture_output=True,
                           text=True, timeout=TIMEOUT)
        out = (r.stdout or "") + (("\n[stderr]\n" + r.stderr) if r.stderr else "")
        return out.strip() or f"(无输出,退出码 {r.returncode})"

    return f"未知工具 {name}"
