from __future__ import annotations
from pathlib import Path
import subprocess
from ..shared.result import Out


TIMEOUT = 120

SCHEMA = {"name": "Bash", "description": f"执行 shell 命令。工作目录固定为该页所在的 pages/,超时 {TIMEOUT}s。",
     "parameters": {"type": "object", "properties": {
         "command": {"type": "string", "description": "要执行的命令"}},
         "required": ["command"], "additionalProperties": False}}

def execute(a: dict, cwd: Path, resource_root: Path | None = None) -> str | Out:
    r = subprocess.run(a["command"], shell=True, cwd=cwd, capture_output=True,
                       text=True, timeout=TIMEOUT)
    out = (r.stdout or "") + (("\n[stderr]\n" + r.stderr) if r.stderr else "")
    return out.strip() or f"(无输出,退出码 {r.returncode})"

