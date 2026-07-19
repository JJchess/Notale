"""确定性完整性门纯函数单测（无 LLM）。"""

from __future__ import annotations

from lecture_agent.domain.evaluation import (
    detect_truncation,
    hero_on_topic,
    page_adherence,
)
from lecture_agent.domain.evaluation.completeness import gate


def _doc(scenes: list[dict]) -> dict:
    return {"scenes": scenes}


def test_detect_truncation_flags_placeholder_and_dangling() -> None:
    doc = _doc(
        [
            {"blocks": [{"id": "b1", "type": "statement", "statement": "这是 TODO 待补的内容"}]},
            {"blocks": [{"id": "b2", "type": "callout", "label": "注", "text": "结论是……"}]},
            {"blocks": [{"id": "b3", "type": "statement", "statement": "因为它依赖于，"}]},
            {"blocks": [{"id": "b4", "type": "formula", "latex": "\\frac{a}{b"}]},
        ]
    )
    issues = detect_truncation(doc)
    ids = " ".join(issues)
    assert "b1" in ids and "b2" in ids and "b3" in ids and "b4" in ids


def test_detect_truncation_clean_passes() -> None:
    doc = _doc(
        [
            {"blocks": [{"id": "b1", "type": "statement", "statement": "树是一种递归数据结构。"}]},
            # 合法短标签/比例/副标题不应误报
            {"blocks": [{"id": "b2", "type": "hero", "title": ["树：从族谱到决策树"]}]},
            {"blocks": [{"id": "b3", "type": "list", "items": [{"text": "高∶矮 ≈ 3∶1"}]}]},
        ]
    )
    assert detect_truncation(doc) == []


def test_hero_on_topic_flags_offtopic_and_matches_prefix() -> None:
    # 单字课题"树"：封面含"树"应通过
    ok = _doc([{"kind": "hero", "blocks": [{"type": "hero", "title": ["树：从族谱到决策树"]}]}])
    assert hero_on_topic(ok, "树（数据结构）") == []
    # 前缀匹配："遗传学"应命中课题"遗传学定律"
    ok2 = _doc([{"kind": "hero", "blocks": [{"type": "hero", "title": ["从豌豆到现代遗传学"]}]}])
    assert hero_on_topic(ok2, "遗传学定律（高中生物学）") == []
    # 完全跑题
    bad = _doc([{"kind": "hero", "blocks": [{"type": "hero", "title": ["深入理解 Transformer"]}]}])
    assert hero_on_topic(bad, "树（数据结构）")


def test_page_adherence_and_gate() -> None:
    doc = _doc([{"kind": "hero", "blocks": []}] * 12)
    assert page_adherence(doc, 12) == 0
    g = gate(doc, topic="树（数据结构）", target_pages=12)
    assert g["pass"] is True
    over = _doc([{"kind": "content", "blocks": []}] * 16)
    assert gate(over, topic="树", target_pages=12)["pass"] is False  # 页数超标
