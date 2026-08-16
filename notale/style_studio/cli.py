"""`notale style` — inspect, build, and publish StylePacks.

Merges deckbase's two CLIs (``style_studio.cli`` for reading, ``style_studio.build``
for writing) into one subcommand group.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Optional

from notale.style_studio.backplate import SafeArea
from notale.style_studio.bench import DEFAULT_SAFE_AREAS, run_bench_sync
from notale.style_studio.build.registry_user import (
    list_user_pack_ids,
    remove_user_pack,
    user_pack_dir,
)
from notale.style_studio.build.service import (
    apply_patch,
    from_images,
    from_pdf,
    from_pptx,
    from_text,
    merge_json,
    publish_pack,
)
from notale.style_studio.compile_style import compile_style
from notale.style_studio.materialize import materialize_to_run
from notale.style_studio.registry import (
    get_pack,
    list_packs,
    resolve_alias,
    validate_all_packs,
)
from notale.tools.media_backends import available_backends
from notale.utils.config import get_config


def _parse_safe_area(raw: str) -> SafeArea:
    try:
        role, x, y, width, height = [part.strip() for part in raw.split(",")]
        return SafeArea(role, float(x), float(y), float(width), float(height))
    except (TypeError, ValueError) as exc:
        raise argparse.ArgumentTypeError(
            "safe area must be ROLE,X,Y,W,H using frame fractions"
        ) from exc


def _parse_backends(raw: str) -> tuple[str, ...]:
    names = tuple(name.strip() for name in raw.split(",") if name.strip())
    if not names:
        raise argparse.ArgumentTypeError("at least one backend is required")
    unknown = sorted(set(names) - set(available_backends()))
    if unknown:
        raise argparse.ArgumentTypeError(
            f"unknown backend(s) {', '.join(unknown)}; known: {', '.join(available_backends())}"
        )
    return names


def _report_fallbacks(pack_id: str) -> None:
    """Surface any field the build had to fall back on.

    Falling back is the point — it keeps a bad palette from failing a run — but
    it must never be silent, or a user patches a colour and never learns it was
    rejected.
    """
    path = user_pack_dir(pack_id) / "merge_report.json"
    if not path.is_file():
        return
    report = json.loads(path.read_text(encoding="utf-8"))
    rejected = [
        field
        for field in report.get("fields") or []
        if "rejected" in str(field.get("note") or "")
    ]
    for field in rejected:
        print(
            f"  ! {field['path']} fell back to {field.get('source')}: {field.get('note')}",
            file=sys.stderr,
        )


def _cmd_list(args: argparse.Namespace) -> int:
    packs = list_packs(include_draft=True)
    if args.json:
        print(json.dumps(packs, ensure_ascii=False, indent=2))
        return 0
    for entry in packs:
        aliases = ", ".join(entry["aliases"]) or "-"
        print(
            f"{entry['id']:26}  {entry['root']:7}  status={entry['status']:11}  "
            f"aliases=[{aliases}]"
        )
    return 0


def _cmd_show(args: argparse.Namespace) -> int:
    pack = get_pack(args.pack_id)
    if args.json:
        print(json.dumps(pack.as_dict(), ensure_ascii=False, indent=2))
        return 0
    print(f"id:            {pack.id}")
    print(f"label:         {pack.label}")
    print(f"version:       {pack.version}")
    print(f"status:        {pack.status}")
    print(f"provenance:    {pack.provenance}")
    print(f"parent:        {pack.parent_id or '(none)'}")
    print(f"audience:      {pack.audience_hint}")
    print(f"density:       {pack.density_default}")
    print(f"radius:        {pack.radius_scale()}")
    print(f"pack_dir:      {pack.pack_dir}")
    print("tokens:")
    for key, value in pack.notale_tokens().items():
        print(f"  --notale-{key}: {value}")
    print(f"compositions:  {[item.id for item in pack.compositions()]}")
    print("role_exemplars:")
    for role in ("cover", "section", "content", "closing"):
        print(f"  {role}: {pack.role_exemplar_relpaths(role) or '(none)'}")
    return 0


def _cmd_validate(_: argparse.Namespace) -> int:
    results = validate_all_packs()
    bad = 0
    for pack_id, errors in results:
        if errors:
            bad += 1
            print(f"FAIL  {pack_id}")
            for error in errors:
                print(f"      - {error}")
        else:
            print(f"OK    {pack_id}")
    if bad:
        print(f"\n{bad} pack(s) failed validation", file=sys.stderr)
        return 1
    print(f"\nAll {len(results)} pack(s) valid.")
    return 0


def _cmd_resolve(args: argparse.Namespace) -> int:
    print(resolve_alias(args.name))
    return 0


def _cmd_compile(args: argparse.Namespace) -> int:
    bundle = compile_style(args.pack_id, page_role=args.role)
    if args.json:
        print(json.dumps(bundle.to_dict(), ensure_ascii=False, indent=2))
        return 0
    print(f"pack:         {bundle.pack_id}@{bundle.version}")
    print(f"description:  {bundle.description}")
    print(f"tokens:       {len(bundle.tokens)}")
    print(f"compositions: {[item.id for item in bundle.compositions]}")
    print(f"forbidden:    {bundle.forbidden}")
    print(f"exemplars:    {bundle.exemplar_paths or '(none)'}")
    print("--- body ---")
    print(bundle.body)
    return 0


def _cmd_fork(args: argparse.Namespace) -> int:
    from notale.style_studio.build.fork import fork_pack

    print(f"forked {args.parent} -> {fork_pack(args.parent, args.pack_id, label=args.label)}")
    return 0


def _cmd_from_text(args: argparse.Namespace) -> int:
    text = Path(args.file).read_text(encoding="utf-8") if args.file else (args.text or "")
    print(f"from-text -> {from_text(args.pack_id, text, parent_id=args.parent or '', label=args.label or '')}")
    _report_fallbacks(args.pack_id)
    return 0


def _cmd_from_images(args: argparse.Namespace) -> int:
    path = from_images(
        args.pack_id,
        [Path(p) for p in args.images],
        parent_id=args.parent or "",
        label=args.label or "",
    )
    print(f"from-images -> {path}")
    _report_fallbacks(args.pack_id)
    return 0


def _cmd_from_pptx(args: argparse.Namespace) -> int:
    path = from_pptx(args.pack_id, Path(args.pptx), parent_id=args.parent or "", label=args.label or "")
    print(f"from-pptx -> {path}")
    _report_fallbacks(args.pack_id)
    return 0


def _cmd_from_pdf(args: argparse.Namespace) -> int:
    path = from_pdf(args.pack_id, Path(args.pdf), parent_id=args.parent or "", label=args.label or "")
    print(f"from-pdf -> {path}")
    _report_fallbacks(args.pack_id)
    return 0


def _cmd_merge_json(args: argparse.Namespace) -> int:
    data = json.loads(Path(args.json_file).read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        print("merge-json requires a JSON object", file=sys.stderr)
        return 2
    print(f"merge-json -> {merge_json(args.pack_id, data, parent_id=args.parent or '')}")
    _report_fallbacks(args.pack_id)
    return 0


def _cmd_patch(args: argparse.Namespace) -> int:
    data = (
        json.loads(Path(args.json_file).read_text(encoding="utf-8"))
        if args.json_file
        else json.loads(args.patch)
    )
    if not isinstance(data, dict):
        print("patch requires a JSON object", file=sys.stderr)
        return 2
    print(f"patch -> {apply_patch(args.pack_id, data)}")
    _report_fallbacks(args.pack_id)
    return 0


def _cmd_exemplars(args: argparse.Namespace) -> int:
    from notale.style_studio.exemplars import render_pack_exemplars

    rendered = render_pack_exemplars(args.pack_id, pages=args.pages)
    for role, names in rendered.items():
        print(f"  {role}: {names or '(none)'}")
    return 0


def _cmd_preview(args: argparse.Namespace) -> int:
    from notale.style_studio.preview import run_preview

    result = run_preview(args.pack_id, promote=not args.no_promote)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result.get("ok") else 1


def _cmd_publish(args: argparse.Namespace) -> int:
    print(f"published -> {publish_pack(args.pack_id)}")
    return 0


def _cmd_materialize(args: argparse.Namespace) -> int:
    style = materialize_to_run(args.pack_id, Path(args.run_dir))
    print(f"materialized {resolve_alias(args.pack_id)} -> {args.run_dir}")
    print(f"  design skill: {style.name}@{style.sha256[:12]}")
    return 0


def _cmd_matrix(args: argparse.Namespace) -> int:
    import asyncio

    from notale.style_studio.lab import run_matrix

    payload = asyncio.run(
        run_matrix(args.cells or (), render=not args.no_render, run_id=args.run_id or "")
    )
    for cell in payload["cells"]:
        mark = "OK  " if cell["ok"] else "FAIL"
        print(f"{mark} {cell['cell_id']:24} {cell['pack_id']:20} qa={cell['qa']}")
        for note in (cell["failures"] + cell["qa_failures"])[:4]:
            print(f"       - {note}")
    print(f"\nreport: {payload['out_dir']}")
    # Nonzero on any failing cell, so the matrix works as a CI gate.
    return 0 if payload["ok"] else 1


def _cmd_shelf(args: argparse.Namespace) -> int:
    from notale.style_studio.lab import catalog_packs

    rows = catalog_packs()
    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return 0
    for row in rows:
        if row.get("error"):
            print(f"{row['id']:24} ERROR {row['error']}")
            continue
        tokens = row["tokens"]
        swatch = " ".join(tokens.get(key, "") for key in ("bg", "ink", "accent"))
        print(
            f"{row['id']:24} {row['status']:11} {row['radius']:6} "
            f"{swatch}  exemplars={len(row['exemplars'])}"
        )
    return 0


def _cmd_backplate_bench(args: argparse.Namespace) -> int:
    try:
        payload = run_bench_sync(
            pack_id=args.pack_id,
            composition_id=args.composition,
            backends=args.backends,
            repeats=args.repeats,
            subject=args.subject,
            safe_areas=args.safe_areas or DEFAULT_SAFE_AREAS,
            run_id=args.run_id,
        )
    except (ValueError, FileNotFoundError, FileExistsError, KeyError) as exc:
        print(f"backplate-bench: {exc}", file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        for backend, summary in payload["summary"].items():
            print(
                f"{backend:16} ok={summary['ok']}/{summary['runs']} "
                f"p50={summary['p50_sec']:.3f}s p95={summary['p95_sec']:.3f}s "
                f"attempts={summary['total_attempts']} cost="
                f"{summary['total_cost'] if summary['total_cost'] is not None else 'unavailable'}"
            )
        print(f"\nreport: {payload['report']}")
    return 0 if payload["ok"] else 1


def _cmd_remove(args: argparse.Namespace) -> int:
    if args.pack_id not in list_user_pack_ids():
        print(f"not a user pack: {args.pack_id}", file=sys.stderr)
        return 2
    remove_user_pack(args.pack_id)
    print(f"removed {args.pack_id}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="notale style", description="StylePack registry and build operations"
    )
    sub = parser.add_subparsers(dest="style_command", required=True)

    p = sub.add_parser("list", help="List registered StylePacks")
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=_cmd_list)

    p = sub.add_parser("show", help="Show one StylePack")
    p.add_argument("pack_id")
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=_cmd_show)

    p = sub.add_parser("validate", help="Validate every registered pack")
    p.set_defaults(func=_cmd_validate)

    p = sub.add_parser("resolve", help="Resolve an alias to a canonical pack id")
    p.add_argument("name")
    p.set_defaults(func=_cmd_resolve)

    p = sub.add_parser("compile", help="Show the compiled Skill body and tokens")
    p.add_argument("pack_id")
    p.add_argument("--role", default="content", help="cover|section|content|closing")
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=_cmd_compile)

    p = sub.add_parser("fork", help="Fork a pack into a user draft")
    p.add_argument("parent")
    p.add_argument("pack_id")
    p.add_argument("--label", default=None)
    p.set_defaults(func=_cmd_fork)

    p = sub.add_parser("from-text", help="Build a pack from a prose description")
    p.add_argument("pack_id")
    p.add_argument("--text", default="")
    p.add_argument("--file", default="")
    p.add_argument("--parent", default="")
    p.add_argument("--label", default="")
    p.set_defaults(func=_cmd_from_text)

    p = sub.add_parser("from-images", help="Build a pack from reference images")
    p.add_argument("pack_id")
    p.add_argument("images", nargs="+")
    p.add_argument("--parent", default="")
    p.add_argument("--label", default="")
    p.set_defaults(func=_cmd_from_images)

    p = sub.add_parser("from-pptx", help="Build a pack from a .pptx/.potx theme")
    p.add_argument("pack_id")
    p.add_argument("pptx")
    p.add_argument("--parent", default="")
    p.add_argument("--label", default="")
    p.set_defaults(func=_cmd_from_pptx)

    p = sub.add_parser("from-pdf", help="Build a pack from a brand PDF")
    p.add_argument("pack_id")
    p.add_argument("pdf")
    p.add_argument("--parent", default="")
    p.add_argument("--label", default="")
    p.set_defaults(func=_cmd_from_pdf)

    p = sub.add_parser("merge-json", help="Merge a JSON fragment into a pack")
    p.add_argument("pack_id")
    p.add_argument("--json", dest="json_file", required=True)
    p.add_argument("--parent", default="")
    p.set_defaults(func=_cmd_merge_json)

    p = sub.add_parser("patch", help="Patch an existing user pack")
    p.add_argument("pack_id")
    p.add_argument("--json", dest="json_file", default="")
    p.add_argument("--patch", default="")
    p.set_defaults(func=_cmd_patch)

    p = sub.add_parser("exemplars", help="Render representative pages into the pack")
    p.add_argument("pack_id")
    p.add_argument("--pages", type=int, default=0, help="0 uses config style.exemplar_pages")
    p.set_defaults(func=_cmd_exemplars)

    p = sub.add_parser("preview", help="Render and QA a pack, promoting it on success")
    p.add_argument("pack_id")
    p.add_argument("--no-promote", action="store_true")
    p.set_defaults(func=_cmd_preview)

    p = sub.add_parser("publish", help="Mark a user pack published")
    p.add_argument("pack_id")
    p.set_defaults(func=_cmd_publish)

    p = sub.add_parser("materialize", help="Write a pack's design Skill into a run")
    p.add_argument("pack_id")
    p.add_argument("--run-dir", required=True)
    p.set_defaults(func=_cmd_materialize)

    p = sub.add_parser("matrix", help="Build and measure a matrix of style recipes")
    p.add_argument("cells", nargs="*", help="cell ids or prefixes; empty means all")
    p.add_argument("--no-render", action="store_true", help="skip specimen rendering")
    p.add_argument("--run-id", default="", help="output subdirectory name")
    p.set_defaults(func=_cmd_matrix)

    p = sub.add_parser("shelf", help="List every pack with its palette and exemplars")
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=_cmd_shelf)

    p = sub.add_parser(
        "backplate-bench",
        help="Compare image backends on one identical backplate contract",
    )
    p.add_argument("pack_id")
    p.add_argument("--composition", required=True, help="composition id from the pack")
    p.add_argument(
        "--backends",
        type=_parse_backends,
        default=(get_config().media.backend,),
        help="comma-separated backend names",
    )
    p.add_argument("--repeats", type=int, default=1)
    p.add_argument(
        "--subject",
        default="an abstract textured ground for a lecture slide",
    )
    p.add_argument(
        "--safe-area",
        dest="safe_areas",
        action="append",
        type=_parse_safe_area,
        default=[],
        metavar="ROLE,X,Y,W,H",
    )
    p.add_argument("--run-id", default="", help="unique output directory name")
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=_cmd_backplate_bench)

    p = sub.add_parser("remove", help="Delete a user pack")
    p.add_argument("pack_id")
    p.set_defaults(func=_cmd_remove)

    return parser


def main(argv: Optional[list[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
