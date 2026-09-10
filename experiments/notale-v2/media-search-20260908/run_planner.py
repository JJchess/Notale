"""Planner-only search experiment using the exact inputs of earlier topic runs."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import time
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3] / 'notale-v2'
RUNS_ROOT = ROOT.parent / 'runs' / ROOT.name
sys.path.insert(0, str(ROOT))
from core import director, llm, planner, skills

BASELINES = {
    "neural": "neural-networks-style-media-0908-0241-r2",
    "ensemble": "ens-plan-first-0907-2234",
    "photosynthesis": "photosynthesis-style-media-0908-0232",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--case", choices=BASELINES, required=True)
    ap.add_argument("--backend", choices=("nokey", "serper", "gemini"), required=True)
    ap.add_argument("--label", required=True)
    args = ap.parse_args()
    if Path(args.label).name != args.label or args.label in (".", ".."):
        ap.error("label must be a single directory name")
    config = llm.config()
    if args.backend == "serper" and not os.environ.get("SERPER_API_KEY"):
        ap.error("SERPER_API_KEY is missing; no experiment or model call was started")
    if not os.environ.get("GEMINI_API_KEY"):
        ap.error("GEMINI_API_KEY is missing; no experiment or model call was started")
    config.setdefault("media", {})["image_search_backend"] = args.backend
    baseline = RUNS_ROOT / BASELINES[args.case]
    original = json.loads((baseline / "experiment.json").read_text())
    run = planner.Run(original["query"], original["minutes"],
                      original.get("audience") or "学过一点相关基础、但没系统学过这个题目的读者",
                      args.label, scenario=original.get("scenario") or "", style_director=True)
    profile = llm.resolve_builder_profile(config, "gemini38-google-low")
    runtime = llm.ModelRuntime(profile)
    relevant = [*ROOT.glob("core/*.py"), *ROOT.glob("prompts/*.md"),
                ROOT / "config.yaml", ROOT / "vendor/skills/web-media-getter/webmedia.py",
                Path(__file__).resolve()]
    experiment = {
        "query": run.query, "minutes": run.minutes, "audience": run.audience,
        "scenario": run.scenario, "baseline": BASELINES[args.case],
        "profile": profile.id, "backend": args.backend,
        "scope": "Planner only; no Builder or Style Director model calls",
        "theme": "frozen from the same topic baseline; absent from Planner context",
        "sourceHashes": {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                         for p in relevant if p.is_file()},
    }
    (run.root / "experiment.json").write_text(json.dumps(experiment, ensure_ascii=False, indent=2))
    responses = []

    def respond(instructions, hist, specs, effort, tag=None):
        input_name = "planner-input.json" if not responses else f"planner-input-{len(responses) + 1:02d}.json"
        (run.root / input_name).write_text(json.dumps(
            {"instructions": instructions, "history": hist, "tools": specs}, ensure_ascii=False, indent=2))
        started = time.monotonic()
        result = runtime.respond(instructions, hist, specs, tag=tag)
        tin, tout, cached = llm.usage_of(result)
        responses.append({"input_tokens": tin, "output_tokens": tout, "cached_tokens": cached or 0,
                          "seconds": round(time.monotonic() - started, 2),
                          "tools": [{"name": c.name, "arguments": json.loads(c.arguments or "{}")}
                                    for c in result.output if getattr(c, "type", "") == "function_call"]})
        return result

    def frozen_theme(current, *_):
        shutil.copy2(baseline / "pages/assets/theme.css", current.assets / "theme.css")

    started = time.monotonic()
    failure = None
    try:
        with patch.object(llm, "respond", respond), patch.object(director, "direct", frozen_theme):
            planner.plan_run(run, ROOT / "vendor/chassis", ROOT / "vendor/chassis/lib", skills.WORKFLOWS)
    except Exception as exc:
        failure = f"{type(exc).__name__}: {exc}"
    reports = [json.loads(p.read_text()) for p in sorted(run.pages.glob("assets/img/*/search.json"))]
    pages_file = run.root / planner.PAGES_REL
    summary = {
        "label": run.label, "backend": args.backend, "failure": failure,
        "seconds": round(time.monotonic() - started, 2), "responses": responses,
        "pages": len(planner.split_pages(pages_file.read_text())) if pages_file.exists() else 0,
        "searches": [{"query": r["query"], "backend": r["backend"], "errors": r["result"]["errors"],
                      "candidates": len(r["result"]["results"]),
                      "usable": sum("path" in row for row in r["result"]["results"]),
                      "report_bytes": len(json.dumps(r["result"], ensure_ascii=False).encode())}
                     for r in reports],
    }
    (run.root / "planner-results.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(json.dumps(summary, ensure_ascii=False, indent=2), flush=True)
    return bool(failure)


if __name__ == "__main__":
    raise SystemExit(main())
