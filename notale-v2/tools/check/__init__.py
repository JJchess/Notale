from __future__ import annotations
from pathlib import Path
import re
import subprocess
import sys
from ..shared.result import Out
from ..shared.image import _image


SCHEMA = {"name": "Check", "description":
        "渲染页面，报告运行/资源错误、越界、裁切、实际字号统计和必需主题值。"
        "每次重新加载，在加载约 1.2 秒后采样。"
        "有分步出场时会逐步各拍一张,越界与字号按末步判。"
        "默认返回整页截图；需要看局部细节时用 box 指定区域，裁图不改变整页检查范围。"
        "把用户能主动触发且会改变学习结果或版面的主要状态合并进同一次 after,不要拆成多次 Check;"
        "决定性终态放在最后一段。截图超过两张时只内联初态和最后一个状态,其余列出路径可单独 Read。",
     "parameters": {"type": "object", "properties": {
         "page": {"type": "string", "description": "页面文件名,例 page-07.html"},
         "after": {"type": "array", "items": {"type": "string"},
                   "description": "在页面里依次跑的 JS,每段之后重测一遍主要交互状态。"
                                  "可 return {computed, displayed} 回传计算结果与显示值，和操作合在同一次检查。"
                                  "例 [\"document.getElementById('go').click()\"]"},
         "shot": {"type": "boolean", "description": "是否返回截图；视觉模型默认 true。false 时只检查，不生成整页或局部截图。"},
         "box": {"type": "array", "items": {"type": "integer"},
                 "minItems": 4, "maxItems": 4,
                 "description": "可选局部截图区域 [x,y,w,h]，使用 1600×900 画布坐标，宽高须大于 0。省略或指定整个画布时返回 800×450 整页图。"},
         "zoom": {"type": "integer", "minimum": 1,
                  "description": "局部裁图放大倍数，默认 2；无局部 box 或 shot=false 时忽略。"}},
         "required": ["page"], "additionalProperties": False}}

SHOT_TIMEOUT = 300


MAX_IMAGES = 2


SELFCHECK = "assets/selfcheck.py"


TEXT_REPORT = False


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
        "Recompute at least one derived value from the page's own data and formulas.",
        "The same data must agree across prose, chart, and annotations.",
    ),
    "build-interaction": (
        "Walk one legal progression path with the after states.",
        "Also cover the applicable illegal or boundary case, the completion state, and Reset.",
        "A legal action must change the real model and the visible evidence; an action "
        "the copy declares invalid must not be committable.",
        "For computed metrics, return an independent recomputation from the data/model "
        "used by the visual alongside the displayed value; reading a label alone is not verification.",
    ),
}


def check_use(workflow: str | None) -> str:
    """Acceptance prompt returned with every Check report of a visual workflow."""
    items = _CHECK_USE_ITEMS.get(workflow or "")
    if not items:
        return ""
    body = "\n".join(f"- {item}" for item in items)
    return f'<check_use workflow="{workflow}">\n{_CHECK_USE_HEAD}\n{body}\n</check_use>'


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
    shot = bool(a.get("shot"))
    box = a.get("box") if shot else None
    zoom = 2
    if box is not None:
        if (not isinstance(box, list) or len(box) != 4
                or any(type(v) is not int for v in box) or box[2] <= 0 or box[3] <= 0):
            return Out("失败：box 必须是 [x,y,w,h] 整数数组，宽高必须大于 0。")
        if box == [0, 0, 1600, 900]:
            box = None
        else:
            if box[0] >= 1600 or box[1] >= 900 or box[0] + box[2] <= 0 or box[1] + box[3] <= 0:
                return Out("失败：box 超出画布，没有可裁区域。")
            zoom = a.get("zoom", 2)
            if type(zoom) is not int or zoom < 1:
                return Out("失败：zoom 必须是大于等于 1 的整数。")
    rep = _selfcheck(cwd, page, a.get("after") or (), shot=shot, crop=box, zoom=zoom)
    imgs: list[tuple[str, str]] = []
    if shot:
        kind = "裁图" if box else "截图"
        shots = [p for p in _shot_paths(rep, kind) if p.exists()]
        inline, rest = _pick_shots(shots)
        for p in inline:
            imgs += _image(p).images
        inline_set = set(inline)
        rep = re.sub(rf"(?m)^(\s*{kind} )(\S+\.png)([^\n]*)$",
                     lambda m: m[0] + (" [已内联]" if Path(m[2]) in inline_set else " [可 Read]"), rep)
        if box and not shots:
            rep += "\n失败：没有生成局部截图，请检查渲染报告。"
    use = check_use(workflow)
    return Out((use + "\n\n" + rep) if use else rep, imgs)
