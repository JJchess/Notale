"""RenderVerifier 接缝：真机渲染验证（0 console error / 无溢出 / 字体加载 …）。

实现见 adapters/render（Playwright）；测试传返回罐装报告的 stub。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class RenderReport:
    ok: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class RenderVerifier(Protocol):
    async def verify(self, html: str) -> RenderReport:
        """在无头浏览器里渲染 HTML，返回结构/控制台/溢出等断言结果。"""
        ...
