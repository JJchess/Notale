"""自演化挖掘器（纯函数，无 LLM）：从生成语料统计反复出现的未满足需求 → 提案。

human-in-the-loop：只产出 Proposal，绝不自行改 schema。这是本项目**唯一非移植**的机制（研究主张 claim① 的被测对象）。
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from typing import Any

_WORD = re.compile(r"[一-鿿]{2,}|[A-Za-z]{3,}")


@dataclass
class Proposal:
    kind: str  # "block-type" | "theme" | "sim-engine"
    evidence: int  # 反复出现次数
    detail: str


def _iter_blocks(doc: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for s in doc.get("scenes", []):
        for b in s.get("blocks") or []:
            out.append(b)
            for side in ("left", "right"):
                sb = (b.get(side) or {}).get("block") if isinstance(b.get(side), dict) else None
                if sb:
                    out.append(sb)
            for it in b.get("items") or []:
                if isinstance(it, dict) and isinstance(it.get("block"), dict):
                    out.append(it["block"])
    return out


def mine(docs: list[dict[str, Any]], *, min_evidence: int = 2) -> dict[str, Any]:
    """扫语料 → 信号 + 提案。freeform.rationale 里反复出现的诉求关键词 = 该收编为正式 block 的候选。"""
    rationale_terms: Counter[str] = Counter()
    themes: Counter[str] = Counter()
    engines: Counter[str] = Counter()
    freeform_uses = 0

    for doc in docs:
        if doc.get("theme"):
            themes[str(doc["theme"])] += 1
        for b in _iter_blocks(doc):
            if b.get("type") == "freeform":
                freeform_uses += 1
                for term in set(_WORD.findall(str(b.get("rationale", "")))):
                    rationale_terms[term] += 1
            if b.get("type") == "sim" and b.get("engine"):
                engines[str(b["engine"])] += 1

    proposals: list[Proposal] = []
    for term, n in rationale_terms.items():
        if n >= min_evidence:
            proposals.append(
                Proposal(
                    "block-type",
                    n,
                    f'freeform.rationale 里"{term}"反复出现 {n} 次——考虑收编为正式 block 类型',
                )
            )
    proposals.sort(key=lambda p: -p.evidence)

    return {
        "docs": len(docs),
        "freeform_uses": freeform_uses,
        "themes": dict(themes.most_common()),
        "sim_engines": dict(engines.most_common()),
        "proposals": proposals,
    }
