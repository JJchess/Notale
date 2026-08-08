"""agents/ 层离线单测：ScriptedClient seam + socket guard，全程零网络。"""

import dataclasses

import pytest
from openharness.api.client import ApiMessageCompleteEvent
from openharness.api.usage import UsageSnapshot
from openharness.engine.messages import ConversationMessage, TextBlock, ToolUseBlock
from openharness.engine.query import MaxTurnsExceeded
from openharness.tools.base import BaseTool, ToolExecutionContext, ToolResult
from pydantic import BaseModel

from agents.base import AgentBase, AgentProfile, render_skills_block
from agents.fetch_web import FetchWebTool
from agents.profiles import BUILDER, RESEARCH
from oh_fake import ScriptedClient, no_network, text_msg, tool_call_msg
from tools.retriever import FakeRetriever


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
            AgentProfile(name="t", system_prompt="s", tools=[CalcTool()]),
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
            AgentProfile(name="t", system_prompt="s", tools=[CalcTool()], max_turns=2),
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
            AgentProfile(name="t", system_prompt="s", tools=[CalcTool()], max_turns=3),
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


def test_render_skills_block_lists_and_inlines():
    block = render_skills_block(["create-sim", "web-access"])
    assert "- create-sim:" in block and "- web-access:" in block  # 清单（name+description）
    assert "## skill: create-sim" in block and "GenUI" in block  # SKILL.md 全文注入
    with pytest.raises(ValueError, match="找不到 skill"):
        render_skills_block(["no-such-skill"])  # 缺 skill fail-closed


def test_builder_profile_skills_all_render():
    block = render_skills_block(BUILDER.skills)
    assert len(BUILDER.skills) == 11
    for name in BUILDER.skills:
        assert f"## skill: {name}" in block


def test_builder_skills_env_switch(monkeypatch):
    """V3_BUILDER_SKILLS 裁剪子集；缺省全量；未知名字 fail-closed。"""
    import agents.profiles as profiles

    monkeypatch.delenv("V3_BUILDER_SKILLS", raising=False)
    assert profiles._builder_skills() == profiles._BUILDER_SKILLS_ALL  # 缺省全量

    monkeypatch.setenv("V3_BUILDER_SKILLS", "frontend-slides, create-sim")
    assert profiles._builder_skills() == ["frontend-slides", "create-sim"]

    monkeypatch.setenv("V3_BUILDER_SKILLS", "no-such-skill")
    with pytest.raises(ValueError, match="未知 skill"):
        profiles._builder_skills()
