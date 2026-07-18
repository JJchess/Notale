"""多元度度量（纯函数，无 LLM）：量化一批 deck 的版式/场景/块分布与最长同版式连跑。

对应旧 tools/diversity.mjs 的思想——检测"整份清一色竖排/同版式"的 AI 味单调。
"""

from __future__ import annotations

from collections import Counter
from typing import Any


def _distribution(counter: Counter[str]) -> dict[str, int]:
    return dict(counter.most_common())


def diversity(docs: list[dict[str, Any]]) -> dict[str, Any]:
    """给一批 doc，返回版式/场景/块类型分布 + 单份内最长同 layout 连跑（越长越单调）。"""
    layout_kinds: Counter[str] = Counter()
    scene_kinds: Counter[str] = Counter()
    block_types: Counter[str] = Counter()
    longest_flow_run = 0
    non_flow_ratio_num = 0
    scene_total = 0

    for doc in docs:
        run = 0
        for s in doc.get("scenes", []):
            scene_total += 1
            scene_kinds[str(s.get("kind"))] += 1
            kind = (s.get("layout") or {}).get("kind") or "flow"
            layout_kinds[kind] += 1
            if kind != "flow":
                non_flow_ratio_num += 1
            run = run + 1 if kind == "flow" else 0
            longest_flow_run = max(longest_flow_run, run)
            for b in s.get("blocks") or []:
                block_types[str(b.get("type"))] += 1

    return {
        "docs": len(docs),
        "scenes": scene_total,
        "layout_kinds": _distribution(layout_kinds),
        "scene_kinds": _distribution(scene_kinds),
        "block_types": _distribution(block_types),
        "non_flow_ratio": round(non_flow_ratio_num / scene_total, 3) if scene_total else 0.0,
        "longest_flow_run": longest_flow_run,
    }
