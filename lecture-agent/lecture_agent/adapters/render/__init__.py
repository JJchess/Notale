"""render adapters：渲染验证。

- StructuralVerifier：无浏览器，复用 schema.validate_doc 出结构报告（默认，随时可用）。

（真机无头渲染的 PlaywrightVerifier 曾在此，运行时无处注入、且依赖缺失的 assets/runtime/，已作为死代码删除；
真要浏览器验证时再按当年接缝加回，并在 configs 里用 _target_ 注入。）
"""

from .structural import StructuralVerifier

__all__ = ["StructuralVerifier"]
