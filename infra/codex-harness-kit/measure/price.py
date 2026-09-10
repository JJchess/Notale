#!/usr/bin/env python3
"""Optional API-equivalent estimate using an explicit, dated rate card; never a subscription invoice."""
import argparse
import json
from pathlib import Path


def estimate(summary, rates, tier):
    seen, priced, missing = set(), [], []
    for session in summary["sessions"]:
        for record in session["usage_records"]:
            rid = record["response_id"]
            if rid in seen:
                continue
            seen.add(rid)
            rate = rates.get("models", {}).get(record["model"], {}).get(tier)
            usage = record.get("usage") or {}
            keys = ("input_tokens", "cached_input_tokens", "output_tokens")
            if not rate or not all(isinstance(usage.get(k), (int, float)) for k in keys):
                missing.append(rid)
                continue
            fresh = usage["input_tokens"] - usage["cached_input_tokens"]
            if fresh < 0:
                raise ValueError("cached tokens exceed input tokens")
            if rate.get("max_input_tokens") is not None and usage["input_tokens"] > rate["max_input_tokens"]:
                missing.append(rid)
                continue
            names = ("input_per_million", "cached_input_per_million", "output_per_million")
            if not all(isinstance(rate.get(k), (int, float)) and rate[k] >= 0 for k in names):
                missing.append(rid)
                continue
            cost = (fresh * rate[names[0]] + usage["cached_input_tokens"] * rate[names[1]]
                    + usage["output_tokens"] * rate[names[2]]) / 1_000_000
            priced.append({"response_id": rid, "model": record["model"], "cost_usd": cost})
    unsupported_lanes = [s["session_id"] for s in summary["sessions"] if not s["usage_records"]]
    return {"kind": "API-equivalent estimate, not a bill", "service_tier": tier,
            "rate_source": rates.get("source"), "rate_as_of": rates.get("as_of"),
            "total_usd": sum(p["cost_usd"] for p in priced) if priced and not missing and not unsupported_lanes else None,
            "priced_subtotal_usd": sum(p["cost_usd"] for p in priced),
            "unpriced_response_ids": missing, "unattributed_sessions": unsupported_lanes, "responses": priced}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run", type=Path)
    parser.add_argument("--rates", required=True, type=Path)
    parser.add_argument("--tier", required=True)
    args = parser.parse_args()
    rate_card = json.loads(args.rates.read_text())
    if not rate_card.get("source") or not rate_card.get("as_of"):
        parser.error("rate card must name source and as_of; do not silently use stale or guessed pricing")
    print(json.dumps(estimate(json.loads((args.run / "summary.json").read_text()), rate_card, args.tier), indent=2))
