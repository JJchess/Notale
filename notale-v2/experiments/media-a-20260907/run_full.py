"""Fresh Planner + Builders; optionally run the real Style Director."""
import argparse
from contextlib import nullcontext
import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from core import director, llm, planner, skills


def hashes(root):
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for folder in ("core", "prompts") for p in (root / folder).glob("*") if p.is_file()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", required=True)
    ap.add_argument("--query", default="集成学习--机器学习概论第八讲")
    ap.add_argument("--minutes", type=int, default=90)
    ap.add_argument("--audience", default="学过一点相关基础、但没系统学过这个题目的读者")
    ap.add_argument("--scenario", default="")
    ap.add_argument("--concurrency", type=int, default=6)
    ap.add_argument("--plan-only", action="store_true")
    ap.add_argument("--fresh-theme", action="store_true",
                    help="Run the real Style Director instead of copying the baseline theme")
    args = ap.parse_args()
    if Path(args.label).name != args.label or args.label in {".", ".."}:
        ap.error("label must be a directory name")
    baseline = ROOT / "runs/ens-trim-full-0907"
    theme = baseline / "pages/assets/theme.css"
    run = planner.Run(args.query, args.minutes, args.audience,
                      args.label, scenario=args.scenario, style_director=True)
    profile = llm.resolve_builder_profile(llm.config(), "gemini38-google-low")
    runtime = llm.ModelRuntime(profile)
    provenance = {"startedAt": datetime.now(timezone.utc).isoformat(),
                  "query": args.query, "minutes": args.minutes,
                  "audience": args.audience, "scenario": args.scenario,
                  "baseline": str(baseline.relative_to(ROOT)),
                  "scope": ("fresh Planner + Style Director + Builders" if args.fresh_theme else
                            "fresh Planner + Builders; frozen baseline theme, no B/C changes"),
                  "styleDirector": "live" if args.fresh_theme else "frozen",
                  "profile": profile.id, "concurrency": args.concurrency,
                  "sourceHashes": hashes(ROOT),
                  "baselineSourceHashes": hashes(Path('/tmp/notale-media-a-baseline.mGYZ4A')),
                  "themeHash": None if args.fresh_theme else hashlib.sha256(theme.read_bytes()).hexdigest()}
    (run.root / "experiment.json").write_text(json.dumps(provenance, ensure_ascii=False, indent=2))

    def frozen_theme(current, *_):
        shutil.copy2(theme, current.assets / "theme.css")
        picks = baseline / "style-picks.tsv"
        if picks.is_file():
            shutil.copy2(picks, current.root / picks.name)

    def respond(instructions, hist, specs, effort, tag=None):
        return runtime.respond(instructions, hist, specs, tag=tag)

    theme_context = nullcontext() if args.fresh_theme else patch.object(director, "direct", frozen_theme)
    with theme_context, patch.object(llm, "respond", respond):
        planner.plan_run(run, ROOT / "vendor/chassis", ROOT / "vendor/chassis/lib", skills.WORKFLOWS)
    provenance["themeHash"] = hashlib.sha256((run.assets / "theme.css").read_bytes()).hexdigest()
    (run.root / "experiment.json").write_text(json.dumps(provenance, ensure_ascii=False, indent=2))
    if args.plan_only:
        return 0
    command = [sys.executable, "-B", "-u", "-m", "core.builder", "--label", args.label,
               "--profile", profile.id, "--uniform", "--concurrency", str(args.concurrency),
               "--samples", "mini", "--aux-samples", "--notes", "notes"]
    with (run.root / "builder.log").open("x") as log:
        result = subprocess.run(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
    print(f"Builder exit={result.returncode}: {run.root}", flush=True)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
