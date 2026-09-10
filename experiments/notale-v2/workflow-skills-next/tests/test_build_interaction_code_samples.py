#!/usr/bin/env python3
"""Contract tests for bundled orthogonal code-runtime samples."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path


HERE = Path(__file__).resolve().parent
WORKFLOW_ROOT = HERE.parent
SKILL_ROOT = WORKFLOW_ROOT / "build-interaction"
GENERATOR = WORKFLOW_ROOT / "tools" / "generate_code_sample.py"
CATALOG = WORKFLOW_ROOT / "tools" / "code_sample_catalog.json"
SAMPLES_ROOT = SKILL_ROOT / "samples" / "code"
SAMPLE_IDS = ("tree-traversal", "grid-bfs", "edit-distance", "euclid-recursion")


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


def sample_files(sample_id: str) -> set[str]:
    lesson_root = SAMPLES_ROOT / sample_id / "lesson"
    return {
        str(Path("lesson") / path.relative_to(lesson_root))
        for path in lesson_root.rglob("*")
        if path.is_file() and "__pycache__" not in path.parts and path.suffix != ".pyc"
    }


def check_sources(pages: Path, expected_files: set[str]) -> None:
    actual_files = {
        str(path.relative_to(pages))
        for path in (pages / "lesson").rglob("*")
        if path.is_file()
    }
    assert actual_files == expected_files, (actual_files - expected_files, expected_files - actual_files)

    view_root = pages / "lesson" / "view"
    markup = (view_root / "index.html").read_text(encoding="utf-8").lower()
    for forbidden in ("html", "head", "body", "script", "style", "iframe", "object", "embed"):
        assert f"<{forbidden}>" not in markup, forbidden
        assert f"<{forbidden} " not in markup, forbidden
    render_source = (view_root / "render.js").read_text(encoding="utf-8")
    assert "window.renderNotaleView =" in render_source
    assert "fetch(" not in render_source
    assert "postMessage" not in render_source
    node_check = subprocess.run(
        ["node", "--check", str(view_root / "render.js")],
        text=True,
        capture_output=True,
        check=False,
    )
    assert node_check.returncode == 0, node_check.stderr

    for path in (pages / "lesson").glob("*.py"):
        compile(path.read_text(encoding="utf-8"), str(path), "exec")


def main() -> int:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    listed = run("--list").stdout
    assert all(f"{sample_id}\t" in listed for sample_id in SAMPLE_IDS), listed

    with tempfile.TemporaryDirectory(prefix="notale-code-samples-") as raw:
        root = Path(raw)
        relationships = set()
        signatures = set()
        for sample_id in SAMPLE_IDS:
            sample_root = SAMPLES_ROOT / sample_id
            assert {path.name for path in sample_root.iterdir()} == {"lesson"}, sample_root
            output = root / sample_id
            run(
                "--sample", sample_id,
                "--output", str(output),
                "--flat-output",
                "--vendor-mode", "symlink",
            )
            assert (output / "index.html").is_file()
            assert (output / "assets" / "lib" / "pyodide").is_symlink()
            assert not (output / "lesson" / "starter.py").exists()
            assert not (output / "core" / "render-kit.js").exists()
            check_sources(output, sample_files(sample_id))

            metadata = catalog[sample_id]
            manifest = json.loads((output / ".code-runtime-template.json").read_text(encoding="utf-8"))
            assert manifest["schemaVersion"] == 2
            assert manifest["generator"] == "workflow-skills-next/tools/generate_code_sample.py"
            assert manifest["baseGenerator"] == "build-interaction/scripts/generate_template.py"
            assert manifest["sample"]["id"] == sample_id
            assert manifest["sample"]["relationship"] == metadata["relationship"]
            assert manifest["sample"]["signature"] == metadata["signature"]
            assert set(manifest["editable"]) == sample_files(sample_id)
            assert "core/workbench.js" in manifest["fixed"]
            relationships.add(metadata["relationship"])
            signatures.add(metadata["signature"])

        assert len(relationships) == len(SAMPLE_IDS)
        assert len(signatures) == len(SAMPLE_IDS)

        switch = root / "switch-sample"
        run(
            "--sample", "tree-traversal", "--output", str(switch),
            "--flat-output", "--vendor-mode", "symlink",
        )
        unknown = switch / "lesson" / "author-notes.txt"
        unknown.write_text("preserve me", encoding="utf-8")
        run(
            "--sample", "grid-bfs", "--output", str(switch),
            "--flat-output", "--vendor-mode", "symlink", "--force",
        )
        assert unknown.read_text(encoding="utf-8") == "preserve me"
        assert not (switch / "lesson" / "inorder.py").exists()
        assert (switch / "lesson" / "bfs.py").is_file()

        rejected = run(
            "--sample", "not-a-sample", "--output", str(root / "bad"),
            expected=2,
        )
        assert "未知 sample" in rejected.stderr

    print("orthogonal code samples: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
