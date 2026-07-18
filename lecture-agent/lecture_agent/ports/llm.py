"""LLMClient 接缝：domain 只认这个接口，不知道模型/温度/端点/录制盒。

模型、温度、seed 全烘焙进具体 adapter（由 configs/llm/* 注入）——换模型/换 live↔replay 只改配置。

两个能力分成两个 Protocol，保持 LLMClient 最小：
- LLMClient.complete —— 一次约束 JSON 生成（确定性管线的主力）
- ToolCallingLLM.complete_tools —— function-calling 一回合（仅 tool-loop 路径需要，opt-in）
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol, TypedDict, runtime_checkable

from .tool import ToolSpec


class Message(TypedDict):
    role: str
    content: str


@runtime_checkable
class LLMClient(Protocol):
    async def complete(
        self,
        messages: list[Message],
        *,
        json_mode: bool = True,
        purpose: str = "chat",
    ) -> str:
        """一次 OpenAI 兼容 chat，返回文本。json_mode 请求 JSON 对象输出。

        purpose 是用途标签（plan:skeleton / block:sim …），供归因日志，不影响语义。
        """
        ...


@dataclass
class ToolInvocation:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class Turn:
    """一回合助手输出：要么给最终文本，要么要求调若干工具。"""

    content: str | None = None
    tool_calls: list[ToolInvocation] = field(default_factory=list)


@runtime_checkable
class ToolCallingLLM(Protocol):
    async def complete_tools(
        self,
        messages: list[dict[str, Any]],  # 含 tool 回合，用宽松 dict（OpenAI 线格式）
        tools: list[ToolSpec],
        *,
        purpose: str = "tools",
    ) -> Turn:
        """一回合 function-calling：模型可返回 tool_calls（要调工具）或 content（最终答复）。"""
        ...
