"""枚举单一真相源（L0 kernel）。

全系统的数据 id 清单只在这里声明一次；schema 模型、渲染、教学散文都引它。
对应旧 `demo/schema/enums.mjs`（iter73 解耦）。命名遵循 NAMING.md（朴素小写英文 id）。
加一个枚举值：改这里 → 落 schema 模型 → 落渲染分支 → 测试守卫。
"""

from __future__ import annotations

from enum import StrEnum


class SceneKind(StrEnum):
    HERO = "hero"
    CONTENT = "content"
    QUIZ = "quiz"
    STATEMENT = "statement"
    SECTION = "section"


class LayoutKind(StrEnum):
    FLOW = "flow"
    INDEX = "index"
    SPLIT = "split"
    COMPOSE = "compose"
    FULL = "full"


class BlockType(StrEnum):
    HERO = "hero"
    STATEMENT = "statement"
    LIST = "list"
    AGENDA = "agenda"
    CALLOUT = "callout"
    TIMELINE = "timeline"
    FORMULA = "formula"
    FLOW = "flow"
    TABLE = "table"
    CODE = "code"
    COMPARE = "compare"
    GRID = "grid"
    QUIZ = "quiz"
    SIM = "sim"
    CHART = "chart"
    STATS = "stats"
    DIAGRAM = "diagram"
    GRAPH = "graph"
    RUNNABLE = "runnable"
    EMBED = "embed"
    FREEFORM = "freeform"
    PULLQUOTE = "pullquote"
    VIDEO = "video"


class SimEngine(StrEnum):
    DYNAMICS1D = "dynamics1d"
    SEARCH_COMPARE = "searchCompare"
    CUSTOM = "custom"
    WIDGET = "widget"


class Theme(StrEnum):
    CARTESIAN = "cartesian"
    COBALT_GRID = "cobalt-grid"
    LAB = "lab"
    SLATE = "slate"
    # 扩展主题库（移植自 bold-template-pack；每个在 viewer/index.html 有同名 [data-theme] token 块）
    SOFT_EDITORIAL = "soft-editorial"
    VELLUM = "vellum"
    GROVE = "grove"
    MONOCHROME = "monochrome"
    SIGNAL = "signal"
    BROADSIDE = "broadside"
    EMERALD_EDITORIAL = "emerald-editorial"
    EDITORIAL_FOREST = "editorial-forest"
    BOLD_POSTER = "bold-poster"
    CORAL = "coral"
    STUDIO = "studio"


# 供守卫/测试做集合相等断言（对齐旧 check-consistency Check C′）。
SCENE_KINDS: frozenset[str] = frozenset(SceneKind)
LAYOUT_KINDS: frozenset[str] = frozenset(LayoutKind)
BLOCK_TYPES: frozenset[str] = frozenset(BlockType)
SIM_ENGINES: frozenset[str] = frozenset(SimEngine)
THEMES: frozenset[str] = frozenset(Theme)
