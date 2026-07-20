"""schema 契约测试：合法 doc 过、非法 doc 拒、语义 lint 生效。只用手搭数据，不碰 LLM/浏览器。"""

from __future__ import annotations

import pytest
from lecture_agent.schema import LectureDoc, validate_doc
from pydantic import ValidationError


def _minimal_doc() -> dict:
    return {
        "schemaVersion": "1.0",
        "id": "demo-lecture",
        "title": "示例讲义",
        "language": "zh-CN",
        "theme": "cartesian",
        "scenes": [
            {
                "id": "cover",
                "kind": "hero",
                "notes": "开场备注。",
                "blocks": [{"type": "hero", "title": ["标题", "副标题"]}],
            },
            {
                "id": "point",
                "kind": "statement",
                "notes": "一句话主旨。",
                "blocks": [{"type": "statement", "statement": "梯度下降沿负梯度方向迭代。"}],
            },
        ],
    }


def test_minimal_doc_parses_and_validates() -> None:
    doc = _minimal_doc()
    LectureDoc.model_validate(doc)  # 结构层
    res = validate_doc(doc)  # 语义层
    assert res.errors == []


def test_unknown_block_type_rejected() -> None:
    doc = _minimal_doc()
    doc["scenes"][1]["blocks"] = [{"type": "nonesuch", "foo": 1}]
    with pytest.raises(ValidationError):
        LectureDoc.model_validate(doc)


def test_hero_title_length_bound() -> None:
    doc = _minimal_doc()
    doc["scenes"][0]["blocks"][0]["title"] = ["a", "b", "c", "d"]  # >3
    with pytest.raises(ValidationError):
        LectureDoc.model_validate(doc)


def test_objective_quiz_answer_must_be_a_choice() -> None:
    bad = {
        "type": "quiz",
        "kind": "objective",
        "choices": [{"key": "a", "text": "对"}, {"key": "b", "text": "错"}],
        "answer": "c",
        "explain": "因为……",
    }
    from lecture_agent.schema.document import QuizBlock

    with pytest.raises(ValidationError):
        QuizBlock.model_validate(bad)


def test_semantic_latex_dollar_flagged() -> None:
    doc = _minimal_doc()
    doc["scenes"][1]["blocks"] = [
        {"type": "statement", "statement": "见公式"},
        {"type": "formula", "latex": "$x^2$"},
    ]
    res = validate_doc(doc)
    assert any("latex" in e for e in res.errors)


def test_semantic_dup_scene_id_flagged() -> None:
    doc = _minimal_doc()
    doc["scenes"][1]["id"] = "cover"  # 与首页重复
    res = validate_doc(doc)
    assert any("重复" in e for e in res.errors)


def test_runnable_custom_env_requires_preamble() -> None:
    doc = _minimal_doc()
    doc["scenes"][1]["blocks"] = [
        {
            "type": "runnable",
            "languages": ["python"],
            "starter": {"python": "result = []"},
            "env": {"kind": "custom"},
        },
    ]
    res = validate_doc(doc)
    assert any("pythonPreamble" in e for e in res.errors)


def test_runnable_multiple_per_deck_allowed() -> None:
    doc = _minimal_doc()
    rc = {
        "type": "runnable",
        "languages": ["python"],
        "starter": {"python": "result = []"},
        "env": {"kind": "objective1d", "objective": "x", "domain": [0, 1]},
    }
    doc["scenes"][1]["kind"] = "content"
    doc["scenes"][1]["blocks"] = [{**rc, "id": "rc-a"}]
    doc["scenes"].append(
        {
            "id": "extra",
            "kind": "content",
            "notes": "第二个 runnable。",
            "blocks": [{**rc, "id": "rc-b"}],
        }
    )
    res = validate_doc(doc)
    assert res.errors == []


def test_chart_bar_valid() -> None:
    from lecture_agent.schema.document import ChartBlock

    ChartBlock.model_validate(
        {
            "type": "chart",
            "chartType": "bar",
            "categories": ["2021", "2022", "2023"],
            "series": [{"name": "营收", "values": [12, 18, 25]}],
        }
    )


def test_chart_series_length_must_match_categories() -> None:
    from lecture_agent.schema.document import ChartBlock

    with pytest.raises(ValidationError):
        ChartBlock.model_validate(
            {
                "type": "chart",
                "chartType": "line",
                "categories": ["Q1", "Q2", "Q3"],
                "series": [{"name": "A", "values": [1, 2]}],
            }
        )


def test_chart_scatter_requires_points() -> None:
    from lecture_agent.schema.document import ChartBlock

    with pytest.raises(ValidationError):
        ChartBlock.model_validate({"type": "chart", "chartType": "scatter"})


def test_chart_scatter_valid() -> None:
    from lecture_agent.schema.document import ChartBlock

    ChartBlock.model_validate(
        {
            "type": "chart",
            "chartType": "scatter",
            "points": [{"x": 1, "y": 2.3}, {"x": 2, "y": 3.1}],
        }
    )


def test_semantic_expr_whitelist_blocks_unknown_ident() -> None:
    doc = _minimal_doc()
    doc["scenes"][1]["blocks"] = [
        {"type": "statement", "statement": "实验"},
        {
            "type": "sim",
            "engine": "dynamics1d",
            "params": [{"name": "a", "label": "α", "min": 0, "max": 2, "step": 0.1, "default": 1}],
            "model": {"stateVar": "c", "init": 0.0, "steps": 50, "update": "c + a*(evilFn - c)"},
            "regimes": [{"when": "a < 1", "label": "收敛", "desc": "单调"}],
        },
    ]
    res = validate_doc(doc)
    assert any("白名单" in e for e in res.errors)
