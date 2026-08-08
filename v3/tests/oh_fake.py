"""OpenHarness 测试替身与离线 guard——spike 验证过的 seam（docs/openharness-spike.md 第 4 项）。

ScriptedClient 鸭子实现 SupportsStreamingMessages（openharness/api/client.py:79，
该 Protocol 无 runtime_checkable，靠方法面 conformance），按脚本产事件，零网络。
no_network 在块内 patch socket 三入口，任何联网企图直接炸——测试纪律的结构保证。
"""

from __future__ import annotations

import socket
from collections import deque
from contextlib import contextmanager
from typing import AsyncIterator

from openharness.api.client import (
    ApiMessageCompleteEvent,
    ApiMessageRequest,
    ApiStreamEvent,
    ApiTextDeltaEvent,
)
from openharness.api.usage import UsageSnapshot
from openharness.engine.messages import ConversationMessage, TextBlock, ToolUseBlock


@contextmanager
def no_network():
    def _boom(*args, **kwargs):
        raise RuntimeError("测试试图联网——全部测试必须零网络")

    orig = (socket.socket.connect, socket.create_connection, socket.getaddrinfo)
    socket.socket.connect = _boom  # type: ignore[method-assign]
    socket.create_connection = _boom  # type: ignore[assignment]
    socket.getaddrinfo = _boom  # type: ignore[assignment]
    try:
        yield
    finally:
        (socket.socket.connect, socket.create_connection, socket.getaddrinfo) = orig  # type: ignore[misc]


def text_msg(text: str) -> ConversationMessage:
    return ConversationMessage(role="assistant", content=[TextBlock(text=text)])


def tool_call_msg(name: str, tool_input: dict) -> ConversationMessage:
    return ConversationMessage(role="assistant", content=[ToolUseBlock(name=name, input=tool_input)])


class ScriptedClient:
    """按固定脚本产助手消息；requests 记录每次调用（证明观察回填）。"""

    def __init__(self, script: list[ConversationMessage]) -> None:
        self._script: deque[ConversationMessage] = deque(script)
        self.requests: list[ApiMessageRequest] = []

    async def stream_message(self, request: ApiMessageRequest) -> AsyncIterator[ApiStreamEvent]:
        self.requests.append(request)
        if not self._script:
            raise RuntimeError("ScriptedClient 脚本耗尽")
        message = self._script.popleft()
        for block in message.content:
            if isinstance(block, TextBlock) and block.text:
                yield ApiTextDeltaEvent(text=block.text)
        yield ApiMessageCompleteEvent(
            message=message,
            usage=UsageSnapshot(input_tokens=1, output_tokens=1),
            stop_reason="tool_use" if message.tool_uses else "end_turn",
        )
