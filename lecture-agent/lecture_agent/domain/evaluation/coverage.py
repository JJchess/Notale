"""覆盖度审查（完成 STORM 闭环）：核对规划期 mustCover 是否真落进成品讲义。对应旧 src/coverage.mjs。"""

from __future__ import annotations

from typing import Any

from ...ports.llm import LLMClient
from ...utils.jsonio import parse_json
from .ppteval import summarize


async def check_coverage(
    llm: LLMClient, doc: dict[str, Any], perspectives: list[dict[str, Any]]
) -> dict[str, Any] | None:
    """返回 {total, covered, missing:[{point,why}], ratio} 或 None（无 mustCover）。"""
    must = list(
        dict.fromkeys(m for p in (perspectives or []) for m in (p.get("mustCover") or []) if m)
    )
    if not must:
        return None
    sys = (
        "你是讲义覆盖度审查。给定讲义大纲 + 规划阶段的必讲要点清单，逐点判断是否被**充分覆盖**（不只是提一句）。"
        '只输出 JSON：{ "covered": ["已充分覆盖的要点"], "missing": [{"point":"缺失/浅尝的要点","why":"缺在哪"}] }'
    )
    listing = "\n".join(f"{i + 1}. {m}" for i, m in enumerate(must))
    user = f"必讲要点（共 {len(must)}）：\n{listing}\n\n讲义大纲：\n{summarize(doc)}"
    r = parse_json(
        await llm.complete(
            [{"role": "system", "content": sys}, {"role": "user", "content": user}],
            purpose="coverage",
        )
    )
    covered = len(r.get("covered") or [])
    missing = r.get("missing") if isinstance(r.get("missing"), list) else []
    return {
        "total": len(must),
        "covered": covered,
        "missing": missing,
        "ratio": round(covered / len(must), 2) if must else 1.0,
    }
