"""P2 · 观测遮蔽铁律：阶段级工具只回**摘要/单片**，full deck 只进 CorpusStore、不进返回值。

- make_lecture 造完 deck 存库，返回值是摘要（页块数/类型计数），不含正文。
- view_scene 只拉单页，不吐整档。
- evaluate 返回确定性门摘要。
"""

from __future__ import annotations

import json

from lecture_agent.adapters.llm.fake import FakeClient
from lecture_agent.adapters.store import FilesystemStore
from lecture_agent.engine import GeneratorOptions
from lecture_agent.shell.tools import EvaluateTool, MakeLectureTool, SkillViewTool, ViewSceneTool
from lecture_agent.domain.context import mask
from lecture_agent.domain.skills import load_skills

_SKELETON = json.dumps(
    {
        "id": "demo",
        "title": "示例讲义",
        "language": "zh-CN",
        "theme": "cartesian",
        "scenes": [
            {"id": "cover", "kind": "hero", "notes": "开场。",
             "blocks": [{"id": "b0", "type": "hero", "intent": "封面"}]},
            {"id": "p1", "kind": "statement", "notes": "主旨。",
             "blocks": [{"id": "b1", "type": "statement", "intent": "一句话主旨"}]},
        ],
    }
)
_BY_PURPOSE = {
    "plan:skeleton": _SKELETON,
    "block:hero": json.dumps({"type": "hero", "title": ["梯度下降", "副标题"]}),
    "block:statement": json.dumps({"type": "statement", "statement": "梯度下降沿负梯度方向迭代收敛。"}),
    "notes": json.dumps({"note": "本页备注，讲清主线与常见误区。"}),
}
_SECRET = "梯度下降沿负梯度方向迭代收敛"  # 正文标记：绝不该出现在工具返回值里


def _make_tool(tmp_path):
    store = FilesystemStore(tmp_path)
    tool = MakeLectureTool(
        FakeClient(by_purpose=_BY_PURPOSE), store, options=GeneratorOptions(plan_perspectives=1)
    )
    return store, tool


async def test_make_lecture_returns_summary_and_stores_full_doc(tmp_path) -> None:
    store, tool = _make_tool(tmp_path)
    out = await tool.run({"topic": "梯度下降", "pages": 2, "theme": "cartesian", "deck_id": "demo"})
    # 返回值是摘要：短、含页数、不含正文
    assert "demo" in out and "2页" in out
    assert _SECRET not in out
    assert len(out) < 400
    # full doc 落库、可完整取回
    doc = store.load_deck("demo")
    assert len(doc["scenes"]) == 2
    assert _SECRET in json.dumps(doc, ensure_ascii=False)


async def test_view_scene_pulls_single_scene_not_whole_doc(tmp_path) -> None:
    store = FilesystemStore(tmp_path)
    store.save_deck("d", {
        "id": "d",
        "scenes": [
            {"kind": "hero", "blocks": [{"id": "b0", "type": "hero", "title": ["封面词"]}]},
            {"kind": "statement", "blocks": [{"id": "b1", "type": "statement", "statement": "正文一句"}]},
        ],
    })
    out = await ViewSceneTool(store).run({"deck_id": "d", "index": 1})
    assert "正文一句" in out
    assert "封面词" not in out  # 只回第 1 页，不带第 0 页


async def test_evaluate_returns_gate_summary(tmp_path) -> None:
    store = FilesystemStore(tmp_path)
    store.save_deck("d", {
        "id": "d",
        "scenes": [{"kind": "hero", "blocks": [{"id": "b0", "type": "hero", "title": ["梯度下降"]}]}],
    })
    out = await EvaluateTool(store).run({"deck_id": "d", "topic": "梯度下降", "target_pages": 1})
    assert "PASS" in out or "FAIL" in out


async def test_skill_view_index_lists_families() -> None:
    reg, _ = load_skills()
    out = await SkillViewTool(reg).run({})
    assert "可用内容组件家族" in out and len(out) > 20


def test_mask_folds_long_observations_only() -> None:
    short = "简短观测"
    assert mask(short) == short
    long = "x" * 800
    folded = mask(long, ref="deck:demo")
    assert "已折叠" in folded and "deck:demo" in folded and len(folded) < len(long)
    assert mask(long, keep=True) == long  # keep=True（活跃自修/最近一轮）不折叠
