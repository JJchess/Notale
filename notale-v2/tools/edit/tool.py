from __future__ import annotations
from pathlib import Path
from ..shared.result import Out


SCHEMA = {"name": "Edit", "description": "精确字符串替换。old_string 必须唯一匹配；replace_all=true 时替换全部匹配。",
     "parameters": {"type": "object", "properties": {
         "file_path": {"type": "string", "description": "文件路径"},
         "old_string": {"type": "string", "description": "要被替换的原文"},
         "new_string": {"type": "string", "description": "替换成什么"},
         "replace_all": {"type": "boolean", "description": "替换全部出现处"}},
         "required": ["file_path", "old_string", "new_string"], "additionalProperties": False}}

def execute(a: dict, cwd: Path, resource_root: Path | None = None) -> str | Out:
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

