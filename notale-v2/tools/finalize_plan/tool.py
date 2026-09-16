from __future__ import annotations
from pathlib import Path


FINALIZE_SPEC = {
    "type": "function", "name": "FinalizePlan",
    "description": "提交完整页表及选用的图片路径；无图可省略映射。",
    "parameters": {"type": "object", "properties": {
        "pages_md": {"type": "string", "description": "页表前言统一写 Audience 和按 Pages 关联的 Continuity；随后每页标签＋一句主题"},
        "media_by_page": {"type": "object", "additionalProperties": {
            "type": "array", "items": {"type": "string"}},
            "description": "页号（如 page-03）到本次工具返回的路径列表；仅列有图页面"}},
        "required": ["pages_md"], "additionalProperties": False},
}

def execute(args: dict, available: dict, root: Path, separate_theme: bool, css: str):
    from core.planner import _valid_pages, validate_media, plan_context
    pages_doc = args["pages_md"]
    error = _valid_pages(pages_doc)
    if error:
        raise ValueError(error)
    plan_context(pages_doc, require_audience=True)
    mapping = validate_media(args.get("media_by_page", {}), pages_doc,
                             available, root / "pages")
    if not separate_theme and not css:
        raise ValueError("缺少 theme.css，请先 Write 主题")
    final = css, pages_doc, mapping
    output = "定稿已接收"
    return final, output
