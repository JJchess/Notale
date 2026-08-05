"""schema 契约测试：合法 doc 过、非法 doc 拒、语义 lint 生效。只用手搭数据，不碰 LLM/浏览器。"""

from __future__ import annotations

import pytest
from lecture_agent.schema import LectureDoc, validate_block, validate_doc
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


def test_media_asset_block_and_background_are_schema_valid() -> None:
    doc = _minimal_doc()
    doc["assets"] = [
        {
            "id": "asset-pea",
            "kind": "photo",
            "src": "data:image/png;base64,AAAA",
            "alt": "一株豌豆",
            "source": "image-finder",
            "focalPoint": {"x": 0.5, "y": 0.4},
        }
    ]
    doc["scenes"][1]["kind"] = "content"
    doc["scenes"][1]["compositionFamily"] = "annotated-specimen"
    doc["scenes"][1]["background"] = {
        "assetId": "asset-pea",
        "purpose": "explanatory",
        "fit": "cover",
        "overlay": "scrim",
        "overlayStrength": 0.5,
        "safeZone": "left",
    }
    doc["scenes"][1]["blocks"] = [
        {
            "type": "media",
            "assetId": "asset-pea",
            "purpose": "evidence",
            "placement": "illustration",
            "fit": "contain",
            "caption": "观察茎的高度差异。",
        }
    ]
    LectureDoc.model_validate(doc)
    assert validate_doc(doc).errors == []


def test_visual_system_and_artboard_are_schema_valid() -> None:
    doc = _minimal_doc()
    doc["visualSystem"] = {
        "palette": {
            "background": "#F7F5F0", "surface": "#FFFFFF", "surfaceAlt": "#EEEAE2",
            "ink": "#171717", "muted": "#68645E", "accent": "#275DFF",
            "accent2": "#F36B35", "line": "#D9D4CB",
        },
        "typography": {"display": "editorial", "body": "humanist", "mono": "technical"},
        "shape": {"radius": 10, "borderWidth": 1, "shadow": "soft"},
        "texture": "paper",
        "motifs": [{"type": "wave", "colorRole": "accent", "opacity": 0.12}],
        "rhythm": "editorial",
    }
    doc["scenes"][1]["layout"] = {
        "kind": "artboard", "columns": 12, "rows": 12, "gap": 16,
        "titleRegion": {"col": [1, 6], "row": [1, 4], "maxWidth": 90},
        "areas": [
            {
                "blockIds": ["claim"], "col": [1, 13], "row": [4, 13],
                "z": 1, "styleRole": "main",
            }
        ],
    }
    doc["scenes"][1]["blocks"][0]["id"] = "claim"
    LectureDoc.model_validate(doc)
    assert validate_doc(doc).errors == []


def test_artboard_rejects_invalid_span_and_duplicate_block() -> None:
    doc = _minimal_doc()
    doc["scenes"][1]["blocks"][0]["id"] = "claim"
    doc["scenes"][1]["layout"] = {
        "kind": "artboard", "columns": 12, "rows": 12,
        "titleRegion": {"col": [1, 6], "row": [1, 3]},
        "areas": [
            {"blockIds": ["claim"], "col": [0, 7], "row": [3, 13]},
            {"blockIds": ["claim"], "col": [7, 13], "row": [3, 13]},
        ],
    }
    result = validate_doc(doc)
    assert any("1 <= start" in error for error in result.errors)
    assert any("重复放置" in error for error in result.errors)


def test_media_visual_treatment_is_schema_valid() -> None:
    block = {
        "type": "media", "assetId": "asset-a", "purpose": "explanatory",
        "placement": "illustration", "aspectRatio": 1.5,
        "objectPosition": {"x": 0.25, "y": 0.6}, "treatment": "cutout",
    }
    from lecture_agent.schema.document import MediaBlock

    MediaBlock.model_validate(block)


def test_media_rejects_remote_or_unknown_assets() -> None:
    doc = _minimal_doc()
    doc["assets"] = [{"id": "remote", "kind": "photo", "src": "https://example.com/a.png", "alt": ""}]
    doc["scenes"][1]["kind"] = "content"
    doc["scenes"][1]["blocks"] = [
        {"type": "media", "assetId": "missing", "purpose": "explanatory", "placement": "illustration"}
    ]
    res = validate_doc(doc)
    assert any("远程 URL" in error for error in res.errors)
    assert any("未知 asset" in error for error in res.errors)


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


def test_runnable_custom_console_output_is_valid() -> None:
    doc = _minimal_doc()
    doc["scenes"][1]["kind"] = "content"
    doc["scenes"][1]["blocks"] = [
        {
            "type": "runnable",
            "languages": ["python"],
            "starter": {"python": "print('ok')\nresult = {'height': 3}"},
            "env": {
                "kind": "custom",
                "output": "console",
                "resultLabel": "AVL 结果",
                "pythonPreamble": "TEST_KEYS = [30, 20, 10]",
            },
        }
    ]
    res = validate_doc(doc)
    assert res.errors == []


def test_runnable_rejects_console_objective1d_mixed_mode() -> None:
    doc = _minimal_doc()
    doc["scenes"][1]["kind"] = "content"
    doc["scenes"][1]["blocks"] = [
        {
            "type": "runnable",
            "languages": ["python"],
            "starter": {"python": "result = []"},
            "env": {
                "kind": "objective1d",
                "objective": "x*x",
                "domain": [-1, 1],
                "output": "console",
            },
        }
    ]
    res = validate_doc(doc)
    assert any("console" in error and "objective1d" in error for error in res.errors)


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


def test_chart_annotations_support_point_and_arrow() -> None:
    from lecture_agent.schema.document import ChartBlock

    ChartBlock.model_validate(
        {
            "type": "chart",
            "chartType": "line",
            "categories": ["0", "1", "2"],
            "series": [{"name": "f(x)", "values": [4, 1, 0]}],
            "annotations": [
                {"kind": "point", "x": "1", "y": 1, "label": "当前位置"},
                {"kind": "arrow", "x": "1", "y": 1, "x2": "2", "y2": 0, "label": "更新"},
            ],
        }
    )


def test_chart_line_annotation_requires_endpoint() -> None:
    from lecture_agent.schema.document import ChartBlock

    with pytest.raises(ValidationError):
        ChartBlock.model_validate(
            {
                "type": "chart",
                "chartType": "line",
                "categories": ["0", "1"],
                "series": [{"name": "f", "values": [1, 0]}],
                "annotations": [{"kind": "line", "x": "0", "y": 1}],
            }
        )


def test_scatter_annotation_rejects_string_x_that_would_trigger_plot_warning() -> None:
    from lecture_agent.schema.document import ChartBlock

    with pytest.raises(ValidationError):
        ChartBlock.model_validate(
            {
                "type": "chart",
                "chartType": "scatter",
                "points": [{"x": -1, "y": 1}, {"x": 1, "y": 1}],
                "annotations": [{"kind": "point", "x": "0", "y": 0, "label": "鞍点"}],
            }
        )


def test_category_annotation_must_reference_existing_category() -> None:
    from lecture_agent.schema.document import ChartBlock

    with pytest.raises(ValidationError):
        ChartBlock.model_validate(
            {
                "type": "chart",
                "chartType": "line",
                "categories": ["0", "1"],
                "series": [{"name": "f", "values": [1, 0]}],
                "annotations": [{"kind": "point", "x": "2", "y": 0, "label": "越界"}],
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


def test_visual_readability_contract_rejects_dense_block_content() -> None:
    formula = validate_block({"type": "formula", "latex": r"\[x^2\]"}, "formula")
    assert any("display math" in error for error in formula.errors)

    diagram = validate_block(
        {
            "type": "diagram",
            "diagramType": "arrow-seq",
            "nodes": [{"title": "A", "sub": "paragraph " * 12}, {"title": "B"}],
        },
        "diagram",
    )
    assert any("节点文字过长" in error for error in diagram.errors)

    chart = validate_block(
        {
            "type": "chart",
            "chartType": "scatter",
            "points": [{"x": index, "y": index, "label": str(index)} for index in range(7)],
            "caption": "caption " * 40,
        },
        "chart",
    )
    assert any("caption 超过" in error for error in chart.errors)
    assert any("标签超过" in error for error in chart.errors)

    runnable = validate_block(
        {
            "type": "runnable",
            "languages": ["python"],
            "starter": {"python": "\n".join("pass" for _ in range(61))},
            "env": {"kind": "custom", "pythonPreamble": "x = 1"},
        },
        "runnable",
    )
    assert any("60 行" in error for error in runnable.errors)

    hidden_algorithm = validate_block(
        {
            "type": "runnable",
            "languages": ["python"],
            "headline": "实现 AVL 插入与旋转",
            "description": "补全并运行核心算法",
            "starter": {"python": "keys = [3, 2, 1]\nprint(run(keys))"},
            "env": {
                "kind": "custom",
                "pythonPreamble": (
                    "class Node: pass\n"
                    "def rotate_left(x): return x\n"
                    "def rotate_right(x): return x\n"
                    "def insert(root, key): return root\n"
                ),
            },
        },
        "runnable",
    )
    assert any("核心函数全部藏在" in error for error in hidden_algorithm.errors)

    unresolved_widget_token = validate_block(
        {
            "type": "sim",
            "engine": "widget",
            "html": (
                "<style>.stage{background:var(--card-bg);transition:opacity .2s}"
                ".label{color:var(--ink);font-size:14px}</style>"
                "<div class='stage'><span class='label'>30</span></div>"
            ),
        },
        "sim",
    )
    assert any("宿主未提供" in error and "--card-bg" in error for error in unresolved_widget_token.errors)

    tiny_widget_text = validate_block(
        {
            "type": "sim",
            "engine": "widget",
            "html": (
                "<style>.stage{background:var(--card);transition:opacity .2s}"
                ".label{color:var(--ink);font-size:10px}</style>"
                "<div class='stage'><span class='label'>BF=1</span></div>"
            ),
        },
        "sim",
    )
    assert any("小于 12px" in error for error in tiny_widget_text.errors)


def test_scene_semantics_reject_hero_inside_content_and_repeated_statement_title() -> None:
    content_hero = _minimal_doc()
    content_hero["scenes"][1]["kind"] = "content"
    content_hero["scenes"][1]["blocks"] = [
        {"type": "hero", "title": ["伪装成内容卡"]}
    ]
    result = validate_doc(content_hero)
    assert any("hero block 只能用于 hero 页" in error for error in result.errors)

    duplicate = _minimal_doc()
    duplicate["scenes"][1]["kind"] = "statement"
    duplicate["scenes"][1]["headline"] = "平衡树的核心"
    duplicate["scenes"][1]["blocks"] = [
        {"type": "statement", "statement": "平衡树的核心：平衡树的核心"}
    ]
    result = validate_doc(duplicate)
    assert any("statement 不得重复页标题" in error for error in result.errors)


def test_scene_headline_exposes_hidden_runnable_algorithm() -> None:
    doc = _minimal_doc()
    doc["scenes"][1] = {
        "id": "s1",
        "kind": "content",
        "headline": "实现 AVL 插入与旋转",
        "lead": "运行并调试核心算法。",
        "notes": "学习者应修改实现。",
        "blocks": [
            {
                "type": "runnable",
                "languages": ["python"],
                "starter": {"python": "keys = [3, 2, 1]\nprint(run(keys))"},
                "env": {
                    "kind": "custom",
                    "pythonPreamble": (
                        "class Node: pass\n"
                        "def rotate_left(x): return x\n"
                        "def rotate_right(x): return x\n"
                        "def insert(root, key): return root\n"
                    ),
                },
            }
        ],
    }
    result = validate_doc(doc)
    assert any("核心函数全部藏在" in error for error in result.errors)


def test_tree_graph_rejects_balance_factor_inconsistent_with_child_heights() -> None:
    graph = validate_block(
        {
            "type": "graph",
            "graphType": "tree",
            "orientation": "vertical",
            "nodes": [
                {"id": "p", "title": "20", "sub": "h=2, BF=+1"},
                {"id": "l", "title": "10", "sub": "h=1, BF=0"},
                {"id": "r", "title": "25", "sub": "h=1, BF=0"},
            ],
            "edges": [
                {"from": "p", "to": "l", "label": "L (h=1)"},
                {"from": "p", "to": "r", "label": "R (h=1)"},
            ],
        },
        "graph",
    )
    assert any("BF 标注与子树高度矛盾" in error for error in graph.errors)


def test_tree_graph_accepts_either_balance_factor_sign_convention() -> None:
    graph = validate_block(
        {
            "type": "graph",
            "graphType": "tree",
            "orientation": "vertical",
            "nodes": [
                {"id": "p", "title": "20", "sub": "h=2, BF=-1"},
                {"id": "l", "title": "10", "sub": "h=1, BF=0"},
                {"id": "r", "title": "NIL", "sub": "h=0"},
            ],
            "edges": [
                {"from": "p", "to": "l", "label": "L"},
                {"from": "p", "to": "r", "label": "R"},
            ],
        },
        "graph",
    )
    assert not any("BF 标注与子树高度矛盾" in error for error in graph.errors)
