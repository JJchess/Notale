"""讲义质量评估（移植自 PPTAgent 的 PPTEval）：content/coherence/pedagogy 三维 1-5 打分。

对应旧 src/evaluate.mjs。来源: github.com/icip-cas/PPTAgent (PPTEval, EMNLP 2025)。
"""

from __future__ import annotations

from typing import Any

from ...ports.llm import LLMClient
from ...utils.jsonio import parse_json


def _blurb(b: dict[str, Any]) -> str:
    t = b.get("type")
    if t == "hero":
        return " / ".join(b.get("title") or [])
    if t == "statement":
        return str(b.get("statement", ""))
    if t == "list":
        return "；".join(i.get("text", "") for i in (b.get("items") or [])[:3])
    if t == "agenda":
        return "；".join(r.get("label", "") for r in (b.get("rows") or [])[:3])
    if t == "callout":
        return f"{b.get('label')}: {b.get('text')}"
    if t == "formula":
        return str(b.get("latex", ""))
    if t == "flow":
        return "→".join(n.get("title", "") for n in (b.get("nodes") or []))
    if t == "table":
        return " | ".join(b.get("head") or [])
    if t == "compare":
        return f"{(b.get('left') or {}).get('caption')} vs {(b.get('right') or {}).get('caption')}"
    if t == "quiz":
        return b.get("prompt") or (b.get("choices") and "objective") or ""
    if t == "sim":
        return f"engine={b.get('engine')}"
    return str(t)


def summarize(doc: dict[str, Any]) -> str:
    """把 doc 压成给评审看的紧凑大纲（省 token，保留结构与关键内容）。"""
    scenes = doc.get("scenes", [])
    out = [
        f"标题: {doc.get('title')} ｜ 主题: {doc.get('theme')} ｜ 受众: {doc.get('audience', '未标')} ｜ {len(scenes)} 页"
    ]
    for i, s in enumerate(scenes):
        head = s.get("headline") or s.get("eyebrow") or "(hero)"
        out.append(
            f"{i + 1}. [{s.get('kind')}] {head}" + (f" — {s['lead']}" if s.get("lead") else "")
        )
        for b in s.get("blocks") or []:
            out.append(f"   · {b.get('type')} — {_blurb(b)[:90]}")
    return "\n".join(out)


_SYS = """你是讲义质量评审（三维评分，移植自 PPTAgent 的 PPTEval）。对给定讲义大纲，每维打 1-5 分并给简短理由 + 一条最具体的改进建议。三维:
- content（内容）: 每页信息量适中、表述清晰准确、支撑到位；不空泛、不堆砌、无 AI 味套话。
- coherence（连贯）: 叙事由浅入深、有背景铺垫、前后衔接顺、有清晰主线。
- pedagogy（教学呈现）: 交互放在最能体现的知识点、难度与受众匹配、克制不塞满、主题与题材相符。
只输出 JSON：
{ "content":{"score":N,"why":"...","fix":"..."}, "coherence":{"score":N,"why":"...","fix":"..."}, "pedagogy":{"score":N,"why":"...","fix":"..."}, "overall":N, "topFix":"整份最该改的一条" }"""


async def evaluate_lecture(llm: LLMClient, doc: dict[str, Any]) -> dict[str, Any]:
    """评估一份 LectureDoc，返回三维分数对象。"""
    result = parse_json(
        await llm.complete(
            [{"role": "system", "content": _SYS}, {"role": "user", "content": summarize(doc)}],
            purpose="eval",
        )
    )
    return dict(result)
