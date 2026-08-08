"""内循环全部 artifact 的 schema —— methodology/pipeline-schema.html 的逐字段落地。

每个阶段只读上一层的落盘 artifact，上层是下层的唯一输入（层级链）。
枚举值用英文机器词 + 中文注释，落盘 JSON 与文档字段名一一对应。
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


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


EXOGENOUS_SOURCES = {
    ReferenceSource.CLOSED_FORM,
    ReferenceSource.INDEPENDENT_IMPL,
    ReferenceSource.DECLARED_SPEC,
    ReferenceSource.DOMAIN_LAW,
    ReferenceSource.INVARIANCE,
}


class PageStatus(str, Enum):
    """页状态机（HARNESS P4）：pending→drafted→verified | returned-for-repair→degraded。"""

    PENDING = "pending"
    DRAFTED = "drafted"
    VERIFIED = "verified"
    RETURNED_FOR_REPAIR = "returned-for-repair"
    DEGRADED = "degraded"


class VerifyStatus(str, Enum):
    VERIFIED = "verified"
    RETURNED_FOR_REPAIR = "returned-for-repair"
    DEGRADED = "degraded"


class PageType(str, Enum):
    FORMULA_DERIVATION = "formula-derivation"  # 公式推导
    SIM_EXPLORABLE = "sim-explorable"  # 仿真探索
    CODE_RUNNABLE = "code-runnable"  # 代码运行
    QUIZ_CHECK = "quiz-check"  # 测验
    WORKED_EXAMPLE = "worked-example"  # 例题
    SECTION_BREAK = "section-break"  # 章节页
    NARRATIVE_SCENE = "narrative-scene"  # 叙事场景


# ---------------------------------------------------------------------------
# [0] Intake & Clarify
# ---------------------------------------------------------------------------


class CourseBrief(BaseModel):
    topic: str  # 课题
    audience: str  # 受众（年级/背景）
    priorKnowledge: str = ""  # 先验知识假设
    durationMin: int  # 课堂时长（分钟）
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
    """备课资料条目——唯一的知识来源。页面上的东西在这里找不到出处 = 编的。"""

    recordId: str  # 唯一 ID（同一知识点只存一份）
    branch: list[Branch]  # ①②③ 可多选
    referenceSource: ReferenceSource = ReferenceSource.NONE  # 参照物来源
    content: dict[str, Any] = Field(default_factory=dict)  # 内容本体（结构随 branch 变化）
    invariants: list[str] = Field(default_factory=list)  # 自检条件（按系统类别挂）
    validRange: str = ""  # 有效参数区间与失效边界
    knownInaccuracies: list[str] = Field(default_factory=list)  # 主动声明的已知不准确处
    nonPhysicalVisualMappings: list[str] = Field(default_factory=list)  # 不对应物理单位的视觉量
    evidence: Evidence | None = None  # 出处（harness 绑定；无 = 未核实，如实标注）
    provenanceLink: str = ""  # 回指 research-note


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


class Outline(BaseModel):
    chapters: list[Chapter]
    durationBudget: dict[str, int] = Field(default_factory=dict)  # {totalMin}
    confirmedAt: str = ""  # 人工确认时间（空 = 未确认）
    revisionNotes: str = ""  # 人工修改意见


class Globals(BaseModel):
    """全局隐含决策——只决定一次，只有 planner 能改。"""

    terminology: dict[str, str] = Field(default_factory=dict)  # 术语表 {术语: 定义}
    notation: dict[str, str] = Field(default_factory=dict)  # 符号约定 {符号: 含义}
    styleTokens: dict[str, str] = Field(default_factory=dict)  # 风格 token（配色/字体…）
    componentAPI: list[str] = Field(default_factory=list)  # 批准使用的组件清单
    artDirection: str = ""  # 视觉风格采样结果


class PageSpec(BaseModel):
    pageId: str
    pageType: PageType
    centralMessage: str  # 唯一中心信息（CLT 硬约束）
    learningAction: str = ""  # 学习动作
    visualSubject: str = ""  # 视觉主体（学生第一眼看什么）
    timeBudgetSec: int = 90  # 时间预算（秒）
    boundPrepRecords: list[str] = Field(default_factory=list)  # 计划绑定的 recordId（⊆ 资料库）


class PageContext(BaseModel):
    """上下文编译器产物：每个 worker 的最小上下文，不多不少。"""

    pageSpec: PageSpec
    globals: Globals
    neighborSummary: dict[str, str] = Field(default_factory=dict)  # {prev, next}
    coveredConcepts: list[str] = Field(default_factory=list)  # 已覆盖概念
    relevantPrepRecords: list[PrepRecord] = Field(default_factory=list)  # 绑定资料全文
    availableSkills: list[str] = Field(default_factory=list)  # 按需加载的 skill


# ---------------------------------------------------------------------------
# [3] Per-page fan-out
# ---------------------------------------------------------------------------


class PageArtifact(BaseModel):
    pageId: str
    designSpec: dict[str, Any] = Field(default_factory=dict)  # 版面设计规格
    html: str  # 实现产物（自包含片段；组件库接管前由 builder 直写）
    interactionParams: dict[str, Any] = Field(default_factory=dict)  # 对绑定组件模板的参数取值
    boundReferences: list[str] = Field(default_factory=list)  # 实际使用的 recordId
    speakerNotes: str = ""  # 讲稿素材（多形态输出的同源内容层）
    status: PageStatus = PageStatus.DRAFTED


# ---------------------------------------------------------------------------
# [4] Verifier 栈
# ---------------------------------------------------------------------------


class LayerResult(BaseModel):
    layer: str  # L0..L6
    implemented: bool  # False = 未实现，如实标注（fail-closed：不算过，也不算跑过）
    passed: bool = False
    failures: list[str] = Field(default_factory=list)  # 失败断言
    note: str = ""


class ReferenceComparison(BaseModel):
    recordId: str
    referenceSource: ReferenceSource
    result: str  # pass / fail / not-implemented
    margin: str = ""


class VerificationReport(BaseModel):
    pageId: str
    layers: list[LayerResult] = Field(default_factory=list)
    referenceComparison: list[ReferenceComparison] = Field(default_factory=list)
    status: VerifyStatus
    # 仅 status=returned-for-repair
    newFailure: list[str] = Field(default_factory=list)  # 本轮新增失败断言
    ledgerRef: str = ""  # 指向 counterexample-ledger
    # 仅 status=degraded
    fallbackHtml: str = ""
    reason: str = ""
    humanReviewQueue: bool = False


class LedgerEntry(BaseModel):
    attemptNo: int
    failedAssertion: list[str] = Field(default_factory=list)
    referenceMismatch: list[str] = Field(default_factory=list)
    timestamp: str


class CounterexampleLedger(BaseModel):
    """反例台账——跨轮次只增不减。返工不是重试：带全部历史反例重生成。"""

    pageId: str
    entries: list[LedgerEntry] = Field(default_factory=list)  # 只追加
    attemptCount: int = 0

    @property
    def activeConstraints(self) -> list[str]:
        """全部历史反例——下一轮生成的强约束输入。"""
        out: list[str] = []
        for e in self.entries:
            out.extend(e.failedAssertion)
            out.extend(e.referenceMismatch)
        return out


# ---------------------------------------------------------------------------
# [5] Assemble & Global pass
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


# ---------------------------------------------------------------------------
# [6] Reflect & Accrete
# ---------------------------------------------------------------------------


class LibraryDelta(BaseModel):
    newComponents: list[str] = Field(default_factory=list)  # 新入库的已验证组件
    pitfallEntries: list[str] = Field(default_factory=list)  # 新发现的坑（工程向）
    misconceptionEntries: list[str] = Field(default_factory=list)  # 新增常见误解（内容向）


class QualityReport(BaseModel):
    """最终交付——达标是证明不是声称。未跑的检查如实列出，不冒充已核实。"""

    deck: str = ""  # 互动讲义路径
    script: str | None = None  # 讲稿（未实现=None）
    exercises: str | None = None  # 习题（未实现=None）
    mindMap: str | None = None  # 知识导图（未实现=None）
    canaryLeakageSummary: str | None = None  # 掺沙漏检率（掺沙库未建=None）
    unimplementedLayers: list[str] = Field(default_factory=list)  # 未实现的验证层
    verifiedPages: list[str] = Field(default_factory=list)
    degradedPages: list[str] = Field(default_factory=list)
    note: str = ""
