#!/usr/bin/env python3
"""Developer utility: materialize a bundled code sample for preview or regression tests."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
WORKFLOW_ROOT = SCRIPT_DIR.parent
SKILL_ROOT = WORKFLOW_ROOT / "build-interaction"
SAMPLES_ROOT = SKILL_ROOT / "samples" / "code"
CATALOG_PATH = SCRIPT_DIR / "code_sample_catalog.json"
MANIFEST_NAME = ".code-runtime-template.json"
REQUIRED_METADATA = ("title", "slug", "relationship", "entry", "signature")

sys.path.insert(0, str(SKILL_ROOT / "scripts"))
import generate_template  # noqa: E402


def load_catalog() -> dict[str, dict]:
    try:
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"开发工具的 sample catalog 无法读取：{CATALOG_PATH}: {error}") from error
    if not isinstance(catalog, dict):
        raise ValueError("开发工具的 sample catalog 必须是对象。")
    for sample_id, metadata in catalog.items():
        if not isinstance(sample_id, str) or not sample_id or not isinstance(metadata, dict):
            raise ValueError("开发工具的 sample catalog 包含无效条目。")
        missing = [key for key in REQUIRED_METADATA if not isinstance(metadata.get(key), str) or not metadata[key].strip()]
        if missing:
            raise ValueError(f"sample {sample_id} metadata 缺少非空字段：{', '.join(missing)}")
    return catalog


def discover_samples(catalog: dict[str, dict]) -> dict[str, Path]:
    if not SAMPLES_ROOT.is_dir():
        return {}
    samples = {
        path.name: path
        for path in sorted(SAMPLES_ROOT.iterdir())
        if path.is_dir() and (path / "lesson").is_dir()
    }
    if set(samples) != set(catalog):
        missing = sorted(set(catalog) - set(samples))
        unknown = sorted(set(samples) - set(catalog))
        details = []
        if missing:
            details.append(f"缺少 sample 目录：{', '.join(missing)}")
        if unknown:
            details.append(f"catalog 未登记：{', '.join(unknown)}")
        raise ValueError("；".join(details))
    return samples


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        description="Generate one bundled code-interaction sample using the canonical v2 workbench."
    )
    result.add_argument("--list", action="store_true", help="List bundled sample IDs and exit")
    result.add_argument("--sample", help="Bundled sample ID")
    result.add_argument("--output", type=Path, help="Absolute output directory")
    result.add_argument(
        "--flat-output",
        action="store_true",
        help="Treat --output itself as the page root instead of creating <output>/pages",
    )
    result.add_argument(
        "--vendor-mode",
        choices=("copy", "symlink"),
        default="copy",
        help="Copy dependencies for portability, or symlink repository vendor files",
    )
    result.add_argument(
        "--force",
        action="store_true",
        help="Rewrite generated and sample-owned paths while preserving unknown files",
    )
    return result


def validate_sample(sample_id: str, sample_root: Path, metadata: dict) -> dict:
    lesson_root = sample_root / "lesson"
    required_files = (
        "lesson.js",
        metadata["entry"],
        "trace.py",
        "view/index.html",
        "view/style.css",
        "view/render.js",
    )
    missing_files = [relative for relative in required_files if not (lesson_root / relative).is_file()]
    if missing_files:
        raise ValueError(f"sample {sample_id} 缺少 lesson 文件：{', '.join(missing_files)}")
    return {"id": sample_id, **metadata}


def author_files(sample_root: Path) -> list[str]:
    return sorted(
        str(Path("lesson") / path.relative_to(sample_root / "lesson"))
        for path in (sample_root / "lesson").rglob("*")
        if path.is_file() and "__pycache__" not in path.parts and path.suffix != ".pyc"
    )


def safe_target(pages: Path, relative: str) -> Path:
    relative_path = Path(relative)
    if relative_path.is_absolute() or ".." in relative_path.parts:
        raise ValueError(f"manifest 包含不安全路径：{relative}")
    return pages / relative_path


def overlay_sample(pages: Path, sample_root: Path, metadata: dict) -> None:
    manifest_path = pages / MANIFEST_NAME
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    files = author_files(sample_root)
    file_set = set(files)

    for relative in manifest.get("editable", []):
        if not isinstance(relative, str) or not relative.startswith("lesson/") or relative in file_set:
            continue
        target = safe_target(pages, relative)
        if target.is_symlink() or target.is_file():
            target.unlink()

    shutil.copytree(sample_root / "lesson", pages / "lesson", dirs_exist_ok=True)
    manifest["generator"] = "workflow-skills-next/tools/generate_code_sample.py"
    manifest["baseGenerator"] = "build-interaction/scripts/generate_template.py"
    manifest["lesson"] = {"id": metadata["slug"], "title": metadata["title"]}
    manifest["sample"] = {
        "id": metadata["id"],
        "relationship": metadata["relationship"],
        "signature": metadata["signature"],
        "source": f"samples/code/{metadata['id']}",
    }
    manifest["editable"] = files
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def run(args: argparse.Namespace) -> int:
    catalog = load_catalog()
    samples = discover_samples(catalog)
    if args.list:
        for sample_id, sample_root in samples.items():
            metadata = validate_sample(sample_id, sample_root, catalog[sample_id])
            print(f"{sample_id}\t{metadata['title']}\t{metadata['relationship']}")
        return 0

    if not args.sample:
        raise ValueError("必须提供 --sample；使用 --list 查看可用 sample。")
    if args.sample not in samples:
        choices = ", ".join(samples) or "（无）"
        raise ValueError(f"未知 sample：{args.sample}；可用值：{choices}")
    if args.output is None:
        raise ValueError("必须提供 --output。")

    sample_root = samples[args.sample]
    metadata = validate_sample(args.sample, sample_root, catalog[args.sample])
    template_args = [
        "--output", str(args.output),
        "--title", metadata["title"],
        "--slug", metadata["slug"],
        "--runtime", "python",
        "--vendor-mode", args.vendor_mode,
    ]
    if args.flat_output:
        template_args.append("--flat-output")
    if args.force:
        print("generate_code_sample: --force 将重写模板及 sample 拥有的文件。", file=sys.stderr)
        template_args.append("--force")

    result = generate_template.main(template_args)
    if result != 0:
        return result
    pages = args.output.expanduser().resolve() if args.flat_output else args.output.expanduser().resolve() / "pages"
    overlay_sample(pages, sample_root, metadata)
    print(f"Applied sample: {metadata['id']} ({metadata['relationship']})")
    print(f"Author layer: {pages / 'lesson'}")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        return run(args)
    except (OSError, RuntimeError, ValueError) as error:
        print(f"generate_code_sample: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
