"""Host-owned scaffold and verification for ``build-code`` pages."""

from __future__ import annotations

import html
import json
import os
import re
import shutil
import subprocess
import sys
import threading
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_ROOT = ROOT / "vendor" / "code-workbench"
VENDOR_ROOT = ROOT / "vendor"
_PID = re.compile(r"^page-(\d+)$")
_LOCK = threading.Lock()
CHECK_TIMEOUT = 420
EDITABLE = (
    "lesson/lesson.js",
    "lesson/starter.py",
    "lesson/trace.py",
    "lesson/tests.py",
    "lesson/view/index.html",
    "lesson/view/style.css",
    "lesson/view/render.js",
)


def tool_schema() -> dict:
    return {
        "type": "function",
        "name": "CodeScaffold",
        "description": (
            "Create the host-owned Python/Pyodide workbench for this routed code interaction. "
            "It is idempotent and returns every page-owned editable file with its current content."
        ),
        "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
    }


def lesson_root(pages_dir: Path, pid: str) -> Path:
    if not _PID.fullmatch(pid):
        raise ValueError(f"invalid page id: {pid!r}")
    return pages_dir / "assets" / "lessons" / pid


def editable_root(pages_dir: Path, pid: str) -> Path:
    return lesson_root(pages_dir, pid) / "lesson"


def _relative_link(target: Path, source: Path, *, directory: bool) -> None:
    if target.is_symlink():
        if target.resolve() == source.resolve():
            return
        target.unlink()
    elif target.exists():
        raise FileExistsError(f"fixed runtime target already exists and is not a symlink: {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.symlink_to(Path(os.path.relpath(source, target.parent)), target_is_directory=directory)


def _ensure_shared_runtime(pages_dir: Path) -> Path:
    """Materialize fixed code once per run; large third-party libraries stay shared."""
    if not TEMPLATE_ROOT.is_dir():
        raise FileNotFoundError(f"code workbench template is missing: {TEMPLATE_ROOT}")
    required = (
        VENDOR_ROOT / "chassis" / "base.css",
        VENDOR_ROOT / "chassis" / "base.js",
        VENDOR_ROOT / "monaco-editor",
        VENDOR_ROOT / "pyodide",
        VENDOR_ROOT / "vscode-codicons",
    )
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise FileNotFoundError("missing code runtime dependencies: " + ", ".join(missing))

    package_root = VENDOR_ROOT / "pyodide"
    numpy = json.loads((package_root / "pyodide-lock.json").read_text())["packages"]["numpy"]
    if not (package_root / numpy["file_name"]).is_file():
        raise FileNotFoundError("missing code runtime dependency: NumPy wheel " + numpy["file_name"])

    shared = pages_dir / "assets" / "code-runtime"
    with _LOCK:
        shared.mkdir(parents=True, exist_ok=True)
        for name in ("core", "runtime"):
            shutil.copytree(TEMPLATE_ROOT / name, shared / name, dirs_exist_ok=True)
        shutil.copy2(TEMPLATE_ROOT / "styles.css", shared / "styles.css")
        assets = shared / "assets"
        library = assets / "lib"
        _relative_link(assets / "base.css", VENDOR_ROOT / "chassis" / "base.css", directory=False)
        _relative_link(assets / "base.js", VENDOR_ROOT / "chassis" / "base.js", directory=False)
        for name in ("monaco-editor", "pyodide", "vscode-codicons"):
            _relative_link(library / name, VENDOR_ROOT / name, directory=True)
        marker = {
            "schemaVersion": 1,
            "template": str(TEMPLATE_ROOT.relative_to(ROOT)),
            "fixed": ["core", "runtime", "styles.css", "assets"],
        }
        (shared / ".notale-code-runtime.json").write_text(
            json.dumps(marker, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    return shared


def _configure(path: Path, title: str, pid: str) -> None:
    index = (TEMPLATE_ROOT / "index.html").read_text(encoding="utf-8")
    index = index.replace("__LESSON_TITLE_TEXT__", html.escape(title, quote=False))
    path.joinpath("index.html").write_text(index, encoding="utf-8")

    lesson_file = path / "lesson" / "lesson.js"
    lesson = lesson_file.read_text(encoding="utf-8")
    lesson = lesson.replace("__LESSON_SLUG_JSON__", json.dumps(pid, ensure_ascii=False))
    lesson = lesson.replace("__LESSON_TITLE_JSON__", json.dumps(title, ensure_ascii=False))
    lesson_file.write_text(lesson, encoding="utf-8")
    if "__LESSON_" in index or "__LESSON_" in lesson:
        raise RuntimeError("code scaffold placeholders were not fully replaced")


def _outer_page(pid: str, title: str, total: int) -> str:
    match = _PID.fullmatch(pid)
    if not match:
        raise ValueError(f"invalid page id: {pid!r}")
    number = match.group(1)
    safe_title = html.escape(title, quote=True)
    return f"""<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{safe_title}</title>
  <link rel="stylesheet" href="assets/base.css">
  <style>
    :root {{ --bg:#181818; --text:#cccccc; --font-sans:system-ui,sans-serif; }}
    html,body{{overflow:hidden}}
    #stage{{display:block!important;padding:0!important;overflow:hidden!important;background:#181818}}
    .code-workbench-frame{{display:block;width:1600px;height:900px;border:0;background:#181818}}
  </style>
</head>
<body data-page="{number}" data-total="{int(total)}">
  <div id="stage">
    <iframe class="code-workbench-frame" data-src="assets/lessons/{pid}/index.html"
      title="{safe_title}代码学习工作台" loading="eager"></iframe>
  </div>
  <script src="assets/base.js"></script>
  <script>
    Deck.init({{index:{int(number)},total:{int(total)}}});
    const workbenchFrame=document.querySelector('.code-workbench-frame');
    if(location.protocol!=='file:') workbenchFrame.src=workbenchFrame.dataset.src;
  </script>
</body>
</html>
"""


def scaffold(pages_dir: Path, pid: str, title: str, total: int) -> dict:
    """Create a thin deck page plus one isolated editable lesson layer."""
    pages_dir = pages_dir.resolve()
    shared = _ensure_shared_runtime(pages_dir)
    target = lesson_root(pages_dir, pid)
    manifest = target / ".notale-code-lesson.json"
    if target.exists() and any(target.iterdir()):
        if not manifest.is_file():
            raise FileExistsError(f"code lesson directory is non-empty and unmanaged: {target}")
    else:
        target.mkdir(parents=True, exist_ok=True)
        shutil.copytree(TEMPLATE_ROOT / "lesson", target / "lesson", dirs_exist_ok=True)
        shutil.copy2(TEMPLATE_ROOT / "check.py", target / "check.py")
        _configure(target, title.strip() or pid, pid)
        _relative_link(target / "core", shared / "core", directory=True)
        _relative_link(target / "runtime", shared / "runtime", directory=True)
        _relative_link(target / "assets", shared / "assets", directory=True)
        _relative_link(target / "styles.css", shared / "styles.css", directory=False)
        manifest.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "page": pid,
                    "title": title.strip() or pid,
                    "editable": list(EDITABLE),
                    "fixedRuntime": "../../code-runtime",
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )

    page_file = pages_dir / f"{pid}.html"
    page_file.write_text(_outer_page(pid, title.strip() or pid, total), encoding="utf-8")
    files = [
        {
            "path": str((target / rel).resolve()),
            "content": (target / rel).read_text(encoding="utf-8"),
        }
        for rel in EDITABLE
    ]
    return {
        "page": str(page_file),
        "workbench": str(target / "index.html"),
        "editable_root": str((target / "lesson").resolve()),
        "editable": files,
        "fixed_runtime": str(shared),
    }


def tool_guard(
    name: str,
    args: dict,
    pages_dir: Path,
    pid: str,
    resource_root: Path | None = None,
) -> str | None:
    """Reject any post-scaffold code tool access outside this page's ``lesson/``."""
    if name in {"ImageSearch", "ImageGen"}:
        return None  # executor allocates private media paths; no shell or theme access
    if name in {"Read", "Write", "Edit"}:
        raw = str(args.get("file_path") or "")
        if not raw:
            return "file_path is required"
        path = Path(raw)
        target = (path if path.is_absolute() else pages_dir / path).resolve()
        if (name == "Read" and target.is_relative_to((pages_dir / "assets/img").resolve())
                and target.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".gif"}):
            return None
        if (name == "Read" and resource_root is not None
                and target.is_relative_to(resource_root.resolve())):
            return None
        if not target.is_relative_to(editable_root(pages_dir, pid).resolve()):
            return f"{target} is fixed or belongs to another page; edit only {editable_root(pages_dir, pid)}"
        return None
    if name == "Check":
        if str(args.get("page") or "") != f"{pid}.html":
            return f"check only {pid}.html"
        return None
    return f"{name} is not available while authoring a code lesson"


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
