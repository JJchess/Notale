"""Re-measure existing LectureDocs, apply Layout Director, and verify final signatures.

This is a deterministic regression harness: it never calls an LLM or edits the source deck.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any

from lecture_agent.adapters.render.headless import HeadlessVerifier
from lecture_agent.domain.design import layout_signature, solve_document_layouts


def _safe(path: Path) -> Path:
    resolved = path.resolve()
    if any(part.lower() == "v2" for part in resolved.parts):
        raise ValueError("v2 paths are excluded from Layout Director regression")
    return resolved


async def _one(source: Path, output: Path) -> dict[str, Any]:
    source = _safe(source)
    output = _safe(output)
    doc = json.loads(source.read_text(encoding="utf-8"))
    before = await HeadlessVerifier().verify(json.dumps(doc, ensure_ascii=False))
    decisions = solve_document_layouts(doc, before.page_metrics)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    shots = output.parent / "screenshots"
    after = await HeadlessVerifier(shot_dir=shots).verify(json.dumps(doc, ensure_ascii=False))
    signatures = {item.scene_id: item.decision_signature for item in decisions}
    mismatches: list[str] = []
    for scene in doc.get("scenes") or []:
        sid = str(scene.get("id") or "?")
        if sid in signatures and signatures[sid] != layout_signature(scene.get("layout")):
            mismatches.append(sid)
    return {
        "source": str(source),
        "output": str(output),
        "pages": len(doc.get("scenes") or []),
        "beforeErrors": before.errors,
        "afterErrors": after.errors,
        "beforeHardPages": [item.get("page") for item in before.overflow_pages],
        "afterHardPages": [item.get("page") for item in after.overflow_pages],
        "measurementInvalid": [
            int(metric.get("i", -1))
            for metric in before.page_metrics
            if any(item.get("measurementInvalid") for item in metric.get("blockMeasurements") or [])
        ],
        "signatureMismatches": mismatches,
        "decisions": [
            {
                "sceneId": item.scene_id,
                "candidate": item.candidate,
                "feasible": item.feasible,
                "decisionSignature": item.decision_signature,
                "requiredHeight": item.required_height,
                "availableHeight": item.available_height,
            }
            for item in decisions
        ],
    }


async def _main(inputs: list[str], out_dir: str) -> None:
    root = _safe(Path(out_dir))
    reports = []
    for raw in inputs:
        source = _safe(Path(raw))
        reports.append(await _one(source, root / source.parent.name / source.name))
    report_path = root / "layout-regression.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding="utf-8")
    print(report_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("inputs", nargs="+")
    parser.add_argument("--out-dir", required=True)
    args = parser.parse_args()
    asyncio.run(_main(args.inputs, args.out_dir))
