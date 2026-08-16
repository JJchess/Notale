"""Write BUILD_REPORT.md / merge_report.json beside a user pack."""

from __future__ import annotations

import json
from pathlib import Path

from notale.style_studio.build.models import MergeReport


def write_build_report(pack_dir: Path, report: MergeReport) -> Path:
    pack_dir = Path(pack_dir)
    pack_dir.mkdir(parents=True, exist_ok=True)
    (pack_dir / "merge_report.json").write_text(
        json.dumps(report.to_dict(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    lines = [
        f"# BUILD_REPORT — `{report.pack_id}`",
        "",
        f"- parent: `{report.parent_id or '(none)'}`",
        f"- adapters: {', '.join(report.adapters) or '(none)'}",
        "",
        "## Fields",
        "",
        "| path | status | source | note |",
        "|------|--------|--------|------|",
    ]
    for item in report.fields:
        note = (item.note or "").replace("|", "\\|")
        lines.append(f"| `{item.path}` | {item.status} | {item.source} | {note} |")
    if report.notes:
        lines += ["", "## Notes", ""]
        lines += [f"- {note}" for note in report.notes]
    lines.append("")
    path = pack_dir / "BUILD_REPORT.md"
    path.write_text("\n".join(lines), encoding="utf-8")
    return path
