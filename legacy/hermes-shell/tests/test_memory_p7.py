"""P7 · 自动记忆(低风险)+召回：写穿透不扰当前会话（冻结快照）；召回排序纯函数；replay 仍确定。"""

from __future__ import annotations

import json

from lecture_agent.adapters.io import ScriptedUserPort
from lecture_agent.adapters.llm.fake import FakeClient
from lecture_agent.adapters.memory import FsMemoryStore, InMemoryMemoryStore, LedgerRecall
from lecture_agent.adapters.store import FilesystemStore, LedgerStore
from lecture_agent.engine import GeneratorOptions
from lecture_agent.shell.shell import run_shell
from lecture_agent.shell.tools import (
    ClarifyTool,
    MakeLectureTool,
    RecallTool,
    RememberTool,
)
from lecture_agent.domain.context import LoopBudget
from lecture_agent.domain.memory import distill_session, select_recall
from lecture_agent.domain.skills import load_skills
from lecture_agent.ports.memory import MemorySnapshot
from lecture_agent.schema import ExperimentRecord

_SKELETON = json.dumps({
    "id": "demo", "title": "T", "language": "zh-CN", "theme": "cartesian",
    "scenes": [
        {"id": "c", "kind": "hero", "notes": "n", "blocks": [{"id": "b0", "type": "hero", "intent": "封面"}]},
        {"id": "p", "kind": "statement", "notes": "n", "blocks": [{"id": "b1", "type": "statement", "intent": "主旨"}]},
    ],
})
_BY_PURPOSE = {
    "plan:skeleton": _SKELETON,
    "block:hero": json.dumps({"type": "hero", "title": ["梯度下降"]}),
    "block:statement": json.dumps({"type": "statement", "statement": "沿负梯度迭代。"}),
    "notes": json.dumps({"note": "备注。"}),
}


# ---- 纯函数 ----

def test_select_recall_ranks_and_filters_by_topic() -> None:
    recs = [
        {"topic": "梯度下降进阶", "pages": 10, "theme": "lab", "ok": True},
        {"topic": "二分查找", "pages": 6, "theme": "cartesian", "ok": True},
        {"topic": "梯度下降入门", "pages": 8, "theme": "cartesian", "ok": False},
    ]
    hits = select_recall(recs, "梯度下降", k=5)
    assert len(hits) == 2  # 二分查找 无重叠被过滤
    assert all("梯度下降" in h for h in hits)


def test_distill_session_dedups_and_strips() -> None:
    e = distill_session(user_notes=["  偏好深色 ", "偏好深色", ""], memory_notes=["sim 留白"])
    assert e.user_notes == ["偏好深色"]
    assert e.memory_notes == ["sim 留白"]


# ---- 写穿透 ----

async def test_remember_writes_through_to_disk(tmp_path) -> None:
    mem = FsMemoryStore(tmp_path)
    out = await RememberTool(mem).run({"kind": "user", "note": "受众默认研究生"})
    assert out.startswith("已记入 user")
    # 另起 store 指向同目录：可见（下会话生效）
    assert "研究生" in FsMemoryStore(tmp_path).load_snapshot().user_md


async def test_recall_tool_over_ledger(tmp_path) -> None:
    led = LedgerStore(tmp_path / "ledger.jsonl")
    led.append(ExperimentRecord(run_id="r1", ts="t", topic="梯度下降入门", pages=8, theme="cartesian"))
    led.append(ExperimentRecord(run_id="r2", ts="t", topic="快速排序", pages=6, theme="lab"))
    out = await RecallTool(LedgerRecall(led)).run({"topic": "梯度下降"})
    assert "梯度下降入门" in out and "快速排序" not in out


# ---- 冻结快照：写穿透不扰当前会话 + replay 确定 ----

def _turns():
    from lecture_agent.ports.llm import ToolInvocation, Turn
    return [
        Turn(tool_calls=[ToolInvocation("m", "make_lecture",
             {"topic": "梯度下降", "pages": 2, "theme": "cartesian", "deck_id": "demo"})]),
        Turn(tool_calls=[ToolInvocation("r", "remember", {"kind": "user", "note": "偏好深色主题"})]),
        Turn(content="完成，并已记住你的偏好。"),
    ]


async def _run(tmp_path):
    llm = FakeClient(by_purpose=_BY_PURPOSE, tool_turns=_turns())
    store = FilesystemStore(tmp_path)
    mem = InMemoryMemoryStore(user_md="", memory_md="")  # 起始为空
    reg, _ = load_skills()
    tools = {
        "make_lecture": MakeLectureTool(llm, store, options=GeneratorOptions(plan_perspectives=1)),
        "remember": RememberTool(mem),
        "clarify": ClarifyTool(ScriptedUserPort()),
    }
    res = await run_shell(llm, user_request="做梯度下降讲义并记住我喜欢深色", tools=tools,
                          registry=reg, memory=mem, budget=LoopBudget(max_rounds=8))
    return res, mem


async def test_write_through_does_not_disturb_frozen_session(tmp_path) -> None:
    res, mem = await _run(tmp_path)
    assert res.tool_sequence == ["make_lecture", "remember"]
    # 本轮用的是起始（空）快照，指纹 == 空记忆指纹——中途 remember 没改本轮系统提示
    assert res.memory_snapshot == MemorySnapshot.of("", "").version
    # 但写已穿透落到记忆里（下会话才会生效）
    assert "偏好深色主题" in mem.load_snapshot().user_md


async def test_shell_replay_still_deterministic_with_remember(tmp_path) -> None:
    r1, _ = await _run(tmp_path / "a")
    r2, _ = await _run(tmp_path / "b")
    assert r1.tool_sequence == r2.tool_sequence
    assert r1.final == r2.final
    assert r1.memory_snapshot == r2.memory_snapshot
