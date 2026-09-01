#!/usr/bin/env python3
"""Prepare and run the fixed AdaBoost four-route Builder smoke.

This entry point never invokes Planner. It materializes the same eight-page
plan and cold-gray theme for every run, then asks Builder to build one page for
each routed workflow.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
FIXTURE = HERE / "fixtures" / "adaboost-cold-gray"
CHASSIS = ROOT / "vendor" / "chassis"
BRIEF = ROOT / "prompts" / "brief.md"
DEFAULT_RUNS = ROOT / "runs"

QUERY = "AdaBoosting算法"
PAGES = ("page-01", "page-03", "page-04", "page-06")
TOTAL = 8


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    if path.is_file():
        digest.update(path.read_bytes())
        return digest.hexdigest()
    for item in sorted(p for p in path.rglob("*") if p.is_file()):
        digest.update(item.relative_to(path).as_posix().encode())
        digest.update(item.read_bytes())
    return digest.hexdigest()


def _briefs() -> list[dict[str, str]]:
    template = BRIEF.read_text(encoding="utf-8")
    return [
        {
            "description": f"Build page-{number:02d}",
            "prompt": template.format(
                query=QUERY,
                pid=f"page-{number:02d}",
                total=TOTAL,
            ),
        }
        for number in range(1, TOTAL + 1)
    ]


def prepare(label: str, runs_dir: Path = DEFAULT_RUNS) -> Path:
    root = runs_dir / label
    if root.exists():
        raise FileExistsError(f"fresh run required; already exists: {root}")

    assets = root / "pages" / "assets"
    shutil.copytree(CHASSIS, assets)
    shutil.copy2(FIXTURE / "pages" / "assets" / "theme.css", assets / "theme.css")
    shutil.copytree(FIXTURE / "pages" / "plan", root / "pages" / "plan")
    (root / "briefs.json").write_text(
        json.dumps(_briefs(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    lock = {
        "schemaVersion": 1,
        "fixture": str(FIXTURE.relative_to(ROOT)),
        "query": QUERY,
        "totalPages": TOTAL,
        "builderPages": list(PAGES),
        "themeSha256": _sha256(FIXTURE / "pages" / "assets" / "theme.css"),
        "planSha256": _sha256(FIXTURE / "pages" / "plan"),
        "briefTemplateSha256": _sha256(BRIEF),
        "targetState": "absent",
    }
    (root / "fixture-lock.json").write_text(
        json.dumps(lock, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    targets = list((root / "pages").glob("page-*.html"))
    if targets:
        raise RuntimeError(f"fixture unexpectedly created Builder targets: {targets}")
    return root


def run(label: str, profile: str, runs_dir: Path, aux_samples: bool) -> None:
    root = runs_dir / label
    if not root.is_dir():
        raise FileNotFoundError(f"prepare the frozen run first: {root}")
    command = [
        sys.executable,
        "-m",
        "core.builder",
        "--label",
        label,
        "--profile",
        profile,
        "--concurrency",
        str(len(PAGES)),
    ]
    for pid in PAGES:
        command.extend(("--only", pid))
    if aux_samples:
        command.append("--aux-samples")
    subprocess.run(command, cwd=ROOT, check=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs-dir", type=Path, default=DEFAULT_RUNS)
    sub = parser.add_subparsers(dest="command", required=True)

    prepare_parser = sub.add_parser("prepare")
    prepare_parser.add_argument("--label", required=True)

    run_parser = sub.add_parser("run")
    run_parser.add_argument("--label", required=True)
    run_parser.add_argument("--profile", default="sonnet5-low")
    run_parser.add_argument(
        "--aux-samples",
        action="store_true",
        help="explicit comparison arm; default is one Main sample only",
    )

    args = parser.parse_args()
    runs_dir = args.runs_dir.resolve()
    if args.command == "prepare":
        root = prepare(args.label, runs_dir)
        print(f"prepared frozen Builder run: {root}")
    else:
        run(args.label, args.profile, runs_dir, args.aux_samples)


if __name__ == "__main__":
    main()
