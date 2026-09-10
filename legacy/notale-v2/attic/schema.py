"""互动讲义的 context schema。

一句话:harness 持有全部状态,模型持有零状态。

每一次模型调用都是 `view(state) -> structured output -> merge back into state`。
模型看不到 state,只看到 views.py 里投影出来的那一小块;它的产出必须是这里某个
类的实例,验证不过就重来,不做自由文本解析。

下面每个字段都对应一条实测过的失败,注释写的是「它挡住了什么」,不是「它是什么」。
"""

from __future__ import annotations

import hashlib
from typing import Literal

from pydantic import BaseModel, Field, model_validator

# =====================================================================
# 1. 不可变量 —— 整套讲义共享的那一份,规划结束后冻结
# =====================================================================


class Canvas(BaseModel):
    """逻辑画布。所有页尺寸完全一致,靠整体缩放铺满屏幕。"""

    w: int = 1600
    h: int = 900


class FontFloor(BaseModel):
    """字号地板。

    1600×900 在 1366 宽的笔记本上要乘 0.85,页面里写的 12px 落到屏幕上只剩 10px 出头。
    实测发现内容压不下时模型会**预先**把字号缩小,所以溢出检查完全看不见这个问题
    (0 个裁切元素,字号中位数 12.5px)。地板必须是硬约束,而不是事后 QA。

    分级按文本形态判定(见 tier 分类器),不接受页面自己声明属于哪一级 —— 声明会被绕。
    """

    tick: float = 12.0  # 只有数字和符号:坐标刻度、单位
    label: float = 14.0  # 控件标签、图例、图注、操作提示
    body: float = 16.0  # 正文、说明句
    line_height: float = 1.35  # 会折行的多行文本


class LibEntry(BaseModel):
    """预置库。版本必须写死在这里。

    压缩构建里往往查不到版本号,让模型去文件里翻是纯浪费(实测有 subagent 为此
    烧掉整轮调用)。所以版本是 context 提供的事实,不是模型去发现的事实。
    """

    file: str  # assets/lib/xxx.js
    globals: str  # 挂到 window 上的名字
    version: str
    use_for: str  # 按「要做的事」描述,不按「它是什么库」描述
    after: list[str] = Field(default_factory=list)  # 加载顺序依赖
    caveat: str | None = None  # 适用边界 / 已知的坑


class Chassis(BaseModel):
    """底盘:和主题无关、不写就一定出 bug 的那部分机制。

    只放机制,不放任何配色/字体/字号/间距/组件外观 —— 那些属于 StylePack。
    digest 用来在每轮实验开跑前做字节一致性校验:底盘被就地改过而没同步回上游,
    是跨轮对比失效的常见原因。
    """

    css_path: str
    js_path: str
    digest: str = ""  # sha256[:16],由 harness 填

    def stamp(self, css: bytes, js: bytes) -> "Chassis":
        h = hashlib.sha256(css + js).hexdigest()[:16]
        return self.model_copy(update={"digest": h})


class StylePack(BaseModel):
    """全套页面共用的视觉决策,规划阶段一次定死。

    跨页不一致(每页各自挑配色、各自定字阶)是实测里稳定复现的缺陷类。
    根因是每个 subagent 都在独立上下文里重新做了一遍同样的设计决策。
    把决策提到规划层、冻结、原样发给每一页,这个缺陷类就整体消失,
    不需要任何事后检查。
    """

    palette: dict[str, str]  # 语义名 -> hex,4~6 条
    display_font: str
    body_font: str
    mono_font: str | None = None
    type_scale: dict[str, float]  # 语义名 -> px
    spacing: list[int]  # 间距阶梯
    signature: str  # 这套讲义被记住的那一个视觉元素

    @model_validator(mode="after")
    def _scale_clears_floor(self) -> "StylePack":
        # 字阶本身就低于地板的话,后面每一页都注定违规。在规划期就拦住。
        bad = {k: v for k, v in self.type_scale.items() if v < FontFloor().tick}
        if bad:
            raise ValueError(f"字阶低于最低地板 {FontFloor().tick}px: {bad}")
        return self


class Invariant(BaseModel):
    """每个 page view 最前面那一段,**逐字节相同**。

    实测:14 份 brief 逐字写出来花了 4:04 墙钟(82 字符/秒),而其中绝大部分内容
    在每份里是一样的。相同前缀既省这段生成时间,也让 prompt cache 真正命中。

    注意这里**没有页数**。页数是晚绑定的:内容装不下就拆页,拆一次页如果会改动
    每份 brief 的前缀,缓存和已发出的任务就全废了。data-total 由 harness 在写
    骨架文件时盖章。
    """

    query: str
    minutes: int  # 这套讲义要撑起多长的一堂课
    audience: str
    canvas: Canvas = Canvas()
    floor: FontFloor = FontFloor()
    style: StylePack
    chassis: Chassis
    libs: list[LibEntry]
    env: dict[str, str] = Field(default_factory=dict)  # 已装好的运行时,省掉探测调用


# =====================================================================
# 2. 词汇表 —— 隔离条件下做跨页连贯的唯一手段
# =====================================================================


class Term(BaseModel):
    """一个跨页共享的符号 / 概念 / 约定。

    subagent 不许读别人的 page-*.html(那些文件正被并发写着,读到的是半成品),
    所以「第 7 页要沿用第 3 页的记号」不能靠去看第 3 页。改成:第 3 页 establishes
    这个 key,第 7 页 assumes 它,harness 把完整定义原样塞进第 7 页的 view。

    页面之间的连贯性因此变成一张可以在规划期静态校验的图,而不是运行期的祈祷。
    """

    key: str  # 稳定标识,只在 context 内部用
    name: str  # 呈现给读者的写法,必须逐页一致
    kind: Literal["notation", "concept", "unit", "convention"]
    definition: str  # 一句话,会被原样发给所有 assume 它的页
    unit: str | None = None


# =====================================================================
# 3. 规划产物
# =====================================================================


class Rejected(BaseModel):
    """考虑过并否决的形式。

    实测:强制写出否决理由的那一轮,页面形式明显跳出了「图表+滑块」的默认解。
    不写理由只列名字会退化成走过场,所以 why 是必填。
    """

    form: str
    why: str


class Computation(BaseModel):
    """这一页背后真正在跑的算法。

    每个交互背后有真实计算,是这套讲义的核心能力,不能退化成预录动画。
    这个字段让「是不是真算」成为规划期的显式承诺,也让 harness 能挑出
    method=none 却声称是模拟的页。
    """

    what: str  # 每帧 / 每次交互真正算的是什么
    method: Literal["closed_form", "iterative", "simulation", "search", "none"]
    lib: str | None = None  # 用预置库的话写文件名,手写就留空
    frame_budget_ms: float = 8.0

    @model_validator(mode="after")
    def _none_needs_reason(self) -> "Computation":
        if self.method == "none" and not self.what.strip():
            raise ValueError("method=none 时必须在 what 里写清这一页为什么不需要计算")
        return self


class TextBudget(BaseModel):
    """这一页允许承载的文本量,规划期定,构建期不许突破。

    「一页塞太多」这个问题在渲染层是不可见的 —— 模型会预先缩字号把它藏起来,
    溢出检查照样全绿。所以它必须在内容分配的那一刻就被限住:装不下就拆页,
    不许靠压字号压行高压间距塞进一页。

    这几个数用的是和字号地板同一套 tier 分类器,可以直接判定。
    """

    body_chars: int = 420  # 正文 + 说明句
    label_chars: int = 260  # 控件标签 + 图注 + 图例
    controls: int = 6  # 可操作控件数量


class PagePlan(BaseModel):
    """并行构建的单位。一个 subagent 拿到的全部内容。"""

    id: str  # page-01
    segment: str  # 所属 segment id
    role: Literal["hook", "build", "practice", "consolidate"]

    takeaway: str  # 读者离开这一页时应该带走的那一句
    beats: list[str] = Field(min_length=1)  # 这一页的内容拍子

    interaction: str  # 读者具体动手做什么,以及会看到什么变化
    rejected: list[Rejected] = Field(min_length=1)

    computation: Computation
    budget: TextBudget = TextBudget()
    libs: list[str] = Field(default_factory=list)  # 引用的 lib 文件名

    establishes: list[str] = Field(default_factory=list)  # Term.key
    assumes: list[str] = Field(default_factory=list)  # Term.key

    avoid: list[str] = Field(default_factory=list)  # 相邻页已经用过、这页别重复的形式


class Segment(BaseModel):
    """一个话题单元。页数由它的内容决定,不预设。

    schema 里任何地方都不接受「一共几页」作为输入 —— 一旦有这个入口,
    模型就会先定页数再往里填内容,而不是反过来。
    """

    id: str
    title: str
    goal: str  # 这一段要让读者获得什么
    minutes: int
    pages: list[PagePlan] = Field(default_factory=list)


# =====================================================================
# 4. 闸门产物
# =====================================================================


class Finding(BaseModel):
    gate: str  # mechanism / dead-code / font-floor / budget / render
    severity: Literal["block", "warn"]
    where: str  # 文件:行 或 选择器
    what: str
    fix_hint: str | None = None


class RenderReport(BaseModel):
    """无头浏览器按 1600×900 真渲染一遍的结果。只报告,不下判断。

    刻意不在这里给结论 —— 一旦它自带 verdict,字号地板就会从硬约束偷偷
    变成「渲染脚本认为可以」,判定标准就散到两个地方去了。
    """

    js_errors: list[str] = Field(default_factory=list)
    failed_resources: list[str] = Field(default_factory=list)
    escaped: list[str] = Field(default_factory=list)  # 超出画布的元素
    clipped: list[str] = Field(default_factory=list)  # 被 overflow 裁掉的元素
    font_min: float | None = None
    font_median: float | None = None
    shot: str | None = None


class PageVerdict(BaseModel):
    page: str
    findings: list[Finding] = Field(default_factory=list)
    render: RenderReport = RenderReport()
    attempt: int = 1

    @property
    def blocked(self) -> bool:
        return any(f.severity == "block" for f in self.findings)


# =====================================================================
# 5. 提交口 —— 模型唯一能往 Deck 里写东西的地方
# =====================================================================
#
# 这两个类的 .model_json_schema() 直接就是 wire.ToolDef.input_schema。
# 模型不写自由文本,只填 tool_use.input;填出来的东西验证不过就重来。
# 领域层因此不是从 Claude Code 的 schema 删减来的,但它挂在 tool_use 这个槽位上。


class PlanSubmission(BaseModel):
    """规划调用的产出。整份一起交,因为 term 图要整体才校验得了。"""

    terms: list[Term]
    segments: list[Segment]


class PageSubmission(BaseModel):
    """单页构建调用的产出。

    `needs_split` 是「装不下就拆页」那条约束的回流通道。没有这个口,
    模型面对装不下的内容只剩一条路:压字号压行高塞进去 —— 而那正是
    渲染层看不见的那个问题。
    """

    page: str
    status: Literal["ok", "needs_split"]
    note: str = ""  # needs_split 时写清哪一部分溢出、建议怎么切
    used_libs: list[str] = Field(default_factory=list)


# =====================================================================
# 6. 根
# =====================================================================


class Deck(BaseModel):
    """harness 独占的全部状态。模型永远拿不到这个对象。"""

    invariant: Invariant
    terms: dict[str, Term] = Field(default_factory=dict)
    segments: list[Segment] = Field(default_factory=list)
    verdicts: dict[str, PageVerdict] = Field(default_factory=dict)

    # 调用账本不放在这里。它是 trace.TraceRow 的 jsonl,字段名和 Claude Code
    # 逐字一致,lab/ 下现成的审计工具直接就能吃。Deck 只存一个路径。
    trace: str | None = None

    # ---- 派生量,任何地方都不许写入 ----

    @property
    def pages(self) -> list[PagePlan]:
        return [p for s in self.segments for p in s.pages]

    @property
    def total(self) -> int:
        """页数是算出来的,不是设定的。"""
        return len(self.pages)

    def page(self, pid: str) -> PagePlan:
        for p in self.pages:
            if p.id == pid:
                return p
        raise KeyError(pid)

    # ---- 规划期静态校验:下面每一条都在任何 token 花出去之前拦住 ----

    @model_validator(mode="after")
    def _check_plan(self) -> "Deck":
        ids = [p.id for p in self.pages]
        if len(set(ids)) != len(ids):
            raise ValueError(f"页 id 重复: {ids}")

        # 同一个 term 被两页 establish = 两页各自定义了同一个记号,
        # 这正是跨页不一致的源头,而且没人会读到对方去发现它。
        owner: dict[str, str] = {}
        for p in self.pages:
            for k in p.establishes:
                if k not in self.terms:
                    raise ValueError(f"{p.id} establish 了未登记的 term: {k}")
                if k in owner:
                    raise ValueError(f"term {k} 被 {owner[k]} 和 {p.id} 重复 establish")
                owner[k] = p.id

        # assume 的 term 必须由**更靠前**的页 establish。
        # 隔离约束下这是唯一的连贯性来源,所以图不通就等于讲义不通。
        order = {pid: i for i, pid in enumerate(ids)}
        for p in self.pages:
            for k in p.assumes:
                if k not in owner:
                    raise ValueError(f"{p.id} assume 了没有任何页 establish 的 term: {k}")
                if order[owner[k]] >= order[p.id]:
                    raise ValueError(
                        f"{p.id} assume 的 term {k} 由更靠后的 {owner[k]} 引入"
                    )

        # 声明用了预置库,库表里却没有 —— 版本和加载顺序就无从提供。
        known = {l.file for l in self.invariant.libs}
        for p in self.pages:
            for f in p.libs:
                if f not in known:
                    raise ValueError(f"{p.id} 引用了未登记的库: {f}")
        return self
