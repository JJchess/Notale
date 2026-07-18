"""run 起始落盘 provenance：什么代码 / 配置 / 环境 / seed 跑出来的（可复现三件套）。"""

from __future__ import annotations

import json
import platform
import subprocess
import sys
from pathlib import Path
from typing import Any


def _git_hash() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    except Exception:
        return "unknown"


def _git_dirty() -> bool:
    try:
        return subprocess.run(["git", "diff", "--quiet"]).returncode != 0
    except Exception:
        return False


def capture(
    out_dir: str | Path, *, config_yaml: str | None = None, extra: dict[str, Any] | None = None
) -> None:
    """写 config.yaml + meta.json 到 run 目录。"""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    if config_yaml is not None:
        (out / "config.yaml").write_text(config_yaml, encoding="utf-8")
    meta: dict[str, Any] = {
        "git_hash": _git_hash(),
        "git_dirty": _git_dirty(),
        "argv": sys.argv,
        "python": sys.version,
        "platform": platform.platform(),
    }
    if extra:
        meta.update(extra)
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
