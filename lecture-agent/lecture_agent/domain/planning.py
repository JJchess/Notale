"""内容规划（移植自 Stanford STORM 的 pre-writing：多视角提问 → 覆盖清单 → 综合骨架）。

对应旧 src/plan.mjs。省略了 UI-only 的流式增量抽取（makePlanPump）；正确性由流末 parse_json 保证，
这里用原子调用。只依赖 ports.LLMClient。来源: github.com/stanford-oval/storm。
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass, field
from typing import Any

from ..ports.llm import LLMClient, Message
from ..utils.concurrency import pool
from ..utils.jsonio import parse_json

_HIER_THRESHOLD = 16  # 页数 > 此值走分层规划（单次骨架 ~15 页封顶，靠分章并发才够）
_PLAN_CALL_TIMEOUT_S = 300.0

_PERSPECTIVE_SCHEMA = (
    '{ "perspectives": [ { "name":"视角名(如 重直觉的入门讲法 / 重推导的理论派 / 重工程实践 / 爱追问的学生)", '
    '"focus":"这个视角最在意什么(一句)", "mustCover":["必须讲到的要点"], "questions":["常见疑问/误区"] } ] }'
)


@dataclass
class PlanResult:
    doc: dict[str, Any]
    perspectives: list[dict[str, Any]] = field(default_factory=list)


async def _discover_coverage(
    llm: LLMClient, *, topic: str, audience: str, extra: str, material: str, n: int
) -> list[dict[str, Any]]:
    """STORM 阶段一：发现互补教学视角 + 每视角的必讲点与常见疑问。"""
    if n <= 1:
        return []
    sys = (
        f"你是课程设计专家。用多视角提问扩大一节讲义的覆盖面：对给定课题，列出 3-4 个**互补**的教学视角，"
        f"每个视角给出必须讲到的要点与学生常见疑问/误区。视角要真的不同，别重复。"
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
        return ps[:4] if isinstance(ps, list) else []
    except Exception:  # noqa: BLE001
        return []


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
  "tutor":{{"suggestions":["建议问题"],"kb":[{{"pattern":"关键词|同义词","answer":"本地应答(inline-md)"}}]}},
  "scenes":[
    {{"id":"cover","kind":"hero","notes":"开场作用一句话","brief":{{"objective":"学生能说出本讲要解决的问题","learningAction":"orient","requiredEvidence":"主题、核心问题与学习承诺","keyClaim":"本讲唯一承诺","misconception":"","visualTask":"封面只建立主题与问题张力","evidencePolicy":"none"}},"blocks":[{{"id":"b_cover","type":"hero","role":"claim","intent":"封面：标题+一句副题","size":"xl"}}]}},
    {{"id":"...","kind":"content","eyebrow":"小节标签(可选)","headline":"页标题","lead":"一句陈述式导语(可选)","transition":"zoom(可选,只在确有强调/章节切换意图时用)","notes":"本页作用一句话","brief":{{"objective":"学完本页学生能做出的可观察动作","learningAction":"read|inspect|compare|predict|manipulate|implement|run|debug|calculate|explain 中最主要的一项","requiredEvidence":"学生完成目标时必须看到或产出的具体证据","keyClaim":"本页唯一核心结论","misconception":"本页要纠正的一个具体误区","visualTask":"图形/交互必须让学生看见的变量关系或状态变化","evidencePolicy":"derived|provided|synthetic|none"}},"blocks":[{{"id":"b1","type":"list","role":"claim","intent":"这一块要讲清什么(一句)","size":"m"}},{{"id":"b2","type":"callout","role":"support","intent":"...","size":"s"}}]}},
    {{"id":"...","kind":"quiz","headline":"随堂检验","notes":"检验本页目标","brief":{{"objective":"学生能独立完成什么判断/计算","learningAction":"predict|calculate|judge|explain","requiredEvidence":"学生答案、正确性反馈与判定链","keyClaim":"被检验的知识点","misconception":"错误选项针对的误区","visualTask":"作答后能从解释看出判定链条","evidencePolicy":"derived"}},"blocks":[{{"id":"bq","type":"quiz","role":"practice","intent":"考察点","size":"m"}}]}}
  ]}}

可选组件（**描述即选择依据：按每个家族的描述判断这一页/这一块内容最贴哪个就选哪个；别被"高级/低级""稀有出口"之类预设吓退，也别硬塞不贴题的**。type 只能从下面出现的名字里选、禁止新造）：
{_render_menu(type_menu)}

规则:
- **总页数硬约束：恰好 {pages} 页（可 {pages}−1，绝不少于 {pages}−2、绝不多于 {pages}）**，含封面/收尾/可能的章节分隔页。第一页 kind:hero(封面, 恰含一个 hero block)。页数少(≤4)时省掉回顾/收尾页。
- **封面与收尾页的标题/副题必须直接点出课题本身**，严禁写成其它主题或泛泛套话。
- scene.kind: hero(封面/收尾,一个 hero block) | content(常规) | quiz(含一个 quiz block) | statement(含一个 statement block) | section(章节分隔页,含一个 statement block)。
- 每页必须有内部规划字段 `brief`：先写 `objective`，再只选一个主要 `learningAction`，并用 `requiredEvidence` 写清学生完成目标时必须看到或产出的具体证据；然后才根据 Skill 菜单声明的 affordances / learner actions / evidence outputs 选择 block。`keyClaim` 只写一个核心结论；`misconception` 只写一个具体错误想法（无则空串）；`visualTask` 描述必须编码的关系；`evidencePolicy` 只能是 `derived|provided|synthetic|none`。这些字段供后续生成与质检使用，不是观众正文。
- **不要从主题名称直接映射组件，也不要按数量配额塞互动**。先比较候选表达是否覆盖 `requiredEvidence`：固定少量状态可以用并排静态图；需要学生改变输入并观察因果时才用 sim；需要学生实现、运行或调试代码时必须用 runnable；只读代码只能证明“看过”，不能证明“会实现”。整套课程若存在适合主动练习的目标，必须至少安排一次可产出学生证据的活动，而不是全程 read/inspect。
- 每个 block 是占位 {{id(全局唯一), type, role, intent, size}}。`role` 只能是 `claim|evidence|visualization|practice|support`，同页各块必须围绕同一个 brief 分工，不能各讲各的。**type 只能从上方「可选组件」里的名字选，禁止新造类型名**（共 {len(all_types)} 个：{", ".join(all_types)}）。timeline 只用于有明确时间点的编年序列；无时间点的步骤/流程一律用 flow。sim 块**若**要做「活」的动画/交互演示（见下方 sim 规则），额外写 `"engine":"widget"`，如 `{{"id":"bw","type":"sim","engine":"widget","role":"visualization","intent":"...","size":"l"}}`；其余 sim 只写 type、引擎留给后续自动选。
- **每个 block 标一个粗粒度 size：`xl`(几乎独占整页的主体，如封面、复杂大图) / `l`(大块/主体，如复杂图表、大表格、多轮对比、长 timeline) / `m`(默认，一般讲解块) / `s`(小/辅助，如一句注解、次要论点、callout 补充)。不写默认按 m 处理。**
- **一页配几个 block、配多大由内容真实需要决定，不设死数量上限**——但整页视觉重量要有节奏：粗略按 xl=4/l=3/m=2/s=1 心算一页总重量，大致落在 ~6 上下浮动即可；**不要为了凑够页数而硬拆一个大块，也不要图省事把一页堆成 5-6 个同重量小块**；真正复杂的内容（compare、大 table、>5 事件 timeline）给 l/xl 并考虑独占一页；叙事仍由浅入深。
- **能用图表表达的定量对比/趋势/相关性优先用 chart（bar/line/area/scatter）而非 table**；纯名目罗列、无需比较数值大小或走势的数据才用 table。
- **视觉语法必须服从 `brief.visualTask`**：坐标位置、轨迹、梯度、边界等几何关系必须用 chart/scatter/line 或 sim 真实编码坐标，不能拿 connected-circles、蛇形卡片等装饰模板冒充数学图；diagram 只用于它的形状确实表达了循环/层级/步骤/网络关系时。若视觉不能让学生仅凭图形读出目标关系，宁可换组件。
- **证据纪律**：没有参考素材时，禁止凭空写论文名+年份、人物原话、调查比例、精确行业数字。定量内容只能来自可展示的推导，或明确标为「示意/合成数据」；需要外部来源而当前没有素材的事实，应改写为不依赖精确数字的定性结论，不能先编一个数再让后续补引用。
- **数学层级不能偷换**：近似/直觉、带条件引理、特殊模型精确结论、一般定理要分别命名并写清前提。不能用“一阶 Taylor 近似”直接宣称全局下降保证；若保证依赖光滑性、凸性、强凸性等条件，页目标和标题必须显式写条件。一个页面若需要跨越两层以上（如近似→下降引理→谱条件→收敛率），必须拆开，不准压成公式拼盘。
- **保证必须可见地带条件**：收敛、速率、全局最优等结论所需的光滑性/凸性/强凸性与步长范围，必须能放入观众可见的 headline/lead/formula/caption；只计划写在 notes 或内部 brief 等于没写。
- **比较必须在首帧成立**：objective 若写“比较 A/B/C”，visualTask 与主视觉 block.intent 必须要求初始画面同时显示 A/B/C（或清楚的并排小多图）；一次只显示滑块当前选中的一条曲线不算完成比较。
- **鞍点需要二维证据**：要解释鞍点/相反曲率，必须用二维曲面/等高线，或至少两条明确标注的正交切片；单条只向上/只向下的一维曲线不能证明鞍点。
- **复杂 widget 页最多两个 block**：一个 l/xl 的 sim.widget 主舞台最多搭配一个 s/m 的短公式或短说明。quiz、callout、长公式不得再堆在同页；如果页数预算不允许另起一页，就删掉次要块并让互动本身完成证据链。
- **语言一致**：`language` 决定所有观众可见的 title/headline/lead/caption/控件文案；除数学符号、代码标识符和必要专名外，不得无故中英混排。
- **quiz 目标必须匹配一道题**：一个 quiz block 只承载一道可复算题，brief.objective/keyClaim 只写这一个判定链；不得声称一道题同时覆盖梯度方向、学习率、调度策略等整章目标。
- **几个孤立的关键数字（一眼看大小，不是走势/分布）用 stats 数字卡**；有循环/层级/递进/网络等特殊结构关系的内容用 diagram（cycle/pyramid/staircase/snake/arrow-seq/circular-grid/connected-circles，按关系语义选，不要混用，简单 2-3 步线性流程仍用 flow 就够）。
- **scene 可选 `transition`**（reveal 切场动效名，如 zoom/convex/none）：只在确有强调或大段落切换的意图时用，**不要每页都加**——多数页留空即可。
- **交互按题材贴合度选**：可量化/可模拟/可交互的过程，该用 sim/widget/runnable 就**大胆用**，别因它"高级"或"重"而回避（互动恰恰是这套讲义相对静态 PPT 的价值所在）；但**没有可量化/可模拟/可交互过程**的题材（纯叙述、纯观点、无参数可调）不要硬塞 sim——sim 里没有真参数可转，就是装饰不是互动。建议每课至少 1 个 quiz。{"用户点名的交互: " + wants if wants else ""}
- **`sim` + `engine:"widget"`**：当一个过程要靠**实时动画/canvas 波形粒子/几何作图/任意鼠标交互**才讲得清（如排序·查找·图遍历的分步动画、单摆/阻尼振子等二阶运动、向量/边界作图）——注册表引擎(dynamics1d/searchCompare)与声明式 block 都表达不了——就在骨架里给该 sim 标 `engine:"widget"`，通常给 size `l`/`xl` 并独占一页。按"贴不贴题"判断：贴题就用、别套模板、也别回避。
- **先用声明式 sim 再升级 widget**：只有一个标量状态、形如 `x_(t+1)=g(x_t, 参数)` 的一阶递推及其轨迹，直接用普通 `sim`（不写 engine，后续走 dynamics1d）；不要为了画一个移动点/箭头就升级 widget。只有二维几何、连续场、粒子/canvas、复杂鼠标作图或声明式引擎确实无法编码的状态才写 `engine:"widget"`。widget 每块要额外经历 plan→build→validate，滥用会显著放大延迟与失败面。
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

    return side + full_n + formula_data_n + split_n + used + computed_n


def _coverage_text(perspectives: list[dict[str, Any]]) -> str:
    """把 STORM 视角提炼成"覆盖清单"文本（单次/分层两路共用）。"""
    if not perspectives:
        return ""
    return "下面是多个教学视角提炼的**覆盖清单**（在骨架里系统覆盖、组织成连贯递进的线）：\n" + "\n".join(
        f"【{p.get('name')}·{p.get('focus')}】\n  必讲: {'；'.join(p.get('mustCover') or [])}\n  疑问: {'；'.join(p.get('questions') or [])}"
        for p in perspectives
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
    target = max(4, pages - 2)  # 预留封面 + 收尾
    n_sec = max(2, round(target / 6))  # 每章 ~6 页，steer 到合适粒度
    sys = (
        "你是课程总设计师。为一节较长的讲义先出**顶层大纲**：把课题切成若干连贯递进的章节。"
        f"目标约 {n_sec} 章、每章 4–7 页，各章 pageBudget 之和≈{target}。只输出 JSON：\n"
        '{ "title":"课题标题", "subtitle":"副题(可选)", "theme":"主题名(从下方菜单;不确定给 slate)", '
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
    budgets = _normalize_budgets([int(s.get("pageBudget", 5) or 5) for s in secs], target)
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
    return [s for s in scenes if s.get("kind") != "hero"]


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
    perspectives = await _discover_coverage(
        llm, topic=topic, audience=audience, extra=extra, material=material, n=perspectives_n
    )
    coverage = _coverage_text(perspectives)

    if pages > _HIER_THRESHOLD:
        return await _plan_hierarchical(
            llm,
            topic=topic, pages=pages, theme=theme, audience=audience, wants=wants, extra=extra,
            material=material, type_menu=type_menu, theme_menu=theme_menu,
            authoring_rules=authoring_rules, perspectives=perspectives, coverage=coverage,
            concurrency=concurrency,
        )

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
            if sections:
                await insert_sections(llm, doc, budget=pages)
            return PlanResult(doc=doc, perspectives=perspectives)
        except Exception as e:  # noqa: BLE001
            last_err = e
            if isinstance(e, TimeoutError):
                break
            if attempt < 3:
                await asyncio.sleep(3.0 * attempt)
    raise RuntimeError(f"骨架生成失败（网络/限流/解析）: {str(last_err)[:100]}")
