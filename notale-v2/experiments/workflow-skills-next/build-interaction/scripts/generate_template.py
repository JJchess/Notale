#!/usr/bin/env python3
"""Generate a self-contained Notale code-interaction lesson scaffold."""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import shutil
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_ROOT = SCRIPT_DIR.parent
V2_ROOT = SKILL_ROOT.parents[2]
TEMPLATE_ROOT = SKILL_ROOT / "assets" / "code-runtime-template"
VENDOR_ROOT = V2_ROOT / "vendor"
SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
SCHEMA_VERSION = 2


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        description="Create <output>/pages with the fixed code workbench and a sandboxed native HTML view."
    )
    result.add_argument("--output", required=True, type=Path, help="Absolute lesson output directory")
    result.add_argument("--title", required=True, help="Learner-facing lesson title")
    result.add_argument("--slug", required=True, help="Lowercase hyphenated lesson identifier")
    result.add_argument("--runtime", choices=("python",), default="python")
    result.add_argument(
        "--flat-output",
        action="store_true",
        help="Treat --output itself as the page root instead of creating <output>/pages",
    )
    result.add_argument(
        "--vendor-mode",
        choices=("copy", "symlink"),
        default="copy",
        help="Copy dependencies for portable output, or create relative symlinks for an in-repo demo",
    )
    result.add_argument(
        "--force",
        action="store_true",
        help="Overwrite generated paths while preserving unknown files; required for a non-empty output",
    )
    return result


def validate_args(args: argparse.Namespace) -> tuple[Path, Path]:
    raw_output = args.output.expanduser()
    if not raw_output.is_absolute():
        raise ValueError("--output 必须是绝对路径。")
    output = raw_output.resolve()
    pages = output if args.flat_output else output / "pages"
    if not args.title.strip():
        raise ValueError("--title 不能为空。")
    if not SLUG_PATTERN.fullmatch(args.slug):
        raise ValueError("--slug 只能包含小写字母、数字和单个连字符。")
    manifest_path = pages / ".code-runtime-template.json"
    if manifest_path.is_file():
        try:
            existing_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise ValueError(f"现有模板 manifest 无法读取：{error}") from error
        if existing_manifest.get("schemaVersion") != SCHEMA_VERSION:
            raise ValueError("旧版模板目录不支持原地升级；请新建目录，或按 v2 原生视图契约手工迁移。")
    if pages.exists() and any(pages.iterdir()) and not args.force:
        raise FileExistsError(f"目标 pages 目录非空：{pages}\n如需覆盖生成器拥有的路径，请显式使用 --force。")
    if not TEMPLATE_ROOT.is_dir():
        raise FileNotFoundError(f"模板目录不存在：{TEMPLATE_ROOT}")
    required_vendor = (
        VENDOR_ROOT / "chassis",
        VENDOR_ROOT / "monaco-editor",
        VENDOR_ROOT / "pyodide",
        VENDOR_ROOT / "vscode-codicons",
    )
    missing = [str(path) for path in required_vendor if not path.is_dir()]
    if missing:
        raise FileNotFoundError("缺少本地 vendor：\n" + "\n".join(missing))
    return output, pages


def remove_stale_owned_files(pages: Path) -> None:
    manifest_path = pages / ".code-runtime-template.json"
    if not manifest_path.is_file():
        return
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    current = {
        str(path.relative_to(TEMPLATE_ROOT))
        for path in TEMPLATE_ROOT.rglob("*")
        if path.is_file()
    }
    owned = {
        value
        for value in [*manifest.get("fixed", []), *manifest.get("editable", [])]
        if isinstance(value, str)
    }
    for relative in sorted(owned - current):
        relative_path = Path(relative)
        if relative_path.is_absolute() or ".." in relative_path.parts:
            raise ValueError(f"manifest 包含不安全的生成器路径：{relative}")
        target = pages / relative_path
        if target.is_symlink() or target.is_file():
            target.unlink()


def replace_with_symlink(target: Path, source: Path, force: bool) -> None:
    if target.is_symlink():
        target.unlink()
    elif target.exists():
        if not force:
            raise FileExistsError(f"共享 vendor 目标已存在：{target}")
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.symlink_to(Path(os.path.relpath(source, target.parent)), target_is_directory=source.is_dir())


def copy_sources(pages: Path, args: argparse.Namespace) -> None:
    pages.mkdir(parents=True, exist_ok=True)
    shutil.copytree(TEMPLATE_ROOT, pages, dirs_exist_ok=True)
    assets = pages / "assets"
    library_root = assets / "lib"
    if args.vendor_mode == "copy":
        shutil.copytree(VENDOR_ROOT / "chassis", assets, dirs_exist_ok=True)
        library_root.mkdir(parents=True, exist_ok=True)
        for name in ("monaco-editor", "pyodide", "vscode-codicons"):
            shutil.copytree(VENDOR_ROOT / name, library_root / name, dirs_exist_ok=True)
        return

    for name in ("base.css", "base.js"):
        replace_with_symlink(assets / name, VENDOR_ROOT / "chassis" / name, args.force)
    for name in ("monaco-editor", "pyodide", "vscode-codicons"):
        replace_with_symlink(library_root / name, VENDOR_ROOT / name, args.force)


def configure_template(pages: Path, args: argparse.Namespace) -> None:
    index_path = pages / "index.html"
    index = index_path.read_text(encoding="utf-8")
    index = index.replace("__LESSON_TITLE_TEXT__", html.escape(args.title.strip()))
    index_path.write_text(index, encoding="utf-8")

    lesson_path = pages / "lesson" / "lesson.js"
    lesson = lesson_path.read_text(encoding="utf-8")
    replacements = {
        "__LESSON_SLUG_JSON__": json.dumps(args.slug, ensure_ascii=False),
        "__LESSON_TITLE_JSON__": json.dumps(args.title.strip(), ensure_ascii=False),
    }
    for marker, value in replacements.items():
        lesson = lesson.replace(marker, value)
    lesson_path.write_text(lesson, encoding="utf-8")

    unresolved = []
    for path in (index_path, lesson_path):
        if "__LESSON_" in path.read_text(encoding="utf-8"):
            unresolved.append(str(path))
    if unresolved:
        raise RuntimeError("模板占位符未完全替换：" + ", ".join(unresolved))


def write_manifest(pages: Path, args: argparse.Namespace) -> None:
    template_files = sorted(
        str(path.relative_to(TEMPLATE_ROOT))
        for path in TEMPLATE_ROOT.rglob("*")
        if path.is_file()
    )
    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "generator": "build-interaction/scripts/generate_template.py",
        "lesson": {"id": args.slug, "title": args.title.strip()},
        "runtime": args.runtime,
        "view": {
            "mode": "native-html",
            "sandbox": "allow-scripts",
            "files": [
                "lesson/view/index.html",
                "lesson/view/style.css",
                "lesson/view/render.js",
            ],
            "contract": "window.renderNotaleView(packet)",
        },
        "flatOutput": bool(args.flat_output),
        "vendorMode": args.vendor_mode,
        "editable": [
            "lesson/lesson.js",
            "lesson/starter.py",
            "lesson/trace.py",
            "lesson/tests.py",
            "lesson/view/index.html",
            "lesson/view/style.css",
            "lesson/view/render.js",
        ],
        "fixed": [
            path
            for path in template_files
            if not path.startswith("lesson/")
        ],
        "vendorSources": {
            "chassis": "notale-v2/vendor/chassis",
            "monaco": "notale-v2/vendor/monaco-editor",
            "pyodide": "notale-v2/vendor/pyodide",
            "codicons": "notale-v2/vendor/vscode-codicons",
        },
    }
    (pages / ".code-runtime-template.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        output, pages = validate_args(args)
        output.mkdir(parents=True, exist_ok=True)
        remove_stale_owned_files(pages)
        copy_sources(pages, args)
        configure_template(pages, args)
        write_manifest(pages, args)
    except (OSError, RuntimeError, ValueError) as error:
        print(f"generate_template: {error}", file=sys.stderr)
        return 2

    print(f"Generated code interaction: {pages}")
    print(f"Editable lesson and native view: {pages / 'lesson'}")
    print("Preview from the page root: python3 -m http.server 4175")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
