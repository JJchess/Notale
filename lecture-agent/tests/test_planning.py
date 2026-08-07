"""版式分配契约测试：size 驱动的 assign_layouts + _compose_areas_from_sizes 纯函数。

覆盖此前完全零测试的 index/split/full/新 compose 分支——这正是"index 版式恒为 0"这类
死能力能在真实语料里悄悄发生而没人发现的原因之一。
"""

from __future__ import annotations

from lecture_agent.domain.planning import (
    _compose_areas_from_sizes,
    _evidence_obligation,
    _skeleton_spec,
    _validated_knowledge_forms,
    assign_layouts,
    fill_scene_budget,
    fit_scene_budget,
)
from lecture_agent.domain.skills import load_skill_catalog, plan_menu
from lecture_agent.domain.themes import theme_menu


def _scene(scene_id: str, blocks: list[dict]) -> dict:
    return {"id": scene_id, "kind": "content", "notes": "备注。", "blocks": blocks}


def _block(bid: str, btype: str = "list", size: str | None = None) -> dict:
    b = {"id": bid, "type": btype}
    if size is not None:
        b["size"] = size
    return b


def test_compose_areas_from_sizes_no_overlap_and_wraps() -> None:
    blocks = [_block("a", size="l"), _block("b", size="s"), _block("c", size="m")]
    areas = _compose_areas_from_sizes(blocks)
    assert len(areas) == 3
    for a in areas:
        start, end = a["col"]
        assert 1 <= start < end <= 13
    # l(8)+s(4)=12 恰好占满第一行，m(6) 应回卷到第二行(col 从 1 开始)
    assert areas[0]["col"] == [1, 9]
    assert areas[1]["col"] == [9, 13]
    assert areas[2]["col"] == [1, 7]


def test_compose_areas_from_sizes_preserves_block_ids() -> None:
    blocks = [_block("x", size="xl")]
    areas = _compose_areas_from_sizes(blocks)
    assert areas == [{"blockIds": ["x"], "col": [1, 13]}]


# ---- 描述驱动路由：规划器 prompt 应吃各组件描述、且不再压制互动组件 ----


def test_skeleton_prompt_is_description_driven() -> None:
    registry, planning = load_skill_catalog()
    spec = _skeleton_spec(
        8, plan_menu(registry, planning), "", theme_menu(), "", "AUTH", absolute_frames=True
    )
    # ① 描述菜单在场（组件家族的 description 被真正塞进 plan 提示，而非裸类型名）。
    assert "可选组件" in spec
    assert "Reach for it" in spec  # 来自打磨后的 sim/runnable/chart/quiz 描述
    # ② 每个 auto_type 的名字仍出现（合法性/禁新造那条硬规则的清单）。
    for t in planning:
        assert t in spec
    # 页级教学/视觉/证据契约必须在规划阶段建立，不能留给互不通信的 block 猜。
    for field in ("objective", "keyClaim", "misconception", "visualTask", "evidencePolicy"):
        assert field in spec
    assert "禁止凭空写论文名+年份" in spec
    assert "装饰模板冒充数学图" in spec
    assert '"initial":0' in spec
    assert "纯文字不能冒充视觉证据" in spec
    assert 'layout.kind:"frames"' in spec
    assert "1280×720" in spec
    assert "x/y/w/h/z/role/clip" in spec
    assert '"size"' not in spec
    assert "xl" not in spec


def test_assign_layouts_never_mixes_legacy_geometry_into_frames_document() -> None:
    doc = {
        "scenes": [
            {
                "id": "p1", "kind": "content", "blocks": [_block("a")],
                "layout": {
                    "kind": "frames", "canvas": {"width": 1280, "height": 720},
                    "titleFrame": {"x": 64, "y": 40, "w": 1152, "h": 100, "z": 5},
                    "frames": [{"blockId": "a", "x": 64, "y": 160, "w": 1152, "h": 496, "z": 1, "role": "primary", "clip": False}],
                },
            },
            {"id": "p2", "kind": "content", "blocks": [_block("b")]},
        ]
    }
    assert assign_layouts(doc) == 0
    assert "layout" not in doc["scenes"][1]


def test_skeleton_prompt_drops_interactive_suppression() -> None:
    registry, planning = load_skill_catalog()
    spec = _skeleton_spec(8, plan_menu(registry, planning), "", theme_menu(), "", "AUTH")
    # 放开：不再有"最低优先级 / 别过量 / 至多 2 个"这类把互动组件劝退的措辞。
    for banned in ("最低优先级", "别过量", "至多 2 个", "0-2 个"):
        assert banned not in spec, f"压制措辞未清除: {banned}"
    # 保留：题材适配护栏(判据式，不点名学科)与 widget 触发机制仍在。
    assert "纯叙述、纯观点" in spec
    assert "人文学科" not in spec and "艺术学科" not in spec  # 不按学科名称映射能力
    assert "state-sim|model-sim|geometry-sim" in spec
    assert "interactionBrief" in spec


def test_knowledge_forms_require_evidence_semantics_not_positioned_nodes() -> None:
    perspectives = [
        {
            "focus": "逐步实现树插入与旋转，并用测试验证代码",
            "mustCover": ["高度与节点数递推", "节点与边的树结构"],
            "questions": ["旋转后结构如何变化？"],
        }
    ]
    forms = _validated_knowledge_forms(
        [
            "dynamic-process",
            "executable-artifact",
            "quantitative-model",
            "spatial-constraint",
            "relational-structure",
        ],
        perspectives,
    )
    assert forms == [
        "dynamic-process",
        "executable-artifact",
        "quantitative-model",
        "relational-structure",
    ]


def test_observational_evidence_requires_faithful_appearance_semantics() -> None:
    perspectives = [
        {
            "focus": "从标本照片辨认可观察形态，再用关系图解释机制",
            "mustCover": ["真实对象的外观差异", "固定结构关系"],
            "questions": ["哪些特征能从实物观察直接判断？"],
        }
    ]
    forms = _validated_knowledge_forms(["observational-evidence"], perspectives)
    assert forms == ["relational-structure", "observational-evidence"]
    obligation = _evidence_obligation("observational-evidence", perspectives)
    assert obligation["capability"] == "media"
    assert "真实对象" in obligation["requiredEvidence"]


def test_quantitative_obligation_uses_chart_without_parameter_control() -> None:
    static = _evidence_obligation(
        "quantitative-model",
        [{"focus": "由递推公式计算高度与最少节点数", "mustCover": ["复杂度上界"]}],
    )
    interactive = _evidence_obligation(
        "quantitative-model",
        [{"focus": "调节参数并观察模型重新计算", "mustCover": ["参数控制"]}],
    )
    assert static["capability"] == "chart"
    assert interactive["capability"] == "model-sim"


def test_overfull_skeleton_keeps_evidence_pages_and_hits_exact_budget() -> None:
    doc = {
        "scenes": [
            {"id": "cover", "kind": "hero", "blocks": [{"type": "hero"}]},
            {"id": "relation", "kind": "content", "blocks": [{"type": "graph"}]},
            {"id": "summary-table", "kind": "content", "blocks": [{"type": "table"}]},
            {"id": "state", "kind": "content", "blocks": [{"type": "state-sim"}]},
            {"id": "comparison-table", "kind": "content", "blocks": [{"type": "table"}]},
            {"id": "runtime", "kind": "content", "blocks": [{"type": "runnable"}]},
            {"id": "outro", "kind": "hero", "blocks": [{"type": "hero"}]},
        ]
    }
    removed = fit_scene_budget(doc, 5)
    assert removed == ["summary-table", "comparison-table"]
    assert [scene["id"] for scene in doc["scenes"]] == [
        "cover", "relation", "state", "runtime", "outro"
    ]


def test_underfull_skeleton_splits_real_evidence_to_hit_exact_budget() -> None:
    doc = {
        "title": "AVL",
        "scenes": [
            {"id": "cover", "kind": "hero", "blocks": [{"type": "hero"}]},
            {
                "id": "dense",
                "kind": "content",
                "headline": "旋转与不变量",
                "brief": {"misconception": "旋转改变顺序", "evidencePolicy": "derived"},
                "blocks": [
                    {"type": "state-sim", "intent": "追踪一次右旋"},
                    {"type": "formula", "intent": "验证中序序列不变"},
                    {"type": "quiz", "intent": "判断旋转后的根"},
                ],
            },
            {"id": "outro", "kind": "statement", "blocks": [{"type": "statement"}]},
        ],
    }
    inserted = fill_scene_budget(doc, 4)
    assert inserted == ["dense"]
    assert len(doc["scenes"]) == 4
    assert [block["type"] for block in doc["scenes"][1]["blocks"]] == ["state-sim", "formula"]
    continuation = doc["scenes"][2]
    assert continuation["kind"] == "quiz"
    assert continuation["blocks"] == [{"type": "quiz", "intent": "判断旋转后的根"}]
    assert continuation["brief"]["requiredEvidence"] == "判断旋转后的根"


def test_single_large_block_gets_full() -> None:
    doc = {"scenes": [_scene("s1", [_block("b1", "chart", size="l")])]}
    n = assign_layouts(doc)
    assert n == 1
    assert doc["scenes"][0]["layout"] == {"kind": "full"}


def test_single_small_block_not_full() -> None:
    doc = {"scenes": [_scene("s1", [_block("b1", "statement", size="s")])]}
    assign_layouts(doc)
    assert "layout" not in doc["scenes"][0]


def test_two_similar_size_blocks_get_index() -> None:
    doc = {"scenes": [_scene("s1", [_block("b1", size="m"), _block("b2", size="m")])]}
    n = assign_layouts(doc)
    assert n == 1
    layout = doc["scenes"][0]["layout"]
    assert layout["kind"] == "index"
    assert len(layout["steps"]) == 2


def test_two_blocks_size_gap_get_split_anchored_on_smaller() -> None:
    doc = {
        "scenes": [_scene("s1", [_block("b1", "list", size="s"), _block("b2", "agenda", size="l")])]
    }
    n = assign_layouts(doc)
    assert n == 1
    layout = doc["scenes"][0]["layout"]
    assert layout["kind"] == "split"
    assert layout["anchor"] == ["b1"]  # 较小的那块做锚(窄侧栏)，较大的占主栏


def test_callout_pair_still_gets_compose_sidenote_regression() -> None:
    """回归：type 触发的 compose/sidenote 不受 size 改动影响。"""
    doc = {
        "scenes": [
            _scene("s1", [_block("b1", "list", size="l"), _block("b2", "callout", size="l")])
        ]
    }
    n = assign_layouts(doc)
    assert n == 1
    assert doc["scenes"][0]["layout"] == {"kind": "compose", "preset": "sidenote"}


def test_three_mixed_size_blocks_get_computed_compose() -> None:
    doc = {
        "scenes": [
            _scene(
                "s1",
                [_block("b1", size="l"), _block("b2", size="s"), _block("b3", size="s")],
            )
        ]
    }
    n = assign_layouts(doc)
    assert n == 1
    layout = doc["scenes"][0]["layout"]
    assert layout["kind"] == "compose"
    assert "areas" in layout
    assert len(layout["areas"]) == 3


def test_three_similar_size_blocks_get_index_not_compose() -> None:
    doc = {
        "scenes": [
            _scene(
                "s1",
                [_block("b1", size="m"), _block("b2", size="m"), _block("b3", size="m")],
            )
        ]
    }
    n = assign_layouts(doc)
    assert n == 1
    assert doc["scenes"][0]["layout"]["kind"] == "index"


def test_missing_size_defaults_to_medium() -> None:
    doc = {"scenes": [_scene("s1", [_block("b1"), _block("b2")])]}
    n = assign_layouts(doc)
    assert n == 1
    assert doc["scenes"][0]["layout"]["kind"] == "index"


def test_split_type_trigger_keeps_old_anchor_behavior() -> None:
    """回归：type 触发(blocks[1] 是数据类型)时 anchor 仍是 blocks[0]，不受 size 影响。"""
    doc = {
        "scenes": [_scene("s1", [_block("b1", "list", size="xl"), _block("b2", "chart", size="s")])]
    }
    n = assign_layouts(doc)
    assert n == 1
    layout = doc["scenes"][0]["layout"]
    assert layout["kind"] == "split"
    assert layout["anchor"] == ["b1"]


def test_layout_fit_is_not_disabled_by_global_style_quota() -> None:
    scenes = [
        _scene(f"s{i}", [_block(f"b{i}a", size="m"), _block(f"b{i}b", size="m")]) for i in range(5)
    ]
    doc = {"scenes": scenes}
    n = assign_layouts(doc)
    index_count = sum(1 for s in scenes if s.get("layout", {}).get("kind") == "index")
    assert index_count == 5
    assert n == 5


def test_chart_first_still_gets_wide_main_column() -> None:
    doc = {
        "scenes": [_scene("s1", [_block("chart", "chart", size="l"), _block("why", "list", size="m")])]
    }
    assign_layouts(doc)
    layout = doc["scenes"][0]["layout"]
    assert layout["kind"] == "split"
    assert layout["anchor"] == ["why"]


def test_formula_and_chart_use_full_width_index_not_narrow_split() -> None:
    doc = {
        "scenes": [
            _scene(
                "s1",
                [_block("derivation", "formula", size="m"), _block("curve", "chart", size="l")],
            )
        ]
    }
    assign_layouts(doc)
    layout = doc["scenes"][0]["layout"]
    assert layout["kind"] == "index"
    assert [s["blockIds"] for s in layout["steps"]] == [["derivation"], ["curve"]]
