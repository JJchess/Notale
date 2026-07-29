"""P6 · delegate 隔离子代理：硬黑名单 + 父只见汇报 + 并行且顺序稳定。"""

from __future__ import annotations

from lecture_agent.adapters.llm.fake import FakeClient
from lecture_agent.shell.delegate import DELEGATE_BLOCKED, DelegateTool, child_toolset
from lecture_agent.domain.context import LoopBudget


class _Dummy:
    """占位工具对象（本测试不实际调用其 run）。"""


def test_child_toolset_drops_blocklist_keeps_rest() -> None:
    base = {name: _Dummy() for name in
            ["delegate", "clarify", "remember", "propose_skill", "cron", "make_lecture", "view_scene"]}
    child = child_toolset(base)
    for banned in DELEGATE_BLOCKED:
        assert banned not in child  # 禁递归/禁 clarify/禁写记忆
    assert "make_lecture" in child and "view_scene" in child


async def test_delegate_runs_parallel_and_returns_ordered_summaries() -> None:
    # content-only FakeClient：每个子代理立即返回同一句汇报 → 与并行顺序无关、确定
    llm = FakeClient(default="子任务完成")
    tool = DelegateTool(llm, base_tools={}, budget=LoopBudget(max_rounds=3), concurrency=2)
    out = await tool.run({"subtasks": ["写第1页", "写第2页", "写第3页"]})
    assert out.count("子任务完成") == 3  # 三个子代理都汇报了
    # 父只见汇报文本
    assert "汇报" in out
    # 顺序按 index 稳定（并行但结果对齐）
    assert out.index("写第1页") < out.index("写第2页") < out.index("写第3页")


async def test_delegate_empty_subtasks_errors() -> None:
    tool = DelegateTool(FakeClient(default="x"), base_tools={})
    assert (await tool.run({"subtasks": []})).startswith("ERROR")
