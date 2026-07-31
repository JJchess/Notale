"""render adapters：渲染验证。

- StructuralVerifier：无浏览器，复用 schema.validate_doc 出结构报告（离线/CI 兜底）。
- HeadlessVerifier：真机无头 Edge/Chrome，驱动 tools/render-check.mjs 逐页断言
  溢出/console/字体/版式裁切，并可 --shot 截图。零依赖（不引 playwright/puppeteer）。
"""

from .headless import HeadlessVerifier
from .structural import StructuralVerifier

__all__ = ["StructuralVerifier", "HeadlessVerifier"]
