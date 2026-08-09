"""agents/ 层离线单测：ScriptedClient seam + socket guard，全程零网络。"""

import dataclasses
import json

import pytest
from openharness.api.client import ApiMessageCompleteEvent
from openharness.api.usage import UsageSnapshot
from openharness.engine.messages import ConversationMessage, TextBlock, ToolUseBlock
from openharness.engine.query import MaxTurnsExceeded
from openharness.tools.base import BaseTool, ToolExecutionContext, ToolResult
from pydantic import BaseModel

from notale.agents.runtime import AgentBase, render_skills_block
from notale.roles.base import RoleSpec
from notale.tools.fetch_web import (
    FetchWebInput,
    FetchWebTool,
    SearchWebInput,
    SearchWebTool,
)
from notale.roles.profiles import BUILDER, RESEARCH, builder_profile, planner_profile
from notale.roles.authoring import LECTURE_AUTHORING
from oh_fake import ScriptedClient, no_network, text_msg, tool_call_msg
from notale.tools.retriever import FakeRetriever


class CalcInput(BaseModel):
    a: float
    b: float


class CalcTool(BaseTool):
    name = "calc"
    description = "两数相加"
    input_model = CalcInput

    async def execute(self, arguments: CalcInput, context: ToolExecutionContext) -> ToolResult:
        return ToolResult(output=str(arguments.a + arguments.b))


async def test_tool_call_observation_and_receipts(tmp_path):
    """工具被调用 → 观察回填模型 → 最终文本；tool_receipts 有记录。"""
    with no_network():
        client = ScriptedClient([tool_call_msg("calc", {"a": 2, "b": 3}), text_msg("和是 5")])
        base = AgentBase(
            RoleSpec(name="t", system_prompt="s", tools=[CalcTool()]),
            client=client,
            workspace=tmp_path,
        )
        result = await base.run("算 2+3")
    assert result.text == "和是 5"
    assert result.turns == 2
    assert len(client.requests) == 2  # 工具结果回填后又问了一次模型
    assert result.input_tokens == 2 and result.output_tokens == 2  # ScriptedClient 每回合报 1
    assert len(result.tool_receipts) == 1
    receipt = result.tool_receipts[0]
    assert receipt.name == "calc" and receipt.args == {"a": 2, "b": 3}
    assert float(receipt.output) == 5 and not receipt.is_error


class _EndlessToolClient:
    """永远要求调工具——max_turns 必须能封顶。"""

    async def stream_message(self, request):
        del request
        yield ApiMessageCompleteEvent(
            message=tool_call_msg("calc", {"a": 1, "b": 1}),
            usage=UsageSnapshot(input_tokens=1, output_tokens=1),
            stop_reason="tool_use",
        )


async def test_max_turns_cap(tmp_path):
    with no_network():
        base = AgentBase(
            RoleSpec(name="t", system_prompt="s", tools=[CalcTool()], max_turns=2),
            client=_EndlessToolClient(),
            workspace=tmp_path,
        )
        with pytest.raises(MaxTurnsExceeded):
            await base.run("无限循环")


class _TextThenEndlessToolClient:
    """先给一段文本+工具调用，之后永远要调工具——验证 MaxTurnsExceeded 降级返回部分文本。"""

    def __init__(self) -> None:
        self._first = True

    async def stream_message(self, request):
        del request
        if self._first:
            self._first = False
            message = ConversationMessage(
                role="assistant",
                content=[TextBlock(text="部分结论"), ToolUseBlock(name="calc", input={"a": 1, "b": 1})],
            )
        else:
            message = tool_call_msg("calc", {"a": 1, "b": 1})
        yield ApiMessageCompleteEvent(
            message=message,
            usage=UsageSnapshot(input_tokens=1, output_tokens=1),
            stop_reason="tool_use",
        )


async def test_max_turns_degrades_to_partial_text(tmp_path):
    """已积累文本时 MaxTurnsExceeded 不抛——部分结果好过全丢（真机冒烟撞过）。"""
    with no_network():
        base = AgentBase(
            RoleSpec(name="t", system_prompt="s", tools=[CalcTool()], max_turns=3),
            client=_TextThenEndlessToolClient(),
            workspace=tmp_path,
        )
        result = await base.run("先答一半再无限循环")
    assert result.text == "部分结论"


async def test_fetch_web_tool_lands_fetch_records(tmp_path):
    """RESEARCH 的 fetch 工具：模型调用后 .records 自动落 FetchRecord（url+fetchedAt）。"""
    page = "快速排序的平均时间复杂度是 O(n log n)。"
    tool = FetchWebTool(FakeRetriever({"https://ref/sort": page}))
    client = ScriptedClient([tool_call_msg("fetch_web", {"url": "https://ref/sort"}), text_msg("抓完了")])
    with no_network():
        base = AgentBase(
            dataclasses.replace(RESEARCH, tools=[tool], skills=[]),
            client=client,
            workspace=tmp_path,
        )
        result = await base.run("抓 https://ref/sort 并引用")
    assert result.tool_receipts[0].name == "fetch_web" and not result.tool_receipts[0].is_error
    assert len(tool.records) == 1
    rec = tool.records[0]
    assert rec.url == "https://ref/sort" and rec.content == page and rec.fetchedAt


async def test_search_and_fetch_budgets_count_failed_attempts(tmp_path):
    class FakeSearch:
        async def execute(self, arguments, context):
            del context
            return ToolResult(output=f"URL: https://ref/{arguments.query}")

    state = tmp_path / "tool-state.json"
    search = SearchWebTool(state_path=state, max_requests=1, inner=FakeSearch())
    first = await search.execute(SearchWebInput(query="sorting"), None)  # type: ignore[arg-type]
    second = await search.execute(SearchWebInput(query="retry"), None)  # type: ignore[arg-type]
    assert not first.is_error and "searchAttemptsRemaining=0" in first.output
    assert second.is_error and "额度已用完" in second.output

    fetch = FetchWebTool(FakeRetriever(), state_path=state, max_requests=2)
    failed1 = await fetch.execute(FetchWebInput(url="https://missing/1"), None)  # type: ignore[arg-type]
    failed2 = await fetch.execute(FetchWebInput(url="https://missing/2"), None)  # type: ignore[arg-type]
    blocked = await fetch.execute(FetchWebInput(url="https://missing/3"), None)  # type: ignore[arg-type]
    assert failed1.is_error and failed2.is_error and blocked.is_error
    saved = json.loads(state.read_text())
    assert saved["webSearchAttempts"] == 1 and saved["fetchAttempts"] == 2


def test_render_skills_block_lists_and_inlines():
    block = render_skills_block(["create-sim", "web-access"])
    assert "- create-sim:" in block and "- web-access:" in block  # 清单（name+description）
    assert "## skill: create-sim" in block and "Direct workflow" in block  # SKILL.md 全文注入
    assert "bubbleSort(input)" in block and "domain engine" in block
    with pytest.raises(ValueError, match="找不到 skill"):
        render_skills_block(["no-such-skill"])  # 缺 skill fail-closed


def test_builder_profile_skills_all_render():
    block = render_skills_block(BUILDER.skills)
    assert len(BUILDER.skills) == 10
    assert "frontend-slides" in BUILDER.skills
    assert "frontend-design" not in BUILDER.skills
    assert "design-taste-frontend" not in BUILDER.skills
    for name in BUILDER.skills:
        assert f"## skill: {name}" in block


def test_authoring_profile_is_system_level_and_auditable():
    planner = planner_profile(30)
    assert planner.skills == ["curriculum-planning", "frontend-slides"]
    assert planner.system_profiles == ()
    assert planner.system_profile_metadata() == []
    rendered_planner = planner.rendered_system_prompt()
    assert "课程学习架构与证据路由" in rendered_planner
    assert "正式讲义" not in rendered_planner

    assert BUILDER.system_profiles == (LECTURE_AUTHORING,)
    rendered_builder = BUILDER.rendered_system_prompt()
    assert "正式讲义" in rendered_builder and "静默出版编辑" in rendered_builder
    assert "唯一状态源" in rendered_builder and "不得手工伪造教学状态" in rendered_builder
    metadata = BUILDER.system_profile_metadata()
    assert metadata == [{
        "name": "lecture-authoring",
        "version": "3",
        "sha256": LECTURE_AUTHORING.sha256,
    }]
    assert len(metadata[0]["sha256"]) == 64


def test_profiles_use_only_shared_emergency_ceiling():
    assert planner_profile(7).max_tokens == 128000
    assert planner_profile(30).max_tokens == 128000
    sim = builder_profile("sim-explorable")
    code = builder_profile("code-runnable")
    assert (sim.max_tokens, sim.request_timeout_sec) == (128000, 600)
    assert (code.max_tokens, code.request_timeout_sec) == (128000, 600)
    assert code.max_provider_attempts == 2


def test_all_research_workers_receive_both_web_skills_and_atomic_tools():
    from notale.roles.profiles import RESEARCH

    assert RESEARCH.skills == ["research-evidence", "web-access"]
    assert {"web_search", "fetch_web"}.issubset(RESEARCH.allowed_tools)


def test_builder_skills_come_from_single_config_source():
    """Builder skill assignment is no longer split across code and an env switch."""
    import notale.roles.profiles as profiles
    from notale.utils.config import get_config

    assert profiles._BUILDER_SKILLS_ALL == get_config().agents.builder_skills
    assert BUILDER.skills == get_config().agents.builder_skills
