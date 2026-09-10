from __future__ import annotations
from pathlib import Path
import subprocess
import sys
from tools.code_scaffold.tool import lesson_root


CHECK_TIMEOUT = 420


def run_browser_check(pages_dir: Path, pid: str, shot: bool = False) -> tuple[str, list[Path]]:
    root = lesson_root(pages_dir, pid)
    script = root / "check.py"
    if not script.is_file():
        return f"失败:代码工作台尚未生成，找不到 {script}", []
    command = [sys.executable, str(script)]
    shot_dir = pages_dir.parent / ".shots" / "code" / pid
    if shot:
        command += ["--shot-dir", str(shot_dir)]
    result = subprocess.run(
        command,
        cwd=root,
        capture_output=True,
        text=True,
        timeout=CHECK_TIMEOUT,
    )
    output = (result.stdout or "") + (("\n[stderr]\n" + result.stderr) if result.stderr else "")
    output = output.strip() or f"(代码工作台自检无输出，退出码 {result.returncode})"
    if result.returncode:
        output = f"✗ 代码工作台自检失败（退出码 {result.returncode}）\n" + output
    else:
        output = "✓ 代码工作台自检通过\n" + output
    shots = [path for path in (shot_dir / "initial.png", shot_dir / "active.png", shot_dir / "final.png") if path.is_file()]
    return output, shots
