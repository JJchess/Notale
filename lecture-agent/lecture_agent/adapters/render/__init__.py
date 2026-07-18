"""render adapters：渲染验证。

- StructuralVerifier：无浏览器，复用 schema.validate_doc 出结构报告（默认，随时可用）。
- PlaywrightVerifier：真机无头渲染（需先把 reveal.js 运行时 vendored 进 assets/runtime/，见 PROJECT_STRUCTURE §6）。
"""

from .playwright_verifier import PlaywrightVerifier
from .structural import StructuralVerifier

__all__ = ["StructuralVerifier", "PlaywrightVerifier"]
