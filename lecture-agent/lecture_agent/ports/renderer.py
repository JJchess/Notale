"""RenderVerifier 接缝：真机渲染验证（0 console error / 无溢出 / 字体加载 …）。

两个实现：
  - adapters/render/structural.py  纯 schema 校验，无浏览器（离线/CI 兜底）
  - adapters/render/headless.py    真机无头 Edge/Chrome，驱动 tools/render-check.mjs

约定：`verify` 的入参是 **LectureDoc 的 JSON 文本**（不是 HTML —— 渲染由 viewer 负责，
上游只交出数据）。参数名 `html` 是历史遗留，含义以本注释为准。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class RenderReport:
    ok: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    # 逐页量化指标（仅真机 verifier 填）：[{page, overflowY, overflowX, layoutClip}, …]
    # 有了「哪几页、超多少」才能定点回炉拆页，而不是笼统重来。
    overflow_pages: list[dict[str, Any]] = field(default_factory=list)
    # 逐页损坏标记（undefined / NaN / [object Object]），插值 bug 的信号
    corrupt_pages: list[dict[str, Any]] = field(default_factory=list)
    # 浏览器逐页实测（溢出、动态初始化、图表宽度利用、widget 高度、最小正文字号等）
    page_metrics: list[dict[str, Any]] = field(default_factory=list)
    shots: list[str] = field(default_factory=list)   # --shot 产出的 PNG 路径

    @property
    def overflow_indices(self) -> list[int]:
        return [int(p["page"]) for p in self.overflow_pages]


class RenderVerifier(Protocol):
    async def verify(self, html: str) -> RenderReport:
        """渲染 LectureDoc（JSON 文本）并返回结构/控制台/溢出等断言结果。"""
        ...
