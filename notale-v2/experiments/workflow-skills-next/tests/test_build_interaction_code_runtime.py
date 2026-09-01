#!/usr/bin/env python3
"""Deterministic generator and template contract tests."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path


HERE = Path(__file__).resolve().parent
WORKFLOW_ROOT = HERE.parent
GENERATOR = WORKFLOW_ROOT / "build-interaction" / "scripts" / "generate_template.py"


def run(*args: str, expected: int = 0) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        [sys.executable, str(GENERATOR), *args],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != expected:
        raise AssertionError(
            f"expected exit {expected}, got {result.returncode}\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )
    return result


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="notale-code-runtime-") as raw:
        root = Path(raw)
        output = root / "lesson"
        run(
            "--output", str(output),
            "--title", "图搜索：队列如何推进边界？",
            "--slug", "graph-frontier",
            "--runtime", "python",
        )
        pages = output / "pages"
        required = (
            "index.html",
            "styles.css",
            "core/workbench.js",
            "core/runtime-client.js",
            "core/native-view.css",
            "core/native-view-bridge.js",
            "core/native-view-host.js",
            "runtime/python-worker.js",
            "lesson/lesson.js",
            "lesson/starter.py",
            "lesson/trace.py",
            "lesson/tests.py",
            "lesson/view/index.html",
            "lesson/view/style.css",
            "lesson/view/render.js",
            "assets/base.css",
            "assets/base.js",
            "assets/lib/monaco-editor/min/vs/loader.js",
            "assets/lib/pyodide/pyodide.mjs",
            "assets/lib/pyodide/pyodide.asm.wasm",
            "assets/lib/vscode-codicons/codicon.css",
            ".code-runtime-template.json",
            "check.py",
        )
        missing = [name for name in required if not (pages / name).is_file()]
        assert not missing, missing

        index = (pages / "index.html").read_text(encoding="utf-8")
        lesson = (pages / "lesson" / "lesson.js").read_text(encoding="utf-8")
        assert "图搜索：队列如何推进边界？" in index
        assert 'id: "graph-frontier"' in lesson
        assert "__LESSON_" not in index + lesson

        manifest = json.loads((pages / ".code-runtime-template.json").read_text(encoding="utf-8"))
        assert manifest["schemaVersion"] == 2
        assert manifest["view"]["mode"] == "native-html"
        assert manifest["view"]["sandbox"] == "allow-scripts"
        assert manifest["view"]["contract"] == "window.renderNotaleView(packet)"
        assert "lesson/view/render.js" in manifest["editable"]
        assert "core/native-view-host.js" in manifest["fixed"]
        assert "core/workbench.js" in manifest["fixed"]
        assert not (pages / "core" / "render-kit.js").exists()
        assert not (pages / "core" / "render-kit.css").exists()
        assert not (pages / "lesson" / "visualizer.js").exists()

        owned_sources = [
            path
            for path in pages.rglob("*")
            if path.is_file() and "assets/lib" not in path.as_posix()
        ]
        forbidden = []
        for path in owned_sources:
            if path.suffix.lower() not in {".html", ".css", ".js", ".py", ".json", ".md"}:
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
            text = text.replace("http://www.w3.org/2000/svg", "")
            text = text.replace("http://127.0.0.1", "")
            if "https://" in text or "http://" in text:
                forbidden.append(str(path.relative_to(pages)))
        assert not forbidden, f"runtime network URLs found: {forbidden}"

        refused = run(
            "--output", str(output),
            "--title", "不能静默覆盖",
            "--slug", "no-overwrite",
            expected=2,
        )
        assert "非空" in refused.stderr

        unknown = pages / "lesson" / "author-notes.txt"
        unknown.write_text("preserve me", encoding="utf-8")
        obsolete = pages / "core" / "obsolete-owned.js"
        obsolete.write_text("remove me", encoding="utf-8")
        manifest["fixed"].append("core/obsolete-owned.js")
        (pages / ".code-runtime-template.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        run(
            "--output", str(output),
            "--title", "强制更新",
            "--slug", "forced-update",
            "--force",
        )
        assert unknown.read_text(encoding="utf-8") == "preserve me"
        assert not obsolete.exists()

        legacy = root / "legacy"
        legacy_pages = legacy / "pages"
        legacy_pages.mkdir(parents=True)
        (legacy_pages / ".code-runtime-template.json").write_text(
            json.dumps({"schemaVersion": 1, "generator": "build-interaction/scripts/generate_template.py"}),
            encoding="utf-8",
        )
        rejected_legacy = run(
            "--output", str(legacy),
            "--title", "旧模板",
            "--slug", "legacy-template",
            "--force",
            expected=2,
        )
        assert "不支持原地升级" in rejected_legacy.stderr

        unsafe = root / "unsafe-manifest"
        unsafe_pages = unsafe / "pages"
        unsafe_pages.mkdir(parents=True)
        (unsafe_pages / ".code-runtime-template.json").write_text(
            json.dumps({"schemaVersion": 2, "fixed": ["../../outside.txt"], "editable": []}),
            encoding="utf-8",
        )
        rejected_unsafe = run(
            "--output", str(unsafe),
            "--title", "不安全 manifest",
            "--slug", "unsafe-manifest",
            "--force",
            expected=2,
        )
        assert "不安全" in rejected_unsafe.stderr

        retired_option = run(
            "--output", str(root / "retired-option"),
            "--title", "旧参数",
            "--slug", "retired-option",
            "--visualizer", "network",
            expected=2,
        )
        assert "unrecognized arguments" in retired_option.stderr

        relative = run(
            "--output", "relative-output",
            "--title", "非法路径",
            "--slug", "bad-path",
            expected=2,
        )
        assert "绝对路径" in relative.stderr

        invalid = run(
            "--output", str(root / "invalid"),
            "--title", "非法 slug",
            "--slug", "Bad_Slug",
            expected=2,
        )
        assert "slug" in invalid.stderr

        flat = root / "flat-demo"
        run(
            "--output", str(flat),
            "--title", "共享依赖演示",
            "--slug", "shared-demo",
            "--flat-output",
            "--vendor-mode", "symlink",
        )
        assert (flat / "index.html").is_file()
        assert not (flat / "pages").exists()
        assert (flat / "assets" / "base.css").is_symlink()
        assert (flat / "assets" / "base.css").resolve().is_file()
        for name in ("monaco-editor", "pyodide", "vscode-codicons"):
            link = flat / "assets" / "lib" / name
            assert link.is_symlink(), link
            assert link.resolve().is_dir(), link
        flat_manifest = json.loads((flat / ".code-runtime-template.json").read_text(encoding="utf-8"))
        assert flat_manifest["flatOutput"] is True
        assert flat_manifest["vendorMode"] == "symlink"

    print("generator and template contract: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
