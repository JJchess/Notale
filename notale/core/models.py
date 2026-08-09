"""内循环全部 artifact 的 schema —— methodology/pipeline-schema.html 的逐字段落地。

每个阶段只读上一层的落盘 artifact，上层是下层的唯一输入（层级链）。
枚举值用英文机器词 + 中文注释，落盘 JSON 与文档字段名一一对应。
"""

from __future__ import annotations

import re
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator
from notale.utils.config import get_config


_CONFIG = get_config()


# ---------------------------------------------------------------------------
# 枚举
# ---------------------------------------------------------------------------


class Intensity(str, Enum):
    SKIM = "skim"  # 速览
    STANDARD = "standard"  # 标准
    DEEP = "deep"  # 深挖


class Branch(str, Enum):
    """PREP §1 的唯一分叉：这条内容能不能被"造"出来。一条记录可多选。"""

    CONSTRUCTIBLE = "constructible"  # ① 可构造：有机械构造器（方程/算法/状态机…）
    CHECKABLE = "checkable"  # ② 不可构造但可核：事实断言，独立核对
    NEITHER = "neither"  # ③ 两者皆无：如实标注"未核实"


class ReferenceSource(str, Enum):
    """VERIFY-EXEC 参照物来源表，按可信度排序。前五个是外生参照物。"""

    CLOSED_FORM = "closed-form"  # 闭式解（最强·绝对）
    INDEPENDENT_IMPL = "independent-impl"  # 独立参考实现
    DECLARED_SPEC = "declared-spec"  # 声明的规格（契约回读）
    DOMAIN_LAW = "domain-law"  # 学科定律（守恒/量纲/极限，按系统类别挂）
    INVARIANCE = "invariance"  # 变换不变性（对称/单调）
    FINER_STEP = "finer-step"  # 自身·更细步长（补充，不能当唯一依据）
    PREVIOUS_RUN = "previous-run"  # 自身·上一次运行（补充）
    GENERIC_PAGE = "generic-page"  # 通用页面性质（补充）
    NONE = "none"  # 无——绑不到外生参照物 → 降级为静态图并标注


class PrepRecordOrigin(str, Enum):
    """Which pipeline stage authored a knowledge record."""

    RESEARCH = "research"
    PLANNER_GENERATED = "planner-generated"


EXOGENOUS_SOURCES = {
    ReferenceSource.CLOSED_FORM,
    ReferenceSource.INDEPENDENT_IMPL,
    ReferenceSource.DECLARED_SPEC,
    ReferenceSource.DOMAIN_LAW,
    ReferenceSource.INVARIANCE,
}


class PageStatus(str, Enum):
    """页状态机：pending → drafted → completed | degraded。"""

    PENDING = "pending"
    DRAFTED = "drafted"
    COMPLETED = "completed"
    DEGRADED = "degraded"

    @classmethod
    def _missing_(cls, value: object) -> "PageStatus | None":
        """Normalize statuses written by the retired outer verifier."""
        if value == "verified":
            return cls.COMPLETED
        if value == "returned-for-repair":
            return cls.DRAFTED
        return None


class PageType(str, Enum):
    FORMULA_DERIVATION = "formula-derivation"  # 公式推导
    SIM_EXPLORABLE = "sim-explorable"  # 仿真探索
    CODE_RUNNABLE = "code-runnable"  # 代码运行
    QUIZ_CHECK = "quiz-check"  # 测验
    WORKED_EXAMPLE = "worked-example"  # 例题
    SECTION_BREAK = "section-break"  # 章节页
    NARRATIVE_SCENE = "narrative-scene"  # 叙事场景


class NarrativeRelation(str, Enum):
    """A deliberate relationship between two pages in the deck-wide argument."""

    BUILDS_ON = "builds-on"
    CONTRASTS_WITH = "contrasts-with"
    RETURNS_TO = "returns-to"
    SETS_UP = "sets-up"
    SYNTHESIZES = "synthesizes"


# ---------------------------------------------------------------------------
# [0] Intake & Clarify
# ---------------------------------------------------------------------------


class CourseBrief(BaseModel):
    topic: str  # 课题
    audience: str  # 受众（年级/背景）
    priorKnowledge: str = ""  # 先验知识假设
    durationMin: int  # 课堂时长（分钟）
    requestedPageCount: int | None = Field(
        default=None, ge=1, le=_CONFIG.pipeline.maximum_page_count
    )  # 用户显式要求的页数
    intensity: Intensity = Intensity.STANDARD  # 强度档位
    language: str = "zh"  # 语言
    interactivityAsk: str = ""  # 对交互性的显式要求
    rawQuery: str  # 原始输入（可追溯）


# ---------------------------------------------------------------------------
# [1] Research fan-out
# ---------------------------------------------------------------------------


class ResearchNote(BaseModel):
    id: str
    sourceAgent: str  # 产出它的 agent：教学序列/例题反例/常见误解/素材
    rawContent: str
    provenanceLink: str = ""  # 指回原始检索调用


class Evidence(BaseModel):
    """出处——只能由 harness 从工具调用记录绑定（evidence.py），不是模型填的字段。"""

    url: str
    quotedSpan: str  # 原文片段，必须是抓回文档的字面子串（机器校验）
    fetchedAt: str  # 抓取时间（工具自动写入）


class PrepRecord(BaseModel):
    """Auditable knowledge supplied to page builders by the curriculum contract."""

    recordId: str  # 唯一 ID（同一知识点只存一份）
    origin: PrepRecordOrigin = PrepRecordOrigin.RESEARCH
    branch: list[Branch]  # ①②③ 可多选
    referenceSource: ReferenceSource = ReferenceSource.NONE  # 参照物来源
    content: dict[str, Any] = Field(default_factory=dict)  # 内容本体（结构随 branch 变化）
    invariants: list[str] = Field(default_factory=list)  # 自检条件（按系统类别挂）
    validRange: str = ""  # 有效参数区间与失效边界
    knownInaccuracies: list[str] = Field(default_factory=list)  # 主动声明的已知不准确处
    nonPhysicalVisualMappings: list[str] = Field(default_factory=list)  # 不对应物理单位的视觉量
    evidence: Evidence | None = None  # 出处（harness 绑定；无 = 未核实，如实标注）
    provenanceLink: str = ""  # 回指 research-note 或 planner contract worker


class PedagogyNote(BaseModel):
    """教法笔记——消费者是 planner，生成的是大纲不是页面（弱验收）。"""

    id: str
    type: Literal["sequence", "mechanism", "misconception"]  # 讲授顺序/教法机制/常见误解
    content: str
    evidence: Evidence | None = None
    consumer: str = "planner"  # 固定值


# ---------------------------------------------------------------------------
# [2] Curriculum Contract（单线程锁定 + 人在环确认）
# ---------------------------------------------------------------------------


class Chapter(BaseModel):
    title: str
    pageRange: tuple[int, int]  # [起页, 止页]，1-based 闭区间
    rationale: str = ""  # 回指 pedagogy-note 的依据
    pedagogyNoteIds: list[str] = Field(default_factory=list)
    narrativeGoal: str = ""  # 本章在整本讲义主线中的推进目标


class Outline(BaseModel):
    chapters: list[Chapter]
    throughline: str = ""  # 整本讲义贯穿始终的一句话叙事主线
    durationBudget: dict[str, int] = Field(default_factory=dict)  # {totalMin}
    confirmedAt: str = ""  # 人工确认时间（空 = 未确认）
    revisionNotes: str = ""  # 人工修改意见


class Globals(BaseModel):
    """全局隐含决策——只决定一次，只有 planner 能改。"""

    terminology: dict[str, str] = Field(default_factory=dict)  # 术语表 {术语: 定义}
    notation: dict[str, str] = Field(default_factory=dict)  # 符号约定 {符号: 含义}
    styleTokens: dict[str, str] = Field(default_factory=dict)  # 风格 token（配色/字体…）
    componentAPI: list[str] = Field(default_factory=list)  # 旧 run 兼容；不再交给 Builder
    artDirection: str = ""  # 视觉风格采样结果
    visualMotif: str = ""  # 跨页反复使用的视觉编码或构图母题


class ContinuityLink(BaseModel):
    pageId: str
    relation: NarrativeRelation
    cue: str


class PageSpec(BaseModel):
    pageId: str
    pageType: PageType
    centralMessage: str  # 唯一中心信息（CLT 硬约束）
    learningAction: str = ""  # 学生完成的认知动作，不是界面操作
    timeBudgetSec: int = _CONFIG.pipeline.default_page_time_budget_sec
    boundPrepRecords: list[str] = Field(default_factory=list)  # 计划绑定的 recordId（⊆ 资料库）
    narrativeRole: str = ""  # 本页怎样推进整本讲义的主线
    continuity: list[ContinuityLink] = Field(default_factory=list)


class BuilderPageBrief(BaseModel):
    id: str
    type: PageType
    claim: str
    learningAction: str = ""
    terminology: dict[str, str] = Field(default_factory=dict)
    notation: dict[str, str] = Field(default_factory=dict)


class NarrativeChapterContext(BaseModel):
    title: str = ""
    goal: str = ""


class BuilderNarrativeContext(BaseModel):
    throughline: str = ""
    chapter: NarrativeChapterContext = Field(default_factory=NarrativeChapterContext)
    pageRole: str = ""
    links: list[ContinuityLink] = Field(default_factory=list)


class VisualContract(BaseModel):
    direction: str = ""
    motif: str = ""
    tokens: dict[str, str] = Field(default_factory=dict)


class SourceGuardrails(BaseModel):
    invariants: list[str] = Field(default_factory=list)
    validRange: str = ""
    limitations: list[str] = Field(default_factory=list)
    visualMappings: list[str] = Field(default_factory=list)


class BuilderSource(BaseModel):
    id: str
    content: dict[str, Any] = Field(default_factory=dict)
    guardrails: SourceGuardrails = Field(default_factory=SourceGuardrails)
    citationUrl: str | None = None


class AssignedSkill(BaseModel):
    name: str
    entrypoint: str | None = None


class PageContext(BaseModel):
    """Builder-only projection; full planning and evidence artifacts stay outside it."""

    page: BuilderPageBrief
    narrative: BuilderNarrativeContext
    visualContract: VisualContract
    sources: list[BuilderSource] = Field(default_factory=list)
    skills: list[AssignedSkill] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_skill_manifest(self) -> "PageContext":
        names = [skill.name for skill in self.skills]
        if len(names) != len(set(names)):
            raise ValueError("skills contains duplicate names")
        invalid_names = sorted(
            name for name in names
            if re.fullmatch(r"[a-z0-9][a-z0-9-]*", name) is None
        )
        if invalid_names:
            raise ValueError(f"skills contains invalid names: {invalid_names}")
        invalid = sorted(
            skill.entrypoint
            for skill in self.skills
            if skill.entrypoint is not None
            and re.fullmatch(r"[a-z0-9][a-z0-9-]*", skill.entrypoint) is None
        )
        if invalid:
            raise ValueError(f"skills contains invalid entrypoints: {invalid}")
        return self

    @property
    def source_ids(self) -> set[str]:
        return {source.id for source in self.sources}

    @property
    def skill_names(self) -> list[str]:
        return [skill.name for skill in self.skills]

    @property
    def skill_entrypoints(self) -> dict[str, str]:
        return {
            skill.name: skill.entrypoint
            for skill in self.skills
            if skill.entrypoint is not None
        }


# ---------------------------------------------------------------------------
# [3] Per-page fan-out
# ---------------------------------------------------------------------------


class PageArtifact(BaseModel):
    pageId: str
    designSpec: dict[str, Any] = Field(default_factory=dict)  # 版面设计规格
    html: str  # Builder 生成的自包含 HTML-native 页面片段
    boundReferences: list[str] = Field(default_factory=list)  # 实际使用的 recordId
    speakerNotes: str = ""  # 讲稿素材（多形态输出的同源内容层）
    status: PageStatus = PageStatus.DRAFTED


# ---------------------------------------------------------------------------
# Agent runtime governance (run-local, checkpointed per worker)
# ---------------------------------------------------------------------------


class AgentTaskStep(BaseModel):
    id: str
    description: str
    status: Literal["pending", "in_progress", "completed", "blocked"] = "pending"
    evidence: str = ""
    updatedAt: str = ""


class AgentTaskState(BaseModel):
    workerId: str
    role: str
    objective: str
    acceptanceCriteria: list[str] = Field(default_factory=list)
    steps: list[AgentTaskStep] = Field(default_factory=list)
    status: Literal[
        "pending", "in_progress", "completed", "blocked", "stalled", "failed"
    ] = "pending"
    submittedArtifact: str = ""
    totalTurns: int = 0
    elapsedSec: float = 0.0
    startedAt: str = ""
    updatedAt: str = ""


class AgentCheckpoint(BaseModel):
    workerId: str
    role: str
    roleVersion: str
    checkpointId: str
    messages: list[dict[str, Any]] = Field(default_factory=list)
    usage: dict[str, int] = Field(default_factory=dict)
    toolMetadata: dict[str, Any] = Field(default_factory=dict)
    totalTurns: int = 0
    compactCount: int = 0
    progressSnapshot: dict[str, Any] = Field(default_factory=dict)
    lastProgressTurn: int = 0
    noProgressTurns: int = 0
    proseOnlyTurns: int = 0
    lastToolErrorSignature: str = ""
    repeatedToolErrorCount: int = 0
    lastValidationSignature: str = ""
    repeatedValidationErrorCount: int = 0
    stalledReason: str = ""
    updatedAt: str


# ---------------------------------------------------------------------------
# [4] Assemble & Global pass
# ---------------------------------------------------------------------------


class AssembledDeck(BaseModel):
    pages: list[str]  # 拼装后的页序列（pageId 有序）
    totalDurationEstimate: int = 0  # 总讲授时长估计（秒，成品实际值）
    path: str = ""  # deck.html 落盘路径
    format: str = "reveal-html-native"
    runtimeVersion: str = "reveal-v4"


class ConsistencyReport(BaseModel):
    terminologyConsistent: bool | None = None  # None = 未实现，如实标注
    notationConsistent: bool | None = None
    difficultyProgression: bool | None = None
    duplicateContentFlags: list[str] = Field(default_factory=list)  # 近重复页对
    dirtyPages: list[str] = Field(default_factory=list)  # globals 变更后待重跑的页
    planCoverage: list[str] = Field(default_factory=list)  # 未被任何页认领的章节


class QualityReport(BaseModel):
    """Run-level delivery summary; it makes no semantic-correctness claim."""

    deck: str = ""  # 互动讲义路径
    completedPages: list[str] = Field(default_factory=list)
    degradedPages: list[str] = Field(default_factory=list)
    note: str = ""
