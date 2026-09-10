from __future__ import annotations
from pathlib import Path
from ..shared.result import Out
from ..shared.image import IMG_EXT, _image
from ..shared.paths import _is_workflow_resource


SCHEMA = {"name": "Read", "description":
        "读一个文件。普通文本回带行号的内容;png/jpg 回图片本身。"
        "工作流 reference、sample bundle 及 assets/lib/LIBS.md 返回全文及 EOF，忽略 offset/limit。路径按环境块解析。",
     "parameters": {"type": "object", "properties": {
         "file_path": {"type": "string", "description": "文件路径"},
         "offset": {"type": "integer", "description": "从第几行开始读"},
         "limit": {"type": "integer", "description": "读多少行"}},
         "required": ["file_path"], "additionalProperties": False}}

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


SAMPLE_SHOTS = False


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
    """Only live visual mini bundles carry sample-use guidance."""
    if resource_root is None or resource_root.name not in VISUAL_SAMPLE_WORKFLOWS:
        return False
    try:
        rel = path.resolve().relative_to(resource_root.resolve())
    except (OSError, ValueError):
        return False
    return (
        len(rel.parts) >= 3
        and rel.parts[:2] == ("samples", "bundles")
        and path.name.endswith(".mini.md")
    )


def resolve_read_path(file_path: str, cwd: Path, resource_root: Path | None) -> Path:
    """Use identical resolution for Read execution and reference-read accounting."""
    path = Path(file_path)
    resolved = (path if path.is_absolute() else cwd / path).resolve()
    if not path.is_absolute() and not resolved.exists() and resource_root is not None:
        alt = (resource_root / path).resolve()
        if alt.is_file() and _is_workflow_resource(alt, resource_root):
            return alt
    return resolved

def execute(a: dict, cwd: Path, resource_root: Path | None = None) -> str | Out:
    p = Path(a["file_path"])
    if p.suffix.lower() in IMG_EXT:
        return _image(p)
    if p.resolve() == (cwd / "assets/lib/LIBS.md").resolve():
        text = p.read_text(encoding="utf-8")
        return f"（库用法全文开始：LIBS.md）\n{text}\n（库用法全文结束：LIBS.md · EOF）"
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

