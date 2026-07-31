"""LectureDoc 数据契约（L0 kernel）—— pydantic 版，对应旧 `demo/schema` 的结构层。

设计哲学「schema 即接口」：agent 只产出经 `LectureDoc.model_validate()` 通过的对象，绝不手写 HTML。
本模块只管**结构/类型/枚举/长度**等声明式约束；受限表达式白名单、HTML 安全、跨场景规则等
**语义**校验在 `validate.py`（两层分工，见 PROJECT_STRUCTURE §2）。

块上普遍可带可选视觉字段（id/status/fragment/titleSize/accentRule…），故 Block 允许 extra，
以容忍真实语料而不过度约束；未知 `type` 仍会被判别联合拒绝。
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .enums import Theme

# ------------------------------------------------------------------ 基类


class _Block(BaseModel):
    model_config = ConfigDict(extra="allow")  # 容忍 id/status/fragment/视觉字段
    id: str | None = None
    status: Literal["ready", "pending", "error"] | None = None
    # bool(朴素淡入)或 reveal fragment 类型名(fade-up/highlight-red/grow/...)
    fragment: bool | str | None = None


# ------------------------------------------------------------------ 叶子块


class HeroBlock(_Block):
    type: Literal["hero"]
    title: list[str] = Field(min_length=1, max_length=3)
    tag: str | None = None
    sub: str | None = None
    facts: str | None = None
    hint: str | None = None
    image: str | None = None  # data: URI（离线红线，禁远程 URL——由 validate.py 语义层拦）


class StatementBlock(_Block):
    type: Literal["statement"]
    statement: str


class PullquoteBlock(_Block):
    type: Literal["pullquote"]
    text: str
    cite: str | None = None


class VideoBlock(_Block):
    type: Literal["video"]
    src: str | None = None
    poster: str | None = None
    captions: str | None = None
    caption: str | None = None
    loop: bool | None = None

    @model_validator(mode="after")
    def _src_or_poster(self) -> VideoBlock:
        if not self.src and not self.poster:
            raise ValueError("video 至少需 src 或 poster")
        return self


class ListItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    lead: str | None = None  # 可选：条目粗体小标题，渲染成强调色小字块（给长列表一层可扫读层级）
    text: str
    icon: str | None = None  # 本地图标 id，见 viewer/vendor/icons/icons.json


class ListBlock(_Block):
    type: Literal["list"]
    items: list[ListItem] = Field(min_length=1, max_length=12)


class AgendaRow(BaseModel):
    model_config = ConfigDict(extra="allow")
    label: str
    text: str


class AgendaBlock(_Block):
    type: Literal["agenda"]
    rows: list[AgendaRow] = Field(min_length=1, max_length=12)


class CalloutBlock(_Block):
    type: Literal["callout"]
    label: str
    text: str


class TimelineEvent(BaseModel):
    model_config = ConfigDict(extra="allow")
    time: str
    title: str
    desc: str | None = None


class TimelineBlock(_Block):
    type: Literal["timeline"]
    events: list[TimelineEvent] = Field(min_length=2, max_length=8)


class FormulaBlock(_Block):
    type: Literal["formula"]
    latex: str  # 纯 LaTeX，不含 $（$ 配对检查在 validate.py）


class FlowNode(BaseModel):
    model_config = ConfigDict(extra="allow")
    title: str
    sub: str | None = None
    state: Literal["on", "q"] | None = None


class FlowBlock(_Block):
    type: Literal["flow"]
    nodes: list[FlowNode] = Field(min_length=2, max_length=7)


class TableBlock(_Block):
    type: Literal["table"]
    head: list[str] = Field(min_length=2)
    rows: list[list[Any]] = Field(min_length=1)


# ---- chart（bar/line/area 走 categories+series；scatter 走 points）


class ChartSeries(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str
    values: list[float] = Field(min_length=1)


class ChartPoint(BaseModel):
    model_config = ConfigDict(extra="allow")
    x: float
    y: float
    label: str | None = None


class ChartBlock(_Block):
    type: Literal["chart"]
    chartType: Literal["bar", "line", "area", "scatter"]
    categories: list[str] | None = None
    series: list[ChartSeries] | None = None
    points: list[ChartPoint] | None = None
    xLabel: str | None = None
    yLabel: str | None = None
    caption: str | None = None

    @model_validator(mode="after")
    def _shape_by_type(self) -> ChartBlock:
        if self.chartType == "scatter":
            if not self.points or len(self.points) < 2:
                raise ValueError("scatter 需 points（≥2）")
        else:
            if not self.categories or not self.series:
                raise ValueError(f"{self.chartType} 需 categories + series")
            for s in self.series:
                if len(s.values) != len(self.categories):
                    raise ValueError(f"series「{s.name}」values 长度需与 categories 一致")
        return self


class CodeBlock(_Block):
    type: Literal["code"]
    language: Literal["python", "javascript", "text"]
    source: str


class EmbedBlock(_Block):
    type: Literal["embed"]
    product: Literal["codelab", "video", "sim"]


class FreeformBlock(_Block):
    type: Literal["freeform"]
    html: str = Field(min_length=1)
    rationale: str = Field(min_length=10)  # 需具体说明现有类型为何不适用


# ---- quiz


class QuizChoice(BaseModel):
    model_config = ConfigDict(extra="allow")
    key: str = Field(pattern=r"^[a-z]$")
    text: str


class QuizBlock(_Block):
    type: Literal["quiz"]
    kind: Literal["objective", "subjective"]
    choices: list[QuizChoice] | None = Field(default=None, min_length=2, max_length=6)
    answer: str | None = None
    explain: str | None = None
    prompt: str | None = None

    @model_validator(mode="after")
    def _by_kind(self) -> QuizBlock:
        if self.kind == "objective":
            if not self.choices:
                raise ValueError("objective quiz 需 choices（2–6）")
            keys = [c.key for c in self.choices]
            if len(keys) != len(set(keys)):
                raise ValueError("选项 key 重复")
            if self.answer is None or self.answer not in keys:
                raise ValueError("answer 必须是某个选项 key")
            if not self.explain:
                raise ValueError("objective quiz 需 explain")
        else:
            if not self.prompt:
                raise ValueError("subjective quiz 需 prompt")
        return self


# ---- sim（结构层：engine + 松散字段；深层 per-engine 表达式检查在 validate.py）


class SimParam(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str = Field(pattern=r"^[a-zA-Z_][a-zA-Z0-9_]*$")
    label: str
    min: float
    max: float
    step: float
    default: float

    @model_validator(mode="after")
    def _default_in_range(self) -> SimParam:
        if not (self.min <= self.default <= self.max):
            raise ValueError(f"default {self.default} 不在 [{self.min},{self.max}]")
        return self


class SimBlock(_Block):
    model_config = ConfigDict(extra="allow")
    type: Literal["sim"]
    engine: Literal["dynamics1d", "searchCompare", "custom", "widget"]
    params: list[SimParam] | None = Field(default=None, min_length=1, max_length=4)
    # 各引擎特有字段（model/regimes/html/computeJs/chart…）由 extra 承接，validate.py 深查。

    @model_validator(mode="after")
    def _params_required(self) -> SimBlock:
        if self.engine != "widget" and self.params is None:
            raise ValueError(f"引擎 {self.engine} 需 params")
        return self


# ---- runnable


class RunnableEnv(BaseModel):
    model_config = ConfigDict(extra="allow")
    kind: Literal["objective1d", "custom"]


class RunnableBlock(_Block):
    model_config = ConfigDict(extra="allow")
    type: Literal["runnable"]
    languages: list[Literal["python", "js"]] = Field(min_length=1)
    starter: dict[str, str]
    env: RunnableEnv

    @model_validator(mode="after")
    def _starter_covers_langs(self) -> RunnableBlock:
        for lang in self.languages:
            if lang not in self.starter:
                raise ValueError(f"starter 缺少语言 {lang} 的初始代码")
        return self


# ---- stats（KPI 数字卡）


class StatItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    value: str
    label: str
    delta: str | None = None  # 如 "+12%"，可选涨跌注解


class StatsBlock(_Block):
    type: Literal["stats"]
    items: list[StatItem] = Field(min_length=2, max_length=6)


# ---- diagram（序列/关系图示，7 种 diagramType 共用一个渲染分派，仿 sim.engine/chart.chartType）


class DiagramNode(BaseModel):
    model_config = ConfigDict(extra="allow")
    title: str
    sub: str | None = None


class DiagramBlock(_Block):
    type: Literal["diagram"]
    diagramType: Literal[
        "cycle", "pyramid", "staircase", "snake", "arrow-seq", "circular-grid", "connected-circles"
    ]
    nodes: list[DiagramNode] = Field(min_length=2, max_length=8)


class GraphNode(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,24}$")
    title: str
    sub: str | None = None
    state: Literal["on", "q"] | None = None
    shape: Literal["box", "round", "diamond"] | None = None


class GraphEdge(BaseModel):
    model_config = ConfigDict(extra="allow")
    from_: str = Field(alias="from")   # from 是 Python 关键字，用 alias 映射
    to: str
    label: str | None = Field(default=None, max_length=12)
    style: Literal["solid", "dashed"] | None = None


class GraphBlock(_Block):
    """带命名边的一等图块：树 / DAG / 分支流程。

    与 diagram/flow 的根本区别是它有 edges——那两者只能表达一条线性链或一圈环，
    一棵带父子关系的真实树在它们里不可表达。图论完整性（断边/环/tree 单父）见 validate.py。
    """

    type: Literal["graph"]
    graphType: Literal["tree", "dag", "flowchart"]
    orientation: Literal["vertical", "horizontal"] | None = None
    nodes: list[GraphNode] = Field(min_length=2, max_length=14)
    edges: list[GraphEdge] = Field(min_length=1, max_length=24)
    caption: str | None = None


# ---- 容器块（递归引用 Block）


class CompareSide(BaseModel):
    model_config = ConfigDict(extra="allow")
    caption: str | None = None
    block: Block


class CompareBlock(_Block):
    type: Literal["compare"]
    left: CompareSide
    right: CompareSide


class GridItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    block: Block
    span: int | None = Field(default=None, ge=1, le=4)


class GridBlock(_Block):
    type: Literal["grid"]
    columns: int = Field(ge=2, le=4)
    items: list[GridItem] = Field(min_length=2, max_length=8)


# ------------------------------------------------------------------ 判别联合

Block = Annotated[
    HeroBlock
    | StatementBlock
    | PullquoteBlock
    | VideoBlock
    | ListBlock
    | AgendaBlock
    | CalloutBlock
    | TimelineBlock
    | FormulaBlock
    | FlowBlock
    | TableBlock
    | ChartBlock
    | StatsBlock
    | DiagramBlock
    | GraphBlock
    | CodeBlock
    | CompareBlock
    | GridBlock
    | QuizBlock
    | SimBlock
    | RunnableBlock
    | EmbedBlock
    | FreeformBlock,
    Field(discriminator="type"),
]


# ------------------------------------------------------------------ scene / doc


class Layout(BaseModel):
    model_config = ConfigDict(extra="allow")  # kind/steps/anchor/areas/centered/gap…
    kind: Literal["flow", "index", "split", "compose", "full"] | None = None


class Scene(BaseModel):
    model_config = ConfigDict(extra="allow")  # decor/layout 视觉字段
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]*$")
    kind: Literal["hero", "content", "quiz", "statement", "section"]
    notes: str = Field(min_length=1)  # 演讲者备注必填
    eyebrow: str | None = None
    headline: str | None = None
    lead: str | None = None
    layout: Layout | None = None
    transition: str | None = None  # reveal 单页 data-transition（如 "zoom"/"convex"/"none"）
    autoAnimate: bool | None = None  # 与相邻页配对+复用相同 block id 时触发 reveal auto-animate morph
    blocks: list[Block] = Field(min_length=1)


class TutorKb(BaseModel):
    model_config = ConfigDict(extra="allow")
    pattern: str
    answer: str
    flags: str | None = None


class Tutor(BaseModel):
    model_config = ConfigDict(extra="allow")
    suggestions: list[str] | None = None
    kb: list[TutorKb] | None = None


class LectureDoc(BaseModel):
    model_config = ConfigDict(extra="allow")  # subtitle/audience/decor 等可选
    schemaVersion: Literal["1.0"]
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]*$")
    title: str = Field(min_length=1)
    language: str
    theme: Theme | None = None
    tutor: Tutor | None = None
    scenes: list[Scene] = Field(min_length=1)


# 解析递归前向引用
CompareSide.model_rebuild()
GridItem.model_rebuild()
