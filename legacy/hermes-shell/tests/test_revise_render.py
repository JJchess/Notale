"""P5 · 变更类工具：revise 绝不把非法 deck 落库；render 只回报告摘要（无 HTML）。"""

from __future__ import annotations

import json

from lecture_agent.adapters.llm.fake import FakeClient
from lecture_agent.adapters.render import StructuralVerifier
from lecture_agent.adapters.store import FilesystemStore
from lecture_agent.engine import GeneratorOptions
from lecture_agent.shell.tools import MakeLectureTool, RenderTool, ReviseBlockTool
from lecture_agent.domain.skills import load_skills
from lecture_agent.schema.validate import validate_doc

_SKELETON = json.dumps({
    "id": "demo", "title": "示例讲义", "language": "zh-CN", "theme": "cartesian",
    "scenes": [
        {"id": "cover", "kind": "hero", "notes": "开场。",
         "blocks": [{"id": "b0", "type": "hero", "intent": "封面"}]},
        {"id": "p1", "kind": "statement", "notes": "主旨。",
         "blocks": [{"id": "b1", "type": "statement", "intent": "一句话主旨"}]},
    ],
})
_BY_PURPOSE = {
    "plan:skeleton": _SKELETON,
    "block:hero": json.dumps({"type": "hero", "title": ["梯度下降", "副标题"]}),
    "block:statement": json.dumps({"type": "statement", "statement": "梯度下降沿负梯度方向迭代。"}),
    "notes": json.dumps({"note": "本页备注。"}),
}


async def _make_demo(tmp_path):
    store = FilesystemStore(tmp_path)
    llm = FakeClient(by_purpose=_BY_PURPOSE)
    await MakeLectureTool(llm, store, options=GeneratorOptions(plan_perspectives=1)).run(
        {"topic": "梯度下降", "pages": 2, "theme": "cartesian", "deck_id": "demo"}
    )
    return store


async def test_revise_block_happy_path_updates_and_persists(tmp_path) -> None:
    store = await _make_demo(tmp_path)
    reg, _ = load_skills()
    llm2 = FakeClient(by_purpose={
        "block:statement": json.dumps({"type": "statement", "statement": "修订后的精炼主旨。"})
    })
    out = await ReviseBlockTool(llm2, store, reg).run(
        {"deck_id": "demo", "block_id": "b1", "instruction": "更精炼", "topic": "梯度下降"}
    )
    assert out.startswith("✓")
    doc = store.load_deck("demo")
    b1 = next(b for s in doc["scenes"] for b in s["blocks"] if b["id"] == "b1")
    assert b1["statement"] == "修订后的精炼主旨。"
    assert validate_doc(doc).errors == []


async def test_revise_never_persists_invalid_deck(tmp_path) -> None:
    store = await _make_demo(tmp_path)
    reg, _ = load_skills()
    # 生成器持续吐一个缺 statement 字段的非法块 → revise 必须回滚、不落库
    bad = FakeClient(by_purpose={"block:statement": json.dumps({"type": "statement"})})
    out = await ReviseBlockTool(bad, store, reg).run(
        {"deck_id": "demo", "block_id": "b1", "instruction": "x"}
    )
    assert not out.startswith("✓")  # 未成功
    assert validate_doc(store.load_deck("demo")).errors == []  # 库里仍是合法 deck


async def test_render_returns_summary_without_html(tmp_path) -> None:
    store = await _make_demo(tmp_path)
    out = await RenderTool(store, StructuralVerifier()).run({"deck_id": "demo"})
    assert "OK" in out
    assert "<" not in out and "scenes" not in out  # 只回报告摘要，不吐 HTML/整档
