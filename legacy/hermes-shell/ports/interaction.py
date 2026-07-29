"""UserPort 接缝：外壳在需要澄清时向用户提问。

真接缝（≥2 实现）：交互式 CLI（真问真答）/ 脚本化 fixture（按预置答案回，供 replay/测试确定性）。
clarify 工具靠它把"问用户"这一步也变成可注入、可复现的依赖。
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class UserPort(Protocol):
    async def ask(self, question: str) -> str:
        """向用户提一个澄清问题，返回其回答文本。"""
        ...
