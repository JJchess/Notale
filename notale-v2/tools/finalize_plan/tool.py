from __future__ import annotations
from pathlib import Path


FINALIZE_SPEC = {
    "type": "function", "name": "FinalizePlan",
    "description": "提交完整页表及选用的图片路径；无图可省略映射。",
    "parameters": {"type": "object", "properties": {
        "pages_md": {"type": "string", "description": "原有页表：每页标签＋一句主题"},
        "media_by_page": {"type": "object", "additionalProperties": {
            "type": "array", "items": {"type": "string"}},
            "description": "页号（如 page-03）到本次工具返回的路径列表；仅列有图页面"},
        "sources_by_page": {"type": "object", "additionalProperties": {"type": "string"},
            "description": "有材料时每页必填：页号到本页依据的材料摘录（原文关键句、数字、术语、人名、图表描述，"
                           "150–400 字，保留材料语言）。建页 agent 只看这段，不再读材料全文"}},
        "required": ["pages_md"], "additionalProperties": False},
}

def execute(args: dict, available: dict, root: Path, separate_theme: bool, css: str):
    from core.planner import _valid_pages, validate_media
    pages_doc = args["pages_md"]
    error = _valid_pages(pages_doc)
    if error:
        raise ValueError(error)
    mapping = validate_media(args.get("media_by_page", {}), pages_doc,
                             available, root / "pages")
    if not separate_theme and not css:
        raise ValueError("缺少 theme.css，请先 Write 主题")
    sources = args.get("sources_by_page") or {}
    if sources:
        import json, re
        pids = set(re.findall(r"^# (page-\d+)", pages_doc, flags=re.M))
        bad = [k for k in sources if k not in pids]
        if bad:
            raise ValueError(f"sources_by_page 含不在页表里的页号：{bad}")
        (root / "pages" / "plan").mkdir(parents=True, exist_ok=True)
        (root / "pages" / "plan" / "sources.json").write_text(
            json.dumps(sources, ensure_ascii=False, indent=1), encoding="utf-8")
    final = css, pages_doc, mapping
    output = "定稿已接收"
    return final, output
