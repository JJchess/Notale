#!/usr/bin/env python3
"""读 lecture-agent/results/ledger.jsonl，聚合成 viewer/telemetry/coverage.json 供 coverage.html 轮询。

镜像 build_console.py 的"results/ → viewer/"桥接手法，但输入是账本 JSONL 而非 matrix/eval 产物。
纯 stdlib，不依赖 lecture_agent 包（viewer/ 向来零 Python 依赖，只读通用 JSON）。

用法：
  python viewer/build_coverage.py          # 跑一次
  python viewer/build_coverage.py --watch  # 每 ~3s 重新聚合（配合页面轮询实现"实时"）
"""

from __future__ import annotations

import argparse
import json
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

VIEWER = Path(__file__).resolve().parent
LEDGER = VIEWER.parent / "lecture-agent" / "results" / "ledger.jsonl"
OUT = VIEWER / "telemetry" / "coverage.json"


def _capability_counts(profile: dict[str, Any]) -> dict[str, int]:
    """把一条记录的 profile 摊平成 {capability_key: count}（键格式与 schema/enums.mjs CAPABILITIES 对齐）。"""
    out: dict[str, int] = {}
    for k, v in (profile.get("block_types") or {}).items():
        out[k] = out.get(k, 0) + int(v)
    for k, v in (profile.get("variants") or {}).items():
        out[k] = out.get(k, 0) + int(v)
    for k, v in (profile.get("layouts") or {}).items():
        out[k] = out.get(k, 0) + int(v)
    if profile.get("fragment_blocks"):
        out["fragment"] = out.get("fragment", 0) + int(profile["fragment_blocks"])
    if profile.get("transition_scenes"):
        out["transition"] = out.get("transition", 0) + int(profile["transition_scenes"])
    if profile.get("autoanimate_scenes"):
        out["autoAnimate"] = out.get("autoAnimate", 0) + int(profile["autoanimate_scenes"])
    if profile.get("hero_image"):
        out["hero_image"] = out.get("hero_image", 0) + int(profile["hero_image"])
    if profile.get("list_icons"):
        out["list_icons"] = out.get("list_icons", 0) + int(profile["list_icons"])
    return out


def _load_records() -> list[dict[str, Any]]:
    if not LEDGER.exists():
        return []
    out = []
    for line in LEDGER.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            out.append(json.loads(line))
    return out


def _merge(target: dict[str, dict[str, int]], key: str, counts: dict[str, int]) -> None:
    bucket = target.setdefault(key, {})
    for cap, n in counts.items():
        bucket[cap] = bucket.get(cap, 0) + n


def build() -> dict[str, Any]:
    records = _load_records()

    coverage: dict[str, dict[str, int]] = defaultdict(lambda: {"total_count": 0, "runs_used": 0})
    by_model: dict[str, dict[str, int]] = {}
    by_theme: dict[str, dict[str, int]] = {}
    by_topic: dict[str, dict[str, int]] = {}
    by_code: dict[str, dict[str, Any]] = {}

    for rec in records:
        counts = _capability_counts(rec.get("profile") or {})
        for cap, n in counts.items():
            coverage[cap]["total_count"] += n
            coverage[cap]["runs_used"] += 1

        model = rec.get("model") or "(unknown)"
        # theme 顶层字段是 cfg 回声（显式指定时才有值）；未指定（如 genre_routing 故意留空
        # 让模型自选）时回退到 profile.theme——那才是模型真实选中的值（profile_deck(doc) 写入）。
        theme = rec.get("theme") or (rec.get("profile") or {}).get("theme") or "(unknown)"
        topic = rec.get("topic") or "(unknown)"
        _merge(by_model, model, counts)
        _merge(by_theme, theme, counts)
        _merge(by_topic, topic, counts)

        code = rec.get("code") or {}
        code_key = code.get("agent_fingerprint") or code.get("label") or "(unknown)"
        bucket = by_code.setdefault(code_key, {"runs": 0, "coverage": {}})
        bucket["runs"] += 1
        for cap, n in counts.items():
            bucket["coverage"][cap] = bucket["coverage"].get(cap, 0) + n

    return {
        "generated_at": datetime.now().isoformat(),
        "total_runs": len(records),
        "coverage": dict(coverage),
        "conditions": {
            "model": by_model,
            "theme": by_theme,
            "topic": by_topic,
        },
        "by_code": by_code,
    }


def write_once() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    data = build()
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ {data['total_runs']} 条记录 → {OUT}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--watch", action="store_true", help="每 ~3s 重新聚合一次，直到 Ctrl-C")
    args = parser.parse_args()

    write_once()
    if args.watch:
        try:
            while True:
                time.sleep(3)
                write_once()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
