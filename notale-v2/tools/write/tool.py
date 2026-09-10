from __future__ import annotations
from pathlib import Path
from ..shared.result import Out


SCHEMA = {"name": "Write", "description":
        "写入完整文件，适合首次创建或确需整体重构；已有页面的局部修正优先用 Patch/Edit。",
     "parameters": {"type": "object", "properties": {
         "file_path": {"type": "string", "description": "文件路径"},
         "content": {"type": "string", "description": "完整内容"}},
         "required": ["file_path", "content"], "additionalProperties": False}}

def execute(a: dict, cwd: Path, resource_root: Path | None = None) -> str | Out:
    p = Path(a["file_path"])
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(a["content"], encoding="utf-8")
    return f"已写入 {p}({len(a['content']):,} 字符)"

