#!/usr/bin/env python3
"""Export one Builder page's actual first request and observed workflow reads.

    python3 dump_page.py --label RUN --page page-04 --out /tmp/page-04.md
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from core import builder, skills


ROOT = Path(__file__).resolve().parent


def fence(text: str, language: str = "") -> str:
    longest = max((len(run) for run in re.findall(r"`+", text)), default=0)
    marker = "`" * max(3, longest + 1)
    return f"{marker}{language}\n{text.rstrip()}\n{marker}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", required=True)
    parser.add_argument("--page", required=True, help="例如 page-04")
    parser.add_argument("--out", required=True)
    parser.add_argument("--workflows", default=str(skills.WORKFLOWS))
    args = parser.parse_args()

    run = ROOT / "runs" / args.label
    workflow_root = Path(args.workflows).resolve()
    raw_briefs = json.loads((run / "briefs.json").read_text(encoding="utf-8"))
    raw = next(
        (item for item in raw_briefs if item["description"] == f"Build {args.page}"),
        None,
    )
    if raw is None:
        raise SystemExit(f"{args.label} does not contain {args.page}")

    page = builder.route_page(run, builder.page_from_brief(raw))
    page.total = len(raw_briefs)
    resource_root = workflow_root / page.workflow
    manifest_path = run / "builder-manifest.json"
    manifest = (
        json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest_path.is_file()
        else {}
    )
    include_aux = bool(manifest.get("auxiliarySamples", False))
    system = "\n\n".join((
        builder.IDENTITY,
        skills.anti_slop_block(workflow_root),
        builder.shared_preload(run, len(raw_briefs)),
        skills.routed_workflow(
            page.workflow,
            workflow_root,
            include_aux=include_aux,
        ),
    ))
    user = "\n\n".join((
        builder.environment_context(run / "pages", page, resource_root),
        page.prompt,
        builder.chapter_preloads(run, len(raw_briefs))[page.pid],
    ))

    results_path = run / "builder-results.json"
    reads: list[tuple[str, str]] = []
    if results_path.is_file():
        result = json.loads(results_path.read_text(encoding="utf-8")).get(page.pid, {})
        for relative in result.get("reference_reads", []):
            path = resource_root / relative
            if path.is_file():
                reads.append((relative, path.read_text(encoding="utf-8")))

    lines = [
        f"# Builder input · `{args.label}` / `{page.pid}`",
        "",
        f"- Label: `{page.label}`",
        f"- Workflow: `{page.workflow}`",
        f"- Auxiliary samples: `{'on' if include_aux else 'off'}`",
        f"- First request: {len(system) + len(user):,} characters",
        f"- Observed workflow reads: {len(reads)}",
        "",
        "## System",
        "",
        fence(system),
        "",
        "## First user message",
        "",
        fence(user),
        "",
        "The target is absent in this initial state; there is no HTML skeleton.",
    ]
    if reads:
        lines += ["", "## Workflow resources read by the agent"]
        for relative, text in reads:
            lines += ["", f"### `{relative}` · {len(text):,} characters", "", fence(text)]
    else:
        lines += [
            "",
            "No completed Builder trace was found, so reference/sample selection is not yet known.",
        ]

    target = Path(args.out)
    target.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"→ {target}  {target.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
