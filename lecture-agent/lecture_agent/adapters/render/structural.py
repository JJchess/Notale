"""StructuralVerifier —— 无浏览器的结构验证，实现 ports.RenderVerifier。

复用 schema.validate_doc（结构+语义）做"渲染前"结构断言。它不是真机渲染，抓不到版面溢出——
要真机断言请用同目录的 HeadlessVerifier。本实现的价值是零外部依赖，离线/无浏览器环境的兜底。
输入是 LectureDoc 的 JSON 字符串。
"""

from __future__ import annotations

import json

from ...ports.renderer import RenderReport
from ...schema.validate import validate_doc


class StructuralVerifier:
    async def verify(self, html: str) -> RenderReport:
        """html 参数在此实为 LectureDoc 的 JSON 文本（无浏览器时的约定）。"""
        try:
            doc = json.loads(html)
        except json.JSONDecodeError as e:
            return RenderReport(ok=False, errors=[f"JSON 解析失败: {e}"])
        res = validate_doc(doc)
        return RenderReport(ok=not res.errors, errors=res.errors, warnings=res.warnings)
