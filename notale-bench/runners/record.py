"""把一次跑榜记进台账 benchmark/notale/ledger.jsonl:题目、分数、token、两条分支的 commit。

    python3 record.py <case> <run_root> <score.yaml> [note]
"""
import json, subprocess, sys, time
from pathlib import Path
import yaml

def sha(repo, ref): return subprocess.run(["git","-C",repo,"rev-parse","--short",ref],capture_output=True,text=True).stdout.strip()

case, run_root, score = sys.argv[1:4]; note = sys.argv[4] if len(sys.argv) > 4 else ""
res = json.loads((Path(run_root)/"builder-results.json").read_text())
t = yaml.safe_load(open(score))["total"]
row = {
    "ts": time.strftime("%Y-%m-%d %H:%M"), "bench": "PresentBench", "case": case, "note": note,
    "dev": sha("/data1/home/zhuyifan/ws2/Notale","nv2-dev"), "bench_branch": sha("/data1/home/zhuyifan/ws2/Notale-bench","HEAD"),
    "score": round(t["weighted_arithmetic_mean_percent"],1), "yes": t["yes_count"], "valid": t["valid_count"],
    "mi": round(t["material_independent"]["weighted_arithmetic_mean_percent"],1),
    "md": round(t["material_dependent"]["weighted_arithmetic_mean_percent"],1),
    "md_classes": {k: round(v["score_percent"]) for k,v in t["material_dependent"]["classes"].items()},
    "pages": len(res), "built": sum(v["artifact_present"] for v in res.values()),
    "calls": sum(v["calls"] for v in res.values()), "tok_in": sum(v["tok_in"] for v in res.values()),
    "tok_cached": sum(v["tok_cached"] for v in res.values()), "tok_out": sum(v["tok_out"] for v in res.values()),
    "max_calls_page": max(res.items(), key=lambda kv: kv[1]["calls"])[0],
}
with open(Path(__file__).parent/"ledger.jsonl","a") as f: f.write(json.dumps(row, ensure_ascii=False)+"\n")
print(json.dumps(row, ensure_ascii=False))
