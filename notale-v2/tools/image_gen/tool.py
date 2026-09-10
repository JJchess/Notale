from __future__ import annotations
from pathlib import Path
import json
import subprocess
import sys
from core import skills


SCHEMA = {"type": "function", "name": "ImageGen",
     "description": "生成插画或场景，返回路径和图片；真实人物、器物等证据请用 ImageSearch。",
     "parameters": {"type": "object", "properties": {
         "prompt": {"type": "string"},
         "n": {"type": "integer", "minimum": 1, "description": "生成张数，默认 1"}},
         "required": ["prompt"], "additionalProperties": False}}

def script_path(resource_root: Path) -> Path:
    """Preserve --skills custom roots; only the bundled script moved."""
    bundled_root = Path(__file__).resolve().parents[1]
    if resource_root.resolve() == bundled_root:
        return Path(__file__).with_name("gen.py")
    return resource_root / "make-illustration/scripts/gen.py"


def generate(args: dict, count: int, out: Path) -> list[dict]:
    cmd = [sys.executable, str(script_path(skills.DEFAULT)),
           args["prompt"], "--n", str(count), "--out", str((out / "image.png").resolve())]
    result_file = out / "illustrations.json"
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if proc.returncode or not result_file.is_file():
        raise RuntimeError((proc.stderr or proc.stdout or "media returned no results")[-1500:])
    raw_rows = json.loads(result_file.read_text())
    return raw_rows
