"""Sandbox 接缝：跑模型写的 Python（PTC/RPC），脚本内经 dispatch 回调host工具，只回 stdout。

把多步工具链压进一个 turn、中间结果不进上下文窗口——这是最高杠杆的上下文省法（ce-context-optimization）。
真接缝（≥2 实现）：SubprocessSandbox（真进程隔离 + 文件 RPC，live）/ FakeSandbox（受限 in-process，
无 import/无副作用 → 确定，供 replay/测试）。复现性靠"实验/replay 注入 FakeSandbox 或按配置关闭"围堵。
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Protocol, runtime_checkable

from .tool import ToolSpec

# host 侧工具分发器：给工具名+参数，返回观察字符串（与 ports.Tool.run 同形）。
Dispatch = Callable[[str, dict[str, Any]], Awaitable[str]]


@dataclass
class SandboxResult:
    stdout: str
    ok: bool = True
    error: str = ""


@runtime_checkable
class Sandbox(Protocol):
    async def run(self, script: str, tools: list[ToolSpec], dispatch: Dispatch) -> SandboxResult:
        """执行 script；脚本可经暴露的工具句柄回调 host（dispatch）。返回捕获的 stdout。"""
        ...
