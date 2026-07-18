"""Tool 接缝：LLM 可调用的工具（function-calling）。domain 只认这个接口，不知道工具怎么实现。

纯工具（calc 等，无 I/O）住 domain/tools/；需网络/沙箱的工具（retrieve/run_code）住 adapters/。
两者都实现本 Protocol，注入进 tool-loop——换实现不动 domain。
"""

from __future__ import annotations

from typing import Any, Protocol, TypedDict, runtime_checkable


class ToolSpec(TypedDict):
    name: str
    description: str
    parameters: dict[str, Any]  # JSON Schema（喂给模型的 function 定义）


@runtime_checkable
class Tool(Protocol):
    @property
    def spec(self) -> ToolSpec:
        """function 定义：name + description + JSON-Schema 参数。"""
        ...

    async def run(self, args: dict[str, Any]) -> str:
        """执行工具，返回给模型的观察文本（observation）。"""
        ...
