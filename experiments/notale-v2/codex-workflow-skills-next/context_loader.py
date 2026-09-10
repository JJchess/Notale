#!/usr/bin/env python3
"""Load one workflow reference and selected samples as a bounded context block."""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


MAX_AUX = 3
MAX_AUX_CHARS = 30_000
MAX_BUNDLE_CHARS = 110_000
LANGUAGES = {
    ".css": "css",
    ".html": "html",
    ".js": "javascript",
    ".json": "json",
    ".md": "markdown",
    ".mjs": "javascript",
    ".py": "python",
    ".svg": "svg",
}


def chars(path: Path) -> int:
    return len(path.read_text(encoding="utf-8"))


def fence_for(text: str) -> str:
    longest = max((len(run) for run in re.findall(r"`+", text)), default=0)
    return "`" * max(3, longest + 1)


def sample_index(catalog: dict) -> dict[str, dict]:
    rows = catalog.get("samples")
    if not isinstance(rows, list):
        raise ValueError("samples/catalog.json must contain a samples list")
    out = {}
    for row in rows:
        sid = row.get("id")
        if not isinstance(sid, str) or not sid or sid in out:
            raise ValueError(f"invalid or duplicate sample id: {sid!r}")
        out[sid] = row
    return out


def variant_files(skill_root: Path, spec: dict) -> tuple[list[tuple[Path, str]], int]:
    root = (skill_root / spec["root"]).resolve()
    try:
        root.relative_to(skill_root.resolve())
    except ValueError as exc:
        raise ValueError(f"sample root escapes skill: {root}") from exc
    loaded = []
    total = 0
    for rel in spec.get("files", []):
        path = (root / rel).resolve()
        try:
            path.relative_to(root)
        except ValueError as exc:
            raise ValueError(f"sample file escapes root: {rel}") from exc
        if not path.is_file():
            raise FileNotFoundError(path)
        text = path.read_text(encoding="utf-8")
        total += len(text)
        loaded.append((path, text))
    if total != spec.get("chars"):
        raise ValueError(
            f"catalog char mismatch for {spec['root']}: declared {spec.get('chars')}, actual {total}"
        )
    return loaded, total


def choose_aux_variant(row: dict) -> tuple[str, dict]:
    if row.get("mini"):
        return "mini", row["mini"]
    full = row["full"]
    if full.get("chars", MAX_BUNDLE_CHARS) < 10_000:
        return "full", full
    raise ValueError(f"sample {row['id']} has no approved auxiliary-sized variant")


def append_log(path: str | None, record: dict) -> None:
    if not path:
        return
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")


def render_sample(skill_root: Path, row: dict, role: str, variant: str, spec: dict) -> tuple[str, int]:
    files, total = variant_files(skill_root, spec)
    attrs = {
        "id": row["id"],
        "role": role,
        "variant": variant,
        "category": row["category"],
        "chars": str(total),
    }
    attr_text = " ".join(f'{key}="{html.escape(value, quote=True)}"' for key, value in attrs.items())
    parts = [f"  <sample {attr_text}>"]
    for path, text in files:
        rel = path.relative_to(skill_root).as_posix()
        language = LANGUAGES.get(path.suffix.lower(), "text")
        fence = fence_for(text)
        parts.extend(
            (
                f'    <file path="{html.escape(rel, quote=True)}" language="{language}">',
                f"{fence}{language}",
                text,
                fence,
                "    </file>",
            )
        )
    parts.append("  </sample>")
    return "\n".join(parts), total


def load(args: argparse.Namespace) -> dict:
    skill_root = Path(args.skill_root or os.environ.get("WORKFLOW_SKILL_ROOT", "")).resolve()
    if not (skill_root / "SKILL.md").is_file():
        raise FileNotFoundError("WORKFLOW_SKILL_ROOT does not point to an installed workflow skill")
    mode = args.mode or os.environ.get("WORKFLOW_CONTEXT_MODE", "full")
    if mode not in {"reference", "full"}:
        raise ValueError("context mode must be reference or full")

    reference = skill_root / "references" / f"{args.reference}.md"
    if not reference.is_file():
        raise ValueError(f"unknown reference category: {args.reference}")
    reference_text = reference.read_text(encoding="utf-8")

    catalog_path = skill_root / "samples" / "catalog.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8")) if catalog_path.is_file() else {"samples": []}
    samples = sample_index(catalog)
    selected: list[tuple[dict, str, str, dict]] = []

    if mode == "reference":
        if args.main or args.aux:
            raise ValueError("reference arm does not expose samples")
    else:
        if args.reference == "3d" and skill_root.name == "build-interaction":
            if args.main or args.aux:
                raise ValueError("build-interaction/3d has no approved samples")
        else:
            if not args.main:
                raise ValueError("full mode requires one main sample")
            main = samples.get(args.main)
            if not main or not main.get("main") or main.get("category") != args.reference:
                raise ValueError(f"invalid main sample for {args.reference}: {args.main!r}")
            selected.append((main, "main", "full", main["full"]))

            if len(args.aux) > MAX_AUX:
                raise ValueError(f"at most {MAX_AUX} auxiliary samples are allowed")
            if len(set(args.aux)) != len(args.aux) or args.main in args.aux:
                raise ValueError("main and auxiliary sample ids must be distinct")
            for sid in args.aux:
                row = samples.get(sid)
                if not row or not row.get("aux") or row.get("category") != args.reference:
                    raise ValueError(f"invalid auxiliary sample for {args.reference}: {sid!r}")
                variant, spec = choose_aux_variant(row)
                selected.append((row, "aux", variant, spec))

            if args.reference == "code" and (args.main != "code-core-bundle" or args.aux):
                raise ValueError("code category loads only code-core-bundle without auxiliaries")

    sample_blocks = []
    sample_total = 0
    aux_total = 0
    records = []
    for row, role, variant, spec in selected:
        block, total = render_sample(skill_root, row, role, variant, spec)
        sample_blocks.append(block)
        sample_total += total
        if role == "aux":
            aux_total += total
        records.append({"id": row["id"], "role": role, "variant": variant, "chars": total})
    if aux_total > MAX_AUX_CHARS:
        raise ValueError(f"auxiliary budget exceeded: {aux_total} > {MAX_AUX_CHARS}")

    skill_chars = chars(skill_root / "SKILL.md")
    total = skill_chars + len(reference_text) + sample_total
    if total > MAX_BUNDLE_CHARS:
        raise ValueError(f"context budget exceeded: {total} > {MAX_BUNDLE_CHARS}")

    relative_reference = reference.relative_to(skill_root).as_posix()
    body = [
        f'<workflow_context skill="{html.escape(skill_root.name)}" category="{html.escape(args.reference)}" chars="{total}">',
        f'  <reference path="{html.escape(relative_reference)}" chars="{len(reference_text)}">',
        reference_text,
        "  </reference>",
    ]
    if sample_blocks:
        body.append(" <samples>")
        body.extend(sample_blocks)
        body.append(" </samples>")
    body.append("</workflow_context>")
    output = "\n".join(body)

    record = {
        "at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "skill": skill_root.name,
        "mode": mode,
        "reference": args.reference,
        "reference_path": relative_reference,
        "samples": records,
        "aux_chars": aux_total,
        "bundle_chars": total,
    }
    append_log(args.log or os.environ.get("WORKFLOW_CONTEXT_LOG"), record)
    return {"output": output, "record": record}


def parser() -> argparse.ArgumentParser:
    out = argparse.ArgumentParser(description=__doc__)
    out.add_argument("--reference", required=True)
    out.add_argument("--main")
    out.add_argument("--aux", action="append", default=[])
    out.add_argument("--skill-root", help=argparse.SUPPRESS)
    out.add_argument("--mode", choices=("reference", "full"), help=argparse.SUPPRESS)
    out.add_argument("--log", help=argparse.SUPPRESS)
    return out


def main() -> int:
    try:
        result = load(parser().parse_args())
    except (FileNotFoundError, ValueError, json.JSONDecodeError, UnicodeDecodeError) as error:
        print(f"workflow-context: {error}", file=sys.stderr)
        return 2
    print(result["output"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
