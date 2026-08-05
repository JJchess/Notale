"""内容规划（移植自 Stanford STORM 的 pre-writing：多视角提问 → 覆盖清单 → 综合骨架）。

对应旧 src/plan.mjs。省略了 UI-only 的流式增量抽取（makePlanPump）；正确性由流末 parse_json 保证，
这里用原子调用。只依赖 ports.LLMClient。来源: github.com/stanford-oval/storm。
"""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass, field
from typing import Any

from ..ports.llm import LLMClient, Message
from ..utils.concurrency import pool
from ..utils.jsonio import parse_json

_HIER_THRESHOLD = 12  # 13+ 页走分层规划；15 页单骨架在 live 模型上会反复撞超时
# The live DeepSeek profiles intentionally allow 600 s for long lecture skeletons. Keeping a
# shorter domain timeout silently cancelled valid 15-page plans before the provider deadline.
_PLAN_CALL_TIMEOUT_S = 600.0
_SIM_CAPABILITIES = {"sim", "state-sim", "model-sim", "geometry-sim"}

_PERSPECTIVE_SCHEMA = (
    '{ "perspectives": [ { "name":"视角名(如 重直觉的入门讲法 / 重推导的理论派 / 重工程实践 / 爱追问的学生)", '
    '"focus":"这个视角最在意什么(一句)", "mustCover":["必须讲到的要点"], "questions":["常见疑问/误区"] } ], '
    '"knowledgeForms":["dynamic-process|executable-artifact|quantitative-model|spatial-constraint|relational-structure|observational-evidence"] }'
)


@dataclass
class PlanResult:
    doc: dict[str, Any]
    perspectives: list[dict[str, Any]] = field(default_factory=list)
    knowledge_forms: list[str] = field(default_factory=list)
    evidence_obligations: list[dict[str, str]] = field(default_factory=list)


@dataclass
class CoverageDiscovery:
    perspectives: list[dict[str, Any]] = field(default_factory=list)
    knowledge_forms: list[str] = field(default_factory=list)
    evidence_obligations: list[dict[str, str]] = field(default_factory=list)


_KNOWLEDGE_FORM_OBLIGATIONS: dict[str, tuple[str, str, str]] = {
    "dynamic-process": (
        "state-sim",
        "trace",
        "逐步观察中间状态、一次真实转移以及可复位的前后态映射",
    ),
    "executable-artifact": (
        "runnable",
        "implement",
        "可编辑实现、固定测试输入、运行输出与正确性反馈",
    ),
    "quantitative-model": (
        "model-sim",
        "manipulate",
        "改变真实参数并观察模型重新计算后的定量结果",
    ),
    "spatial-constraint": (
        "geometry-sim",
        "manipulate",
        "操作坐标或几何对象并观察约束与不变量是否保持",
    ),
    "relational-structure": (
        "graph",
        "inspect",
        "从节点与具名边读出固定的层级、分支或依赖关系",
    ),
    "observational-evidence": (
        "media",
        "inspect",
        "从有来源的真实对象、标本、地点、史料或外观差异中辨认可观察特征",
    ),
}

_KNOWLEDGE_FORM_SIGNALS: dict[str, tuple[str, ...]] = {
    "dynamic-process": (
        "state transition", "step-by-step", "process", "rotation", "insertion", "deletion",
        "状态转移", "逐步", "过程", "旋转", "插入", "删除", "回溯", "更新",
    ),
    "executable-artifact": (
        "implement", "code", "program", "run", "debug", "test case",
        "实现", "代码", "编程", "运行", "调试", "测试",
    ),
    "quantitative-model": (
        "formula", "parameter", "complexity", "recurrence", "quantitative", "calculate",
        "公式", "参数", "复杂度", "递推", "定量", "计算", "高度与节点数",
    ),
    "spatial-constraint": (
        "coordinate mapping", "geometric constraint", "boundary", "spatial invariant",
        "坐标映射", "几何约束", "空间边界", "几何不变量",
    ),
    "relational-structure": (
        "hierarchy", "node", "edge", "relation", "dependency", "tree", "graph",
        "层级", "节点", "边", "关系", "依赖", "树", "图",
    ),
    "observational-evidence": (
        "appearance", "specimen", "morphology", "photograph", "primary source",
        "artifact", "field observation", "observable trait", "visual evidence",
        "外观", "标本", "形态", "照片", "史料", "文物", "实物", "田野观察",
        "可观察特征", "性状表现", "真实对象",
    ),
}


def _evidence_obligation(
    form: str, perspectives: list[dict[str, Any]]
) -> dict[str, str]:
    capability, action, required = _KNOWLEDGE_FORM_OBLIGATIONS[form]
    evidence = json.dumps(perspectives, ensure_ascii=False).lower()
    if form == "quantitative-model" and not any(
        token in evidence
        for token in (
            "change parameter", "adjust parameter", "parameter control", "manipulate parameter",
            "改变参数", "调节参数", "参数控制", "操纵参数",
        )
    ):
        capability = "chart"
        action = "calculate"
        required = "由明确公式或给定数据直接复算的定量趋势、比较或边界"
    return {
        "knowledgeForm": form,
        "capability": capability,
        "learningAction": action,
        "requiredEvidence": required,
    }


def _validated_knowledge_forms(
    declared: list[Any], perspectives: list[dict[str, Any]]
) -> list[str]:
    """Infer and validate knowledge forms from the described evidence, not topic labels."""
    evidence = json.dumps(perspectives, ensure_ascii=False).lower()
    supported = {
        form
        for form, signals in _KNOWLEDGE_FORM_SIGNALS.items()
        if any(signal in evidence for signal in signals)
    }
    declared_forms = {
        str(value or "").strip()
        for value in declared
        if str(value or "").strip() in _KNOWLEDGE_FORM_OBLIGATIONS
    }
    # Model declarations are advisory: unsupported forms are dropped, supported omissions are
    # restored. This prevents "positioned nodes" from becoming a geometry obligation.
    selected = supported | (declared_forms & supported)
    return [form for form in _KNOWLEDGE_FORM_OBLIGATIONS if form in selected]


async def _discover_coverage(
    llm: LLMClient, *, topic: str, audience: str, extra: str, material: str, n: int
) -> CoverageDiscovery:
    """STORM 阶段一：发现互补教学视角 + 每视角的必讲点与常见疑问。"""
    if n <= 1:
        return CoverageDiscovery()
    sys = (
        f"你是课程设计专家。用多视角提问扩大一节讲义的覆盖面：对给定课题，列出 3-4 个**互补**的教学视角，"
        f"每个视角给出必须讲到的要点与学生常见疑问/误区。视角要真的不同，别重复。"
        "knowledgeForms 按学习证据而非学科名选择：只有学习者必须观察真实外观、标本、地点、史料或实物差异时，"
        "才声明 observational-evidence；抽象机制、精确关系和状态变化分别留给 diagram/sim，不能用图片代替。"
        f"{'**必讲点要从下面的参考素材里提炼。**' if material else ''}只输出 JSON：\n{_PERSPECTIVE_SCHEMA}"
    )
    user = (
        f"课题: {topic}"
        + (f"\n受众: {audience}" if audience else "")
        + (f"\n额外要求: {extra}" if extra else "")
        + (f"\n\n参考素材：\n{material}" if material else "")
        + "\n输出 perspectives JSON。"
    )
    try:
        data = parse_json(
            await asyncio.wait_for(
                llm.complete(
                    [{"role": "system", "content": sys}, {"role": "user", "content": user}],
                    purpose="plan:perspectives",
                ),
                timeout=_PLAN_CALL_TIMEOUT_S,
            )
        )
        ps = data.get("perspectives") if isinstance(data, dict) else None
        raw_forms = data.get("knowledgeForms") if isinstance(data, dict) else None
        perspectives = ps[:4] if isinstance(ps, list) else []
        forms = _validated_knowledge_forms(
            raw_forms if isinstance(raw_forms, list) else [], perspectives
        )
        obligations = [_evidence_obligation(form, perspectives) for form in forms]
        return CoverageDiscovery(
            perspectives=perspectives,
            knowledge_forms=forms,
            evidence_obligations=obligations,
        )
    except Exception:  # noqa: BLE001
        return CoverageDiscovery()


def _render_menu(type_menu: list[tuple[str, str, list[str]]]) -> str:
    """把「家族描述 → 可选类型」菜单渲染成规划器的路由决策面。"""
    lines = []
    for _skill, desc, types in type_menu:
        lines.append(f"- {'/'.join(types)} — {desc}")
    return "\n".join(lines)


def _render_theme_menu(theme_menu: list[tuple[str, str]]) -> str:
    """把主题「名 → 纯视觉/情绪描述」菜单渲染成规划器的选主题决策面(零学科词)。"""
    return "\n".join(f"- {name} — {desc}" for name, desc in theme_menu)


def _skeleton_spec(
    pages: int,
    type_menu: list[tuple[str, str, list[str]]],
    theme_hint: str,
    theme_menu: list[tuple[str, str]],
    wants: str,
    authoring_rules: str,
) -> str:
    all_types = [t for _s, _d, types in type_menu for t in types]
    # 主题选单指引:纯视觉/情绪、零方向驱动。用户显式指定则优先(既有行为)。
    # 单列出来算,避免在 f-string 表达式里写 "\n"(Py3.11 不允许 f-string 内含反斜杠)。
    theme_block = (
        "从下面的主题菜单里,按本课题的气质与情绪挑视觉上最贴的一个"
        "(纯凭观感自行判断,不必默认某个、也不必刻意求新):\n" + _render_theme_menu(theme_menu)
    )
    theme_line = f"用户指定主题: {theme_hint}" if theme_hint else theme_block
    return f"""骨架结构:
{{ "id":"kebab-id","title":"...","subtitle":"...(可选)","language":"zh-CN","audience":"...","theme":"...(从下方主题菜单里挑一个名字)",
  "designBrief":{{"audience":{{"stage":"primary|middle|high|university|professional","readingLevel":"...","formality":"playful|instructional|editorial|academic"}},"purpose":"concept-teaching|practice|explanation|research-report","density":"light|medium|dense","designDNA":{{"palette":{{"base":"...","accent":"..."}},"typography":{{"display":"...","body":"..."}},"shapeLanguage":"...","mediaLanguage":"...","texture":"...","motifs":["..."],"compositionRhythm":"..."}},"selectionReason":"根据受众、目的、证据与密度的一句话理由"}},
  "tutor":{{"suggestions":["建议问题"],"kb":[{{"pattern":"关键词|同义词","answer":"本地应答(inline-md)"}}]}},
  "scenes":[
    {{"id":"cover","kind":"hero","notes":"开场作用一句话","brief":{{"objective":"学生能说出本讲要解决的问题","learningAction":"orient","requiredEvidence":"主题、核心问题与学习承诺","keyClaim":"本讲唯一承诺","misconception":"","visualTask":"封面只建立主题与问题张力","evidencePolicy":"none"}},"visualBrief":{{"designIntent":"建立课题与核心问题的视觉张力","selectedCapabilities":["hero"],"compositionFamily":"full-bleed-hero"}},"blocks":[{{"id":"b_cover","type":"hero","role":"claim","intent":"封面：标题+一句副题","size":"xl"}}]}},
    {{"id":"...","kind":"content","eyebrow":"小节标签(可选)","headline":"页标题","lead":"一句陈述式导语(可选)","transition":"zoom(可选,只在确有强调/章节切换意图时用)","notes":"本页作用一句话","brief":{{"objective":"学完本页学生能做出的可观察动作","learningAction":"read|inspect|trace|construct|compare|predict|manipulate|implement|run|debug|calculate|explain 中最主要的一项","requiredEvidence":"学生完成目标时必须看到或产出的具体证据","keyClaim":"本页唯一核心结论","misconception":"本页要纠正的一个具体误区","visualTask":"图形/交互必须让学生看见的变量关系或状态变化","evidencePolicy":"derived|provided|synthetic|none"}},"visualBrief":{{"designIntent":"本页空间层级如何支持 objective","selectedCapabilities":["list","diagram"],"compositionFamily":"annotated-specimen"}},"blocks":[{{"id":"b1","type":"list","role":"claim","intent":"这一块要讲清什么(一句)","size":"m"}},{{"id":"b2","type":"callout","role":"support","intent":"...","size":"s"}}]}},
    {{"id":"...","kind":"quiz","headline":"随堂检验","notes":"检验本页目标","brief":{{"objective":"学生能独立完成什么判断/计算","learningAction":"predict|calculate|judge|explain","requiredEvidence":"学生答案、正确性反馈与判定链","keyClaim":"被检验的知识点","misconception":"错误选项针对的误区","visualTask":"作答后能从解释看出判定链条","evidencePolicy":"derived"}},"blocks":[{{"id":"bq","type":"quiz","role":"practice","intent":"考察点","size":"m"}}]}}
  ]}}

可选组件（**描述即选择依据：按每个家族的描述判断这一页/这一块内容最贴哪个就选哪个；别被"高级/低级""稀有出口"之类预设吓退，也别硬塞不贴题的**。type 只能从下面出现的名字里选、禁止新造）：
{_render_menu(type_menu)}

规则:
- **总页数硬约束：恰好 {pages} 页，不允许少一页或多一页**，含封面/收尾/可能的章节分隔页。第一页 kind:hero(封面, 恰含一个 hero block)。页数少(≤4)时省掉回顾/收尾页。
- **封面与收尾页的标题/副题必须直接点出课题本身**，严禁写成其它主题或泛泛套话。
- scene.kind: hero(封面/收尾,一个 hero block) | content(常规) | quiz(含一个 quiz block) | statement(含一个 statement block) | section(章节分隔页,含一个 statement block)。
- `hero` block 只能出现在 kind:hero，不能塞进 content 当大字卡；statement 的正文必须是推进论证的核心结论，不得复述 headline。
- 每页必须有内部规划字段 `brief`：先写 `objective`，再只选一个主要 `learningAction`，并用 `requiredEvidence` 写清学生完成目标时必须看到或产出的具体证据；然后才根据 Skill 菜单声明的 affordances / learner actions / evidence outputs 选择 block。`keyClaim` 只写一个核心结论；`misconception` 只写一个具体错误想法（无则空串）；`visualTask` 描述必须编码的关系；`evidencePolicy` 只能是 `derived|provided|synthetic|none`。这些字段供后续生成与质检使用，不是观众正文。
- 整份讲义必须写一个内部 `designBrief`，每页必须写 `visualBrief`。先从页面 objective/requiredEvidence 形成 designIntent，再从 Skill 菜单选择 selectedCapabilities，最后选 compositionFamily。整套课保持同一个 Design DNA；页面靠构图与证据变化，不逐页随机换风格。Media 是可选能力，不得按配额调用。
- 选择 `media` 时，占位 block 除通用字段外必须写 `purpose:evidence|explanatory|narrative|atmospheric`、`placement:illustration|decoration|background`、`subject`、`relationshipToContent`、`fidelity:documentary|scientific|conceptual|atmospheric`、`required:true|false`，可选 `fit:contain|cover`、`safeZone`、`overlay`、`sourceStrategy:search-first|generate-first`。背景必须与至少一个原生内容 block 同页；关键文字、公式、数据和标签不得进入图片像素。
- **不要从主题名称直接映射组件，也不要按数量配额塞互动**。先比较候选表达是否覆盖 `requiredEvidence`：固定关系、单个最终快照或无需控制的少量状态可用静态图；状态序列/结构变换/逐步执行用 state-sim，可控的定量因果用 model-sim，坐标与空间约束用 geometry-sim，即使 brief 没写“交互/试验”；实现、运行或调试代码必须用 runnable。sim 证明过程状态，runnable 证明代码执行，不能互相冒充；只读代码只能证明“看过”。整套课程若存在适合主动练习的目标，必须至少安排一次可产出学生证据的活动，而不是全程 read/inspect。
- `implement` 专指编写可执行代码，并且 requiredEvidence 必须包含代码/运行/测试结果；手动画树、手动执行步骤用 `construct` 或 `trace`，不能滥写 implement。若输入的覆盖清单明确要求完整代码实现或调试，必须安排独立 runnable 页面落实该目标，不能用静态伪代码代替或完全漏掉。
- 每个 block 是占位 {{id(全局唯一), type, role, intent, size}}。`role` 只能是 `claim|evidence|visualization|practice|support`，同页各块必须围绕同一个 brief 分工，不能各讲各的。**type 只能从上方「可选组件」里的名字选，禁止新造类型名**（共 {len(all_types)} 个：{", ".join(all_types)}）。timeline 只用于有明确时间点/阶段的编年序列；无时间标记的简单线性链用 flow。
- 选择 `state-sim|model-sim|geometry-sim` 时，block 额外写内部 `interactionBrief`。必须使用这些结构：`stateModel:[{{"name":"step","type":"int","range_or_values":"0..3","initial":0}}]`；`controls:[{{"trigger":"单步按钮","effect":"推进一步并调用 update()"}}]`；`visibleEncodings:[{{"quantity":"本步变化的边","mark":"高亮连线","where":"主舞台"}}]`；`verificationCases:[{{"input":"初态","expected":"确定的可见结果"}},{{"input":"一次操作","expected":"确定的状态转移"}},{{"input":"复位","expected":"恢复同一初态"}}]`。同时写 `update`(统一状态更新规则)、`initialPaint`(初态本身完整可见，不用先点一次才出现)、`history`(前态/当前态如何同屏)、`reset`(必须回到 initial=0 的同一初态)、`aestheticDirection`(lab-dark|paper-editorial|studio-pop|terminal-data|soft-organic|blueprint|ink-wash|host-calm)、`signatureDetail`(一个服务概念的视觉记忆点)。比较目标加 `comparisonStates`；数学/几何加 `mathModel:{{formula,screenMapping,invariants}}`；确需粒子/连续场才写 `renderMedium:"canvas"`，否则默认 svg。这里只写设计契约，不写 HTML。
- **每个 block 标一个粗粒度 size：`xl`(几乎独占整页的主体，如封面、复杂大图) / `l`(大块/主体，如复杂图表、大表格、多轮对比、长 timeline) / `m`(默认，一般讲解块) / `s`(小/辅助，如一句注解、次要论点、callout 补充)。不写默认按 m 处理。**
- **一页配几个 block、配多大由内容真实需要决定，不设死数量上限**——但整页视觉重量要有节奏：粗略按 xl=4/l=3/m=2/s=1 心算一页总重量，大致落在 ~6 上下浮动即可；**不要为了凑够页数而硬拆一个大块，也不要图省事把一页堆成 5-6 个同重量小块**；真正复杂的内容（compare、大 table、>5 事件 timeline）给 l/xl 并考虑独占一页；叙事仍由浅入深。
- **能用图表表达的定量对比/趋势/相关性优先用 chart（bar/line/area/scatter）而非 table**；纯名目罗列、无需比较数值大小或走势的数据才用 table。
- **视觉语法必须服从 `brief.visualTask`**：坐标位置、轨迹、梯度、边界等几何关系必须用 chart/scatter/line 或 sim 真实编码坐标，不能拿 connected-circles、蛇形卡片等装饰模板冒充数学图；diagram 只用于它的形状确实表达了循环/层级/步骤/网络关系时。若视觉不能让学生仅凭图形读出目标关系，宁可换组件。
- **视觉任务必须有视觉载体**：除 hero/section 外，只要 `visualTask` 要求读出结构、状态、路径、趋势、空间或对象外观，本页就必须至少有一个真正编码该关系的 diagram/graph/chart/sim/runnable/media 等证据 block；statement/list/callout/compare 里的纯文字不能冒充视觉证据。若本页只需要一句过渡，则把 learningAction 设为 orient、evidencePolicy 设为 none，并明确 visualTask 只承担导航节奏。
- **证据纪律**：没有参考素材时，禁止凭空写论文名+年份、人物原话、调查比例、精确行业数字。定量内容只能来自可展示的推导，或明确标为「示意/合成数据」；需要外部来源而当前没有素材的事实，应改写为不依赖精确数字的定性结论，不能先编一个数再让后续补引用。
- **数学层级不能偷换**：近似/直觉、带条件引理、特殊模型精确结论、一般定理要分别命名并写清前提。不能用“一阶 Taylor 近似”直接宣称全局下降保证；若保证依赖光滑性、凸性、强凸性等条件，页目标和标题必须显式写条件。一个页面若需要跨越两层以上（如近似→下降引理→谱条件→收敛率），必须拆开，不准压成公式拼盘。
- **保证必须可见地带条件**：收敛、速率、全局最优等结论所需的光滑性/凸性/强凸性与步长范围，必须能放入观众可见的 headline/lead/formula/caption；只计划写在 notes 或内部 brief 等于没写。
- **比较必须在首帧成立**：objective 若写“比较 A/B/C”，visualTask 与主视觉 block.intent 必须要求初始画面同时显示 A/B/C（或清楚的并排小多图）；一次只显示滑块当前选中的一条曲线不算完成比较。
- **鞍点需要二维证据**：要解释鞍点/相反曲率，必须用二维曲面/等高线，或至少两条明确标注的正交切片；单条只向上/只向下的一维曲线不能证明鞍点。
- **复杂 sim 页最多两个 block**：一个 l/xl 的 state-sim/geometry-sim 或 widget 型 model-sim 主舞台最多搭配一个 s/m 的短公式或短说明。quiz、callout、长公式不得再堆在同页；如果页数预算不允许另起一页，就删掉次要块并让互动本身完成证据链。
- **语言一致**：`language` 决定所有观众可见的 title/headline/lead/caption/控件文案；除数学符号、代码标识符和必要专名外，不得无故中英混排。
- **quiz 目标必须匹配一道题**：一个 quiz block 只承载一道可复算题，brief.objective/keyClaim 只写这一个判定链；不得声称一道题同时覆盖梯度方向、学习率、调度策略等整章目标。
- **几个孤立的关键数字（一眼看大小，不是走势/分布）用 stats 数字卡**；有循环/层级/递进/网络等特殊结构关系的内容用 diagram（cycle/pyramid/staircase/snake/arrow-seq/circular-grid/connected-circles，按关系语义选，不要混用，简单 2-3 步线性流程仍用 flow 就够）。
- **scene 可选 `transition`**（reveal 切场动效名，如 zoom/convex/none）：只在确有强调或大段落切换的意图时用，**不要每页都加**——多数页留空即可。
- **交互按证据贴合度选**：确有状态变化、模型参数或空间约束时大胆使用对应 sim；纯叙述、纯观点、无状态/参数/约束的题材不要硬塞。建议每课至少 1 个 quiz。{"用户点名的交互: " + wants if wants else ""}
- **三类 sim 必须按证据分类**：算法中间状态、逐步执行、树/图/数组结构变换用 state-sim；真实参数→模型重算→定量结果用 model-sim；坐标映射、拖拽、边界与几何约束本身是证据时用 geometry-sim。节点在画面上有位置不等于 geometry：AVL 旋转仍是 state-sim。比较/随机/播放/历史是三类上的 affordance，不另造类型。
- **声明式优先只适用于 model-sim**：一个标量一阶递推或一维黑箱优化不写 engine，由后续选择 dynamics1d/searchCompare/custom；二维/多状态/连续场等声明式引擎无法表达的 model-sim 才额外写 `engine:"widget"`。state-sim 与 geometry-sim 固定走 widget。interactionBrief 完整时会直接 build，缺失或复杂时才补一次 widget:plan；因此不得故意留空。
- **runnable**：学生需要**真正改代码、点运行、看结果**时用（如手写实现算法、调参看效果）；纯展示代码用 `code`。一份讲义可有多个 runnable（各自独立、贴题就用）。
- **主题(theme)只是视觉气质、不承诺任何环节**。{theme_line}
- 骨架阶段的 `notes` 只写本页在叙事中的作用（一句话），不要提前编推导、数字或讲稿；实际讲者稿会在所有 block 生成后依据最终页面内容重写。
- **AI 助教**：tutor.suggestions 给 3-4 个贴具体知识点的问题；tutor.kb 覆盖主要术语 4-6 条，pattern 用 `关键词|同义词`。
{authoring_rules}"""


async def insert_sections(llm: LLMClient, doc: dict[str, Any], budget: int | None = None) -> int:
    """章节分隔页确定性插入：仅长讲义（内容页≥5）判定 2-3 个大部分边界并在各部分首页前插 section。

    budget 给定时（页数硬上限）：已达上限就不插，避免分隔页把总页数顶穿目标。
    """
    scenes = doc.get("scenes", [])
    if budget is not None and len(scenes) >= budget:
        return 0
    content_idx = [(s, i) for i, s in enumerate(scenes) if s.get("kind") == "content"]
    if len(content_idx) < 5:
        return 0
    if any(s.get("kind") == "section" for s in scenes):
        return 0
    room = (budget - len(scenes)) if budget is not None else 99  # 还能插几页不超预算
    listing = "\n".join(
        f"{k + 1}. {s.get('headline') or s.get('eyebrow') or '(无题)'}"
        for k, (s, _) in enumerate(content_idx)
    )
    sys = (
        "你是讲义编排师。下面是一节课按顺序的内容页标题。判断它们是否自然分成 2-3 个连贯的大部分(part)。"
        "只有确实存在清晰主题分界时才分；牵强或本就单一主题就返回空。每个 part 给：start(起始页序号)、"
        'title(4-12字)、thesis(一句话主旨,≤30字)。只输出 JSON：{ "parts": [ { "start": 1, "title": "…", "thesis": "…" } ] }。'
    )
    user = f"内容页标题（共 {len(content_idx)} 页）：\n{listing}\n\n输出 parts JSON。"
    try:
        parts = (
            parse_json(
                await asyncio.wait_for(
                    llm.complete(
                        [{"role": "system", "content": sys}, {"role": "user", "content": user}],
                        purpose="plan:sections",
                    ),
                    timeout=_PLAN_CALL_TIMEOUT_S,
                )
            ).get("parts")
            or []
        )
    except Exception:  # noqa: BLE001
        return 0
    if not isinstance(parts, list) or len(parts) < 2:
        return 0
    if len(parts) > -(-len(content_idx) // 2):  # 分隔页数 > 内容页半数 → 过度打点
        return 0
    seen: set[int] = set()
    targets = []
    for p in parts:
        k = int(p.get("start", 0) or 0) - 1
        if k < 0 or k >= len(content_idx):
            continue
        title, thesis = str(p.get("title", "")).strip(), str(p.get("thesis", "")).strip()
        if not title or not thesis:
            continue
        scene_index = content_idx[k][1]
        if scene_index in seen:
            continue
        seen.add(scene_index)
        targets.append((scene_index, title, thesis))
    if room < 99:  # 预算受限：只保留最靠前的若干个分隔，别顶穿页数上限
        targets = sorted(targets, key=lambda t: t[0])[: max(0, room)]
    n = 0
    for scene_index, title, thesis in sorted(targets, key=lambda t: -t[0]):  # 降序插入避免错位
        # Avoid two consecutive title cards with the same narrative job.
        previous = scenes[scene_index - 1] if scene_index > 0 else None
        if isinstance(previous, dict) and previous.get("kind") in {"statement", "section"}:
            continue
        scenes.insert(
            scene_index,
            {
                "id": f"section-{scene_index}",
                "kind": "section",
                "headline": title,
                "notes": f"章节分隔：{title}。{thesis}",
                "blocks": [
                    {
                        "id": f"sec{scene_index}s",
                        "type": "statement",
                        "intent": f"本部分「{title}」一句话主旨：{thesis}",
                    }
                ],
            },
        )
        n += 1
    return n


def fit_scene_budget(doc: dict[str, Any], budget: int) -> list[str]:
    """Compile an overfull skeleton to the exact page budget by evidence strength."""
    scenes = doc.get("scenes")
    if not isinstance(scenes, list) or len(scenes) <= budget:
        return []
    protected = {0, len(scenes) - 1}
    evidence_weight = {
        "state-sim": 100,
        "model-sim": 100,
        "geometry-sim": 100,
        "sim": 100,
        "runnable": 100,
        "quiz": 70,
        "formula": 45,
        "graph": 45,
        "diagram": 40,
        "chart": 40,
        "flow": 35,
        "timeline": 35,
        "code": 30,
        "table": 10,
        "list": 8,
        "callout": 6,
        "statement": 4,
    }

    def strength(index: int, scene: dict[str, Any]) -> tuple[int, int]:
        if index in protected or scene.get("kind") == "hero":
            return (10_000, index)
        if scene.get("kind") == "section":
            return (-100, index)
        score = 70 if scene.get("kind") == "quiz" else 0
        score += sum(
            evidence_weight.get(str(block.get("type") or ""), 5)
            for block in (scene.get("blocks") or [])
            if isinstance(block, dict)
        )
        return (score, index)

    excess = len(scenes) - budget
    removable = sorted(
        ((strength(index, scene), index) for index, scene in enumerate(scenes)),
        key=lambda item: item[0],
    )
    remove_indices = {index for (_score, index) in removable[:excess]}
    removed = [str(scene.get("id") or f"page-{i + 1}") for i, scene in enumerate(scenes) if i in remove_indices]
    doc["scenes"] = [scene for i, scene in enumerate(scenes) if i not in remove_indices]
    return removed


def fill_scene_budget(doc: dict[str, Any], budget: int) -> list[str]:
    """Deterministically split dense planned pages until the requested count is exact.

    The planner is occasionally one page short even after being told an exact count.  Padding
    with a generic recap would violate evidence-first planning, so the fallback separates a
    real sibling block from the densest content page and turns its existing intent into the
    continuation page's observable objective.  Generated block content is not copied.
    """
    scenes = doc.get("scenes")
    if not isinstance(scenes, list) or len(scenes) >= budget:
        return []
    inserted: list[str] = []

    def candidate(index: int, scene: Any) -> tuple[int, int, int]:
        if not isinstance(scene, dict) or scene.get("kind") in {"hero", "section"}:
            return (-1, -1, -index)
        blocks = scene.get("blocks")
        if not isinstance(blocks, list) or len(blocks) < 2:
            return (-1, -1, -index)
        # Prefer genuinely dense pages; avoid splitting a stage+single-caption pair when a
        # three-block explanatory page is available.
        return (
            len(blocks),
            sum(len(json.dumps(block, ensure_ascii=False, default=str)) for block in blocks),
            -index,
        )

    while len(scenes) < budget:
        ranked = sorted(
            ((candidate(index, scene), index) for index, scene in enumerate(scenes)),
            reverse=True,
        )
        if not ranked or ranked[0][0][0] < 2:
            break
        index = ranked[0][1]
        source = scenes[index]
        blocks = source.get("blocks") or []
        moved = blocks.pop()
        intent = str(moved.get("intent") or source.get("headline") or "应用已有结论")
        brief = source.get("brief") if isinstance(source.get("brief"), dict) else {}
        block_type = str(moved.get("type") or "")
        action = (
            "run" if block_type == "runnable" else
            "manipulate" if block_type in _SIM_CAPABILITIES else
            "predict" if block_type == "quiz" else
            "inspect"
        )
        continuation = {
            "kind": "quiz" if block_type == "quiz" else "content",
            "eyebrow": source.get("eyebrow") or "深入",
            "headline": f"{source.get('headline') or doc.get('title') or '主题'}：{intent[:24]}",
            "notes": f"从上一页展开独立证据：{intent}",
            "brief": {
                "objective": intent,
                "learningAction": action,
                "requiredEvidence": intent,
                "keyClaim": intent,
                "misconception": str(brief.get("misconception") or ""),
                "visualTask": intent,
                "evidencePolicy": str(brief.get("evidencePolicy") or "none"),
            },
            "visualBrief": {
                "designIntent": f"给「{intent}」独立的可读证据舞台",
                "selectedCapabilities": [block_type] if block_type else [],
                "compositionFamily": "interactive-stage" if block_type in _SIM_CAPABILITIES | {"runnable"} else "focal-object",
            },
            "blocks": [moved],
        }
        scenes.insert(index + 1, continuation)
        inserted.append(str(source.get("id") or f"page-{index + 1}"))
    return inserted


_DATA_TYPES = {"chart", "table", "sim", "grid"}
_SIZE_WEIGHT = {"s": 1, "m": 2, "l": 3, "xl": 4}


def _size(b: dict[str, Any]) -> str:
    """block 的粗粒度尺寸提示（骨架阶段模型给的信号，缺省当 m）。"""
    return str(b.get("size") or "m")


def _weight(b: dict[str, Any]) -> int:
    return _SIZE_WEIGHT.get(_size(b), 2)


def _compose_areas_from_sizes(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """按 size 权重把 block 序列切成不重叠的 12 栏 col 跨度；不设 row——
    compose 渲染器本就"缺 row 交给 grid 自动流"（viewer/doc-to-deck.js rowSpanCss 注释），
    cursor 撞到 12 栏就回卷到第 1 栏，浏览器原生 grid 自动换行成新的一行。"""
    colspan = {"s": 4, "m": 6, "l": 8, "xl": 12}
    areas: list[dict[str, Any]] = []
    cursor = 1
    for b in blocks:
        span = colspan.get(_size(b), 6)
        if cursor + span > 13:
            cursor = 1
        areas.append({"blockIds": [b["id"]], "col": [cursor, cursor + span]})
        cursor += span
    return areas


def assign_layouts(doc: dict[str, Any]) -> int:
    """确定性版式分配：由骨架阶段模型给的粗粒度 block.size 提示驱动，而非硬编码数 block 个数。

    规划器实测常年只产竖排；这里按每页的 block 语义/尺寸选择能放下内容的版式。版式是可读性约束，
    不再设置“每类至多 2 页 / 相邻页禁用”的全局审美配额——旧配额会让后半份中结构相同的页面退回
    flow，产生可预测的溢出。size/role 是骨架阶段的临时信号，在 fill_blocks 替换占位符前读取。
    渲染器对失效引用有回落。
    """

    def label(intent: str, i: int) -> str:
        first = re.split(r"[：:（(，,。、\n]", str(intent))[0].strip()
        s = first[:14]
        return (first[:14] + "…" if len(first) > 14 else s) if s else f"第 {i + 1} 节"

    scenes = doc.get("scenes", [])

    # 0. Design director composition families compile to the existing stable layout primitives.
    directed = 0
    for scene in scenes:
        if scene.get("kind") != "content" or scene.get("layout"):
            continue
        blocks = scene.get("blocks") or []
        family = str(scene.get("compositionFamily") or "")
        if family in {"interactive-stage", "research-figure", "data-evidence"} and len(blocks) == 1:
            scene["layout"] = {"kind": "full"}
        elif family in {"cutout-split", "annotated-specimen", "experiment-setup", "proof-equation-stage"} and len(blocks) == 2:
            anchor = next((b for b in blocks if b.get("type") == "media"), blocks[0])
            scene["layout"] = {"kind": "split", "anchor": [anchor.get("id")], "ratio": 0.45}
        elif family in {"poster", "text-over-image", "full-bleed-hero", "focal-object"}:
            scene["layout"] = {"kind": "flow", "centered": True, "gap": 22}
        elif family == "process-path" and len(blocks) >= 2:
            scene["layout"] = {
                "kind": "index",
                "steps": [
                    {"label": label(block.get("intent", ""), i), "blockIds": [block.get("id")]}
                    for i, block in enumerate(blocks)
                ],
            }
        if scene.get("layout"):
            directed += 1

    # 1. compose/sidenote：2 block，末块 callout（不变，最高优先级）
    side = 0
    for s in scenes:
        blocks = s.get("blocks") or []
        if (
            s.get("kind") == "content"
            and not s.get("layout")
            and len(blocks) == 2
            and blocks[1].get("type") == "callout"
        ):
            s["layout"] = {"kind": "compose", "preset": "sidenote"}
            side += 1

    # 2. full：单 block，type 命中 _DATA_TYPES 或 size 是 l/xl（逐页适配，不设全局配额）
    full_n = 0
    for s in scenes:
        blocks = s.get("blocks") or []
        if (
            s.get("kind") == "content"
            and not s.get("layout")
            and len(blocks) == 1
            and (blocks[0].get("type") in _DATA_TYPES or _size(blocks[0]) in ("l", "xl"))
        ):
            s["layout"] = {"kind": "full"}
            full_n += 1

    # 3. 公式 + 数据图：用 index 逐步全宽展示。长公式放 split 窄锚栏必然缩小/裁切，且推导→图示
    #    本来就是适合 reveal 分步呈现的顺序关系。
    formula_data_n = 0
    for s in scenes:
        blocks = s.get("blocks") or []
        types = {b.get("type") for b in blocks}
        if (
            s.get("kind") == "content"
            and not s.get("layout")
            and len(blocks) == 2
            and "formula" in types
            and bool(types & _DATA_TYPES)
        ):
            s["layout"] = {
                "kind": "index",
                "steps": [
                    {"label": label(b.get("intent", ""), k), "blockIds": [b["id"]]}
                    for k, b in enumerate(blocks)
                ],
            }
            formula_data_n += 1

    # 4. split：2 block，只要其中一块是数据/互动主体，另一块就做窄侧栏；或尺寸权重差 >=2。
    #    旧逻辑只识别“第二块是数据块”，导致 chart 在前、解释在后的常见页面退回 flow 并溢出。
    split_n = 0
    for s in scenes:
        blocks = s.get("blocks") or []
        if s.get("kind") != "content" or s.get("layout") or len(blocks) != 2:
            continue
        data_blocks = [b for b in blocks if b.get("type") in _DATA_TYPES]
        by_type = len(data_blocks) == 1
        w0, w1 = _weight(blocks[0]), _weight(blocks[1])
        if not (by_type or abs(w0 - w1) >= 2):
            continue
        anchor = next(b for b in blocks if b is not data_blocks[0]) if by_type else (blocks[0] if w0 <= w1 else blocks[1])
        s["layout"] = {"kind": "split", "anchor": [anchor["id"]], "ratio": 0.4}
        split_n += 1

    # 5. index：>=2 block 且尺寸大致均匀（原本"多段但地位相当"的语义；阈值从 >=3 降到 >=2，
    #    因为"一页 1-2 个 block"硬约束已去掉后 >=3 block 的均匀页才重新可能出现，但 2 块也一样适用）。
    cands = sorted(
        (
            (s, i)
            for i, s in enumerate(scenes)
            if s.get("kind") == "content"
            and not s.get("layout")
            and len(s.get("blocks") or []) >= 2
            and (max(_weight(b) for b in s["blocks"]) - min(_weight(b) for b in s["blocks"]) <= 1)
        ),
        key=lambda si: -len(si[0]["blocks"]),
    )
    used = 0
    for s, _i in cands:
        s["layout"] = {
            "kind": "index",
            "steps": [
                {"label": label(b.get("intent", ""), k), "blockIds": [b["id"]]}
                for k, b in enumerate(s["blocks"])
            ],
        }
        used += 1

    # 6. compose/computed：>=3 block 且尺寸不均匀——本轮真正解锁的能力，把 size 序列算成
    #    不重叠的 col 跨度网格，不依赖任何预设名字。
    computed_n = 0
    for s in scenes:
        blocks = s.get("blocks") or []
        if s.get("kind") != "content" or s.get("layout") or len(blocks) < 3:
            continue
        weights = [_weight(b) for b in blocks]
        if max(weights) - min(weights) < 2:
            continue
        s["layout"] = {"kind": "compose", "areas": _compose_areas_from_sizes(blocks)}
        computed_n += 1

    return directed + side + full_n + formula_data_n + split_n + used + computed_n


def _coverage_text(discovery: CoverageDiscovery) -> str:
    """把 STORM 视角提炼成"覆盖清单"文本（单次/分层两路共用）。"""
    if not discovery.perspectives and not discovery.evidence_obligations:
        return ""
    perspectives = "\n".join(
        f"【{p.get('name')}·{p.get('focus')}】\n  必讲: {'；'.join(p.get('mustCover') or [])}\n  疑问: {'；'.join(p.get('questions') or [])}"
        for p in discovery.perspectives
    )
    obligations = "\n".join(
        f"- {item['knowledgeForm']} → 必须安排 {item['capability']}；学习动作 {item['learningAction']}；证据: {item['requiredEvidence']}"
        for item in discovery.evidence_obligations
    )
    return (
        "下面是课程设计发现的**覆盖清单**（在骨架里系统覆盖、组织成连贯递进的线）：\n"
        + perspectives
        + ("\n\n课程级证据义务（不是配额；每项至少由一页真实完成，禁止省略目标逃避）：\n" + obligations if obligations else "")
    )


def _section_scene(title: str, thesis: str) -> dict[str, Any]:
    """章节分隔页（与 insert_sections 同形；id 留空交给 engine 统一重编号）。"""
    return {
        "kind": "section",
        "headline": title,
        "notes": f"章节分隔：{title}。{thesis}",
        "blocks": [{"type": "statement", "intent": f"本部分「{title}」一句话主旨：{thesis}"}],
    }


def _normalize_budgets(raw: list[int], target: int) -> list[int]:
    """把模型给的每章 pageBudget 规整成"每章 3–8 页、总和恰为 target"——总数由代码兜底。"""
    n = len(raw)
    if n == 0:
        return []
    tot = sum(max(1, b) for b in raw) or n
    out = [max(3, min(8, round(max(1, b) / tot * target))) for b in raw]
    # 逐 1 调整到总和 == target（尊重 3–8 上下限）
    guard = 0
    while sum(out) != target and guard < 1000:
        guard += 1
        diff = target - sum(out)
        if diff > 0:
            i = min(range(n), key=lambda k: out[k])  # 加给最小的
            if out[i] < 8:
                out[i] += 1
            else:
                break
        else:
            i = max(range(n), key=lambda k: out[k])  # 从最大的扣
            if out[i] > 3:
                out[i] -= 1
            else:
                break
    return out


async def _outline(
    llm: LLMClient,
    *,
    topic: str,
    pages: int,
    audience: str,
    extra: str,
    coverage: str,
) -> dict[str, Any]:
    """分层第一步：出 title/subtitle/theme/tutor + 章节表（每章 pageBudget/mustCover）。"""
    n_sec = max(2, round(max(1, pages - 1) / 6))  # 封面之外，每章约 5–6 个内容/分隔页
    target = max(n_sec * 3, pages - 1 - n_sec)  # 预留 1 封面 + 每章 1 分隔页
    sys = (
        "你是课程总设计师。为一节较长的讲义先出**顶层大纲**：把课题切成若干连贯递进的章节。"
        f"目标约 {n_sec} 章、每章 4–7 页，各章 pageBudget 之和≈{target}。只输出 JSON：\n"
        '{ "title":"课题标题", "subtitle":"副题(可选)", "theme":"主题名(从下方菜单;不确定给 slate)", '
        '"designBrief":{"audience":{"stage":"primary|middle|high|university|professional","readingLevel":"...","formality":"playful|instructional|editorial|academic"},"purpose":"...","density":"light|medium|dense","designDNA":{"palette":{},"typography":{},"shapeLanguage":"...","mediaLanguage":"...","texture":"...","motifs":[],"compositionRhythm":"..."},"selectionReason":"..."}, '
        '"tutor":{"suggestions":["建议问题"],"kb":[{"pattern":"关键词|同义词","answer":"本地应答"}]}, '
        '"sections":[ { "title":"章标题", "thesis":"一句话主旨", "pageBudget":6, "mustCover":["本章必讲点"] } ] }'
    )
    user = (
        f"课题: {topic}"
        + (f"\n受众: {audience}" if audience else "")
        + (f"\n额外要求: {extra}" if extra else "")
        + (f"\n\n{coverage}" if coverage else "")
        + "\n\n输出大纲 JSON。"
    )
    data = parse_json(
        await asyncio.wait_for(
            llm.complete(
                [{"role": "system", "content": sys}, {"role": "user", "content": user}],
                purpose="plan:outline",
            ),
            timeout=_PLAN_CALL_TIMEOUT_S,
        )
    )
    if not isinstance(data, dict):
        raise RuntimeError("大纲 JSON 顶层必须是对象")
    secs = data.get("sections")
    if not isinstance(secs, list) or len(secs) < 2:
        raise RuntimeError("大纲章节解析失败或过少")
    max_sections = max(2, (pages - 1) // 3)
    secs = secs[:max_sections]
    content_target = max(len(secs) * 3, pages - 1 - len(secs))
    budgets = _normalize_budgets(
        [int(s.get("pageBudget", 5) or 5) for s in secs], content_target
    )
    for s, b in zip(secs, budgets, strict=False):
        s["pageBudget"] = b
    data["sections"] = secs
    return data


async def _section_skeleton(
    llm: LLMClient,
    section: dict[str, Any],
    *,
    topic: str,
    theme: str,
    audience: str,
    wants: str,
    type_menu: list[tuple[str, str, list[str]]],
    theme_menu: list[tuple[str, str]],
    authoring_rules: str,
) -> list[dict[str, Any]]:
    """分层第二步（每章一次，可并发）：产该章 pageBudget 页内容页（不含封面）。"""
    budget = int(section.get("pageBudget", 5))
    sys = (
        f"你在编排一节大讲义里的**其中一章**：「{section.get('title')}」。只输出该章的 scenes JSON 对象，"
        "不要代码围栏、不要解释。**分章模式：不要封面/hero 页、不要总收尾页；只产本章内容页**"
        f"（kind 用 content/quiz/statement）。**本章恰好 {budget} 页。**\n"
        + _skeleton_spec(budget, type_menu, theme or "slate", theme_menu, wants, authoring_rules)
    )
    must = "；".join(section.get("mustCover") or [])
    user = (
        f"课题: {topic}"
        + (f"\n受众: {audience}" if audience else "")
        + f"\n本章标题: {section.get('title')}\n本章主旨: {section.get('thesis')}"
        + (f"\n本章必讲: {must}" if must else "")
        + f"\n\n只产本章 {budget} 页的 scenes JSON（对象含 scenes 数组）。"
    )
    doc = parse_json(
        await asyncio.wait_for(
            llm.complete(
                [{"role": "system", "content": sys}, {"role": "user", "content": user}],
                purpose="plan:section",
            ),
            timeout=_PLAN_CALL_TIMEOUT_S,
        )
    )
    scenes = doc.get("scenes") if isinstance(doc, dict) else None
    if not isinstance(scenes, list):
        return []
    # 防御：丢掉模型偷塞的封面/hero 页（分章不该有）
    return [s for s in scenes if s.get("kind") != "hero"][:budget]


def _stitch(outline: dict[str, Any], section_scenes: list[list[dict[str, Any]]]) -> dict[str, Any]:
    """分层第三步（确定性）：封面 + 各章(分隔页+内容页) + 收尾，清 id 交 engine 重编号。"""
    title = str(outline.get("title") or "讲义")
    subtitle = str(outline.get("subtitle") or "")
    scenes: list[dict[str, Any]] = [
        {
            "kind": "hero",
            "notes": f"开场封面：{title}。",
            "blocks": [{"type": "hero", "intent": f"封面：标题「{title}」" + (f" + 副题「{subtitle}」" if subtitle else ""), "size": "xl"}],
        }
    ]
    for sec, sc in zip(outline.get("sections", []), section_scenes, strict=False):
        if not sc:
            continue
        scenes.append(_section_scene(str(sec.get("title") or ""), str(sec.get("thesis") or "")))
        scenes.extend(sc)
    # 清 id：engine 的占位循环会统一分配全局唯一 s{si}b{bi}，避免跨章撞 id
    for s in scenes:
        s.pop("id", None)
        for b in s.get("blocks") or []:
            b.pop("id", None)
    doc: dict[str, Any] = {
        "title": title,
        "subtitle": subtitle,
        "language": "zh-CN",
        "theme": str(outline.get("theme") or "slate"),
        "scenes": scenes,
    }
    if isinstance(outline.get("tutor"), dict):
        doc["tutor"] = outline["tutor"]
    if isinstance(outline.get("designBrief"), dict):
        doc["designBrief"] = outline["designBrief"]
    return doc


async def _plan_hierarchical(
    llm: LLMClient,
    *,
    topic: str,
    pages: int,
    theme: str,
    audience: str,
    wants: str,
    extra: str,
    material: str,
    type_menu: list[tuple[str, str, list[str]]],
    theme_menu: list[tuple[str, str]],
    authoring_rules: str,
    perspectives: list[dict[str, Any]],
    coverage: str,
    concurrency: int,
) -> PlanResult:
    """大纲 → 逐章并发生成 → 确定性拼接。页数由各章 budget 之和兜底（可控可达）。"""
    outline = await _outline(
        llm, topic=topic, pages=pages, audience=audience, extra=extra, coverage=coverage
    )
    secs = outline["sections"]

    async def gen(section: dict[str, Any], _i: int) -> list[dict[str, Any]]:
        return await _section_skeleton(
            llm, section, topic=topic, theme=theme or str(outline.get("theme") or "slate"),
            audience=audience, wants=wants, type_menu=type_menu, theme_menu=theme_menu,
            authoring_rules=authoring_rules,
        )

    section_scenes = await pool(secs, max(1, concurrency), gen)
    if theme:
        outline["theme"] = theme  # 用户显式指定主题优先
    doc = _stitch(outline, section_scenes)
    removed_for_budget = fit_scene_budget(doc, pages)
    inserted_for_budget = fill_scene_budget(doc, pages)
    if len(doc.get("scenes") or []) != pages:
        raise RuntimeError(f"分层规划无法确定性收敛到 {pages} 页")
    if removed_for_budget:
        doc["_budgetRemovedScenes"] = removed_for_budget
    if inserted_for_budget:
        doc["_budgetSplitScenes"] = inserted_for_budget
    return PlanResult(doc=doc, perspectives=perspectives)


async def plan_lecture(
    llm: LLMClient,
    *,
    topic: str,
    pages: int = 12,
    theme: str = "",
    audience: str = "",
    wants: str = "",
    extra: str = "",
    material: str = "",
    type_menu: list[tuple[str, str, list[str]]],
    theme_menu: list[tuple[str, str]],
    authoring_rules: str,
    perspectives_n: int = 3,
    sections: bool = True,
    concurrency: int = 4,
) -> PlanResult:
    """STORM 两阶段：多视角覆盖 → 综合连贯递进的 skeleton。骨架单点失败重试 2 次。

    大页数（> _HIER_THRESHOLD）走分层规划（大纲→逐章并发生成→拼接），否则单次骨架。
    """
    discovery = await _discover_coverage(
        llm, topic=topic, audience=audience, extra=extra, material=material, n=perspectives_n
    )
    perspectives = discovery.perspectives
    coverage = _coverage_text(discovery)

    if pages > _HIER_THRESHOLD:
        result = await _plan_hierarchical(
            llm,
            topic=topic, pages=pages, theme=theme, audience=audience, wants=wants, extra=extra,
            material=material, type_menu=type_menu, theme_menu=theme_menu,
            authoring_rules=authoring_rules, perspectives=perspectives, coverage=coverage,
            concurrency=concurrency,
        )
        result.knowledge_forms = discovery.knowledge_forms
        result.evidence_obligations = discovery.evidence_obligations
        return result

    sys = (
        "你是讲义(LectureDoc)总编排器。只输出一个 JSON 对象(骨架)，不要代码围栏、不要解释。\n"
        + _skeleton_spec(pages, type_menu, theme, theme_menu, wants, authoring_rules)
    )
    user = (
        f"课题: {topic}"
        + (f"\n受众: {audience}" if audience else "")
        + (f"\n主题: {theme}" if theme else "")
        + (f"\n要的交互: {wants}" if wants else "")
        + (f"\n额外要求: {extra}" if extra else "")
        + (f"\n\n参考素材（据此取材，别脱离/编造）：\n{material}" if material else "")
        + f"\n\n{coverage}\n\n产出骨架 JSON。"
    )
    msgs: list[Message] = [{"role": "system", "content": sys}, {"role": "user", "content": user}]

    last_err: Exception | None = None
    for attempt in range(1, 4):
        try:
            doc = parse_json(
                await asyncio.wait_for(
                    llm.complete(msgs, purpose="plan:skeleton"),
                    timeout=_PLAN_CALL_TIMEOUT_S,
                )
            )
            removed_for_budget = fit_scene_budget(doc, pages)
            if removed_for_budget:
                doc["_budgetRemovedScenes"] = removed_for_budget
            if sections:
                await insert_sections(llm, doc, budget=pages)
            inserted_for_budget = fill_scene_budget(doc, pages)
            if len(doc.get("scenes") or []) != pages:
                raise RuntimeError(f"骨架页数无法确定性收敛到 {pages} 页")
            if inserted_for_budget:
                doc["_budgetSplitScenes"] = inserted_for_budget
            return PlanResult(
                doc=doc,
                perspectives=perspectives,
                knowledge_forms=discovery.knowledge_forms,
                evidence_obligations=discovery.evidence_obligations,
            )
        except Exception as e:  # noqa: BLE001
            last_err = e
            if isinstance(e, TimeoutError):
                break
            if attempt < 3:
                await asyncio.sleep(3.0 * attempt)
    raise RuntimeError(f"骨架生成失败（网络/限流/解析）: {str(last_err)[:100]}")
