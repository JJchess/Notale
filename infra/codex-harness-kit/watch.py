#!/usr/bin/env python3
"""Read-only live counters from a kit run. Doesn't normalize a growing transcript."""
import argparse
import collections
import json
import time
from pathlib import Path

from capture.common import rows

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("run", type=Path)
p.add_argument("--interval", type=float, default=5)
args = p.parse_args()
try:
    while True:
        counts = collections.Counter()
        usage = {}
        sessions = list((args.run / ".private-home/.codex/sessions").rglob("*.jsonl"))
        for path in sessions:
            for _, row, error in rows(path):
                if error:
                    continue
                payload = row.get("payload", {})
                if row.get("type") == "response_item" and payload.get("type") in ("function_call", "custom_tool_call"):
                    counts[payload.get("name", "?")] += 1
                if row.get("type") == "token_usage_record" and payload.get("response_id"):
                    usage[payload["response_id"]] = payload.get("usage")
        manifest = args.run / "manifest.json"
        state = json.loads(manifest.read_text()).get("state") if manifest.exists() else "preparing"
        print(f"{time.strftime('%H:%M:%S')} {state} | sessions={len(sessions)} responses={len(usage)} tools={dict(counts)}", flush=True)
        if state in ("exited", "failed", "interrupted"):
            break
        time.sleep(max(0.5, args.interval))
except KeyboardInterrupt:
    pass
