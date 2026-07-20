"""domain.generation —— 逐块生成 + 自修复（对应旧 delegate.mjs）+ 素材浓缩（material.mjs）。"""

from .blocks import BlockResult, generate_block
from .material import condense_material
from .notes import enrich_notes
from .widget import generate_widget, load_widget_guidelines

__all__ = [
    "BlockResult",
    "generate_block",
    "condense_material",
    "enrich_notes",
    "generate_widget",
    "load_widget_guidelines",
]
