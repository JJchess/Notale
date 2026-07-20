"""代码版本指纹（L5 app，允许 I/O）——给每条实验记录盖上"是哪版 agent 代码产出的"戳。

`agent_fingerprint` 只对 agent 相关代码面取哈希，与仓库其余提交无关：
改 planning.py 里的规划提示语会换指纹，改 README 不会——精确对应
"agent 代码一变就换标记，方便按代码版本切片/对比"的要求。
"""

from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path

# 相对项目根（lecture-agent/）的路径；只覆盖真正影响生成行为的 agent 代码面。
AGENT_CODE_PATHS: tuple[str, ...] = (
    "lecture_agent/agent",
    "lecture_agent/domain/planning.py",
    "lecture_agent/domain/skills",
    "lecture_agent/domain/media",
    "skills",
    "configs/generator",
    "configs/media",
)


def _project_root() -> Path:
    # lecture_agent/app/codeprint.py -> 上溯 2 层到 lecture-agent/
    return Path(__file__).resolve().parents[2]


def git_rev(cwd: Path | None = None) -> str | None:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=cwd or _project_root(),
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if out.returncode != 0:
        return None
    return out.stdout.strip() or None


def git_dirty(cwd: Path | None = None) -> bool | None:
    try:
        out = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=cwd or _project_root(),
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if out.returncode != 0:
        return None
    return bool(out.stdout.strip())


def agent_fingerprint(paths: tuple[str, ...] = AGENT_CODE_PATHS) -> str | None:
    """对 `paths` 下所有文件内容拼接取 sha256，前 12 位。路径列表本身不存在时静默跳过该项。"""
    root = _project_root()
    digest = hashlib.sha256()
    found_any = False
    for rel in paths:
        base = root / rel
        if base.is_file():
            files = [base]
        elif base.is_dir():
            files = sorted(p for p in base.rglob("*") if p.is_file())
        else:
            continue
        for f in files:
            found_any = True
            digest.update(str(f.relative_to(root)).replace("\\", "/").encode("utf-8"))
            digest.update(f.read_bytes())
    if not found_any:
        return None
    return digest.hexdigest()[:12]
