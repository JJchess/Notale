from __future__ import annotations
from pathlib import Path


PLANNER_WRITE_SPEC = [{
    "type": "function",
    "name": "Write",
    "description": "写完整文件",
    "parameters": {
        "type": "object",
        "properties": {
            "file_path": {"type": "string", "description": "绝对路径"},
            "content": {"type": "string", "description": "完整内容"},
        },
        "required": ["file_path", "content"],
        "additionalProperties": False,
    },
}]

def execute(args: dict, root: Path):
    from core.planner import CSS_REL, _valid_css
    if Path(args["file_path"]).resolve() != (root / CSS_REL).resolve():
        raise ValueError("Write 只用于 theme.css；页表用 FinalizePlan")
    error = _valid_css(args["content"])
    if error:
        raise ValueError(error)
    css = args["content"]
    output = "主题已接收"
    return css, output
