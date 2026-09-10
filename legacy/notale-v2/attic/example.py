"""完整实例:火箭与轨道,90 分钟。跑法 `python3 core/example.py`,产出 EXAMPLE.md。

这份实例是拿来审阅 schema 的,所以内容是真写的,不是占位符 —— 占位符看不出
schema 哪里不够用。
"""

from __future__ import annotations

import json, pathlib, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from core.schema import (
    Canvas, Chassis, Computation, Deck, Finding, Invariant, LibEntry,
    PagePlan, PageSubmission, PageVerdict, PlanSubmission, Rejected,
    RenderReport, Segment, StylePack, TextBudget, Term,
)
from core.trace import TraceRow, responses, span, usage_of
from core.views import build_view, plan_view, repair_view
from legacy.harness.wire import Message, Request, TextBlock, ToolDef

# =====================================================================
# 1. Invariant
# =====================================================================

INV = Invariant(
    query="火箭与轨道 —— 怎么把东西送上太空,并让它待在那儿",
    minutes=90,
    audience="学过一点力学、没接触过轨道的高中生",
    canvas=Canvas(),
    style=StylePack(
        palette={
            "void": "#05070A",     # 底
            "steel": "#C9D4E2",    # 正文
            "burn": "#FF5E1A",     # 推进、点火、消耗
            "plasma": "#35E0D8",   # 轨道、速度
            "rule": "#1B2634",     # 分隔
        },
        display_font="Chakra Petch",
        body_font="IBM Plex Sans",
        mono_font="IBM Plex Mono",
        type_scale={"h1": 56, "h2": 34, "body": 18, "label": 15, "tick": 13},
        spacing=[4, 8, 12, 20, 32, 56],
        signature="右下角那根 Δv 预算条:从第 3 页起每页都在,花掉多少就少一截,最后一页把它摞完",
    ),
    chassis=Chassis(css_path="assets/base.css", js_path="assets/base.js").stamp(
        b"/* base.css */", b"/* base.js */"
    ),
    libs=[
        LibEntry(file="assets/lib/three.min.js", globals="THREE", version="r160",
                 use_for="三维场景、可旋转的立体结构",
                 caveat="outputColorSpace 时代,不是 outputEncoding"),
        LibEntry(file="assets/lib/globe.gl.min.js", globals="Globe", version="2.32.0",
                 use_for="三维地球、球面上的点和弧线",
                 after=["assets/lib/three.min.js"]),
        LibEntry(file="assets/lib/matter.min.js", globals="Matter", version="0.20.0",
                 use_for="拖拽、堆叠、碰撞、约束"),
        LibEntry(file="assets/lib/d3.min.js", globals="d3", version="7.9.0",
                 use_for="精确控制的矢量图形、坐标轴、数据绑定"),
        LibEntry(file="assets/lib/gsap.min.js", globals="gsap", version="3.12.5",
                 use_for="多个动画按一条时间线精确编排"),
    ],
    env={"node": "v20.20.2", "python3": "3.12 + numpy 2.5.1", "浏览器": "playwright + chromium"},
)

# =====================================================================
# 2. 词汇表 —— 跨页连贯的全部依据
# =====================================================================

TERMS = [
    Term(key="g", name="g", kind="notation", unit="m/s²",
         definition="地表重力加速度 9.8;随高度按平方反比衰减,凡写 g 都指地表值"),
    Term(key="v", name="v", kind="notation", unit="m/s",
         definition="物体相对地心的速度大小,不含方向"),
    Term(key="orbit", name="轨道", kind="concept",
         definition="物体只受引力时走出的闭合路径;这堂课只谈二体,忽略月球和太阳"),
    Term(key="v_circ", name="v_圆", kind="notation", unit="m/s",
         definition="在给定高度维持圆轨道所需的速度,近地约 7.9 km/s"),
    Term(key="dv", name="Δv", kind="notation", unit="m/s",
         definition="速度增量。火箭的能力和任务的代价都折算成它,这堂课所有的账都用它记"),
    Term(key="mass_ratio", name="质量比 R", kind="notation",
         definition="起飞质量除以燃尽质量,恒大于 1"),
    Term(key="isp", name="比冲 Isp", kind="notation", unit="s",
         definition="发动机效率;乘 g 得到排气速度"),
    Term(key="kepler", name="面积速度守恒", kind="concept",
         definition="连接物体与地心的线段,在相等时间里扫过相等面积"),
    Term(key="hohmann", name="霍曼转移", kind="concept",
         definition="两次切向点火在两个圆轨道之间转移,是最省 Δv 的两脉冲方案"),
]

# =====================================================================
# 3. 页
# =====================================================================

P = [
    PagePlan(
        id="page-01", segment="s1", role="hook",
        takeaway="把东西送上天,难的从来不是「扔得高」。",
        beats=["扔一块石头,看它落回来",
               "初速度一点点加大,最高点越来越高、滞空越来越久",
               "加到某个值它不再落回来 —— 但它也并没有「待在天上」"],
        interaction="拖一根竖直的速度条给石头初速度,松手后它按真实重力上升下落并留下轨迹;"
                    "右侧实时读出最高点高度和飞行时间,前几次的轨迹淡着留在画面上可以对比",
        rejected=[
            Rejected(form="不同高度的静态对比图",
                     why="这一页全部的说服力在「再快一点会怎样」这个连续变化上,切成几张恰好把它删掉"),
            Rejected(form="直接给出逃逸速度的数值",
                     why="数字记不住,而且会坐实「上天=扔得快」这个误解,第 2 页要纠正的正是它"),
        ],
        computation=Computation(what="一维变重力场下的运动积分,g 随高度按平方反比衰减",
                                method="iterative", frame_budget_ms=4.0),
        establishes=["g", "v"],
    ),
    PagePlan(
        id="page-02", segment="s1", role="build",
        takeaway="待在天上不是被托住,是掉得足够快以至于一直掉不到地面。",
        beats=["山顶架一门炮,水平打出去",
               "速度小 → 抛物线落地;加大 → 落点越来越远",
               "某个速度之后它绕回了出发点:这就是轨道",
               "再加 → 椭圆拉长 → 不再闭合"],
        interaction="拖炮口速度滑块,弹道实时在抛物线 / 椭圆 / 圆 / 逃逸之间连续变形;"
                    "地球按真实半径比例画,轨道类型和当前速度同步标出,可以停在临界点附近反复来回",
        rejected=[
            Rejected(form="并排三张不同速度的轨迹图",
                     why="三张之间的过渡才是这一页的内容"),
            Rejected(form="自动播放速度由小到大的动画",
                     why="「临界」这个概念只有自己在临界点两侧来回拖才建立得起来"),
        ],
        computation=Computation(what="二体引力下的轨迹数值积分,同时判定轨道类型",
                                method="simulation", frame_budget_ms=6.0),
        assumes=["v"], establishes=["orbit", "v_circ"],
    ),
    PagePlan(
        id="page-03", segment="s1", role="build",
        takeaway="去任何地方的代价,都可以写成一笔速度的账。",
        beats=["把「要多快」换算成「要买多少速度」",
               "近地轨道 / 同步轨道 / 月球 / 火星,各自的价签",
               "预算是可加的,而且不可透支"],
        interaction="一根 Δv 预算条,把不同任务目标拖上去,条子按真实数据切成几段;"
                    "超出当前火箭能力的部分立刻变灰,读者可以试着重新组合目标把它凑进预算里",
        rejected=[
            Rejected(form="列各目标 Δv 的表格", why="表格读不出「预算」这个感觉,而这一页就是要建立预算感"),
            Rejected(form="饼图", why="Δv 是可加的一维量,饼图会暗示它是占比"),
        ],
        computation=Computation(what="各任务段 Δv 的闭式求和与余量判定",
                                method="closed_form", lib="assets/lib/d3.min.js"),
        assumes=["v_circ"], establishes=["dv"],
        libs=["assets/lib/d3.min.js"],
    ),
    PagePlan(
        id="page-04", segment="s2", role="build",
        takeaway="火箭必须一路扔掉自己,因为它要加速的大部分是燃料本身。",
        beats=["推力来自往后扔东西",
               "扔得越快、扔掉的比例越大,拿到的 Δv 越多",
               "但结构不能为零 —— 这是天花板的来源"],
        interaction="两个滑块:质量比和比冲。右边一枚火箭按比例实时画出燃料舱与结构,"
                    "顶部读出它能拿到的 Δv;把结构质量拖向 0 可以看到理论极限,以及它为什么到不了",
        rejected=[
            Rejected(form="先给出齐奥尔科夫斯基公式再逐项解释",
                     why="公式是这一页的结论不是起点;先给公式读者只会去背它"),
            Rejected(form="输入数字算 Δv 的计算器",
                     why="输入框把连续的直觉压成离散的几次尝试"),
        ],
        computation=Computation(what="齐奥尔科夫斯基方程,以及结构质量约束下的可行域边界",
                                method="closed_form"),
        assumes=["dv"], establishes=["mass_ratio", "isp"],
    ),
    PagePlan(
        id="page-05", segment="s2", role="practice",
        takeaway="分级不是为了更高级,是为了不再带着空壳加速。",
        beats=["搭一枚自己的火箭:几级、每级多少燃料",
               "点火,看它能不能上去",
               "同样的总质量,分级方式不同结果差很远"],
        interaction="拖拽积木式地堆叠火箭级,每级选燃料量和发动机型号;点火后真实模拟上升段,"
                    "推力不够会掉回来、分级时机不对会浪费;右下角 Δv 预算条实时消耗,可以无限重来",
        rejected=[
            Rejected(form="给几个预设方案让读者挑",
                     why="挑选不产生「我为什么这样分配」的推理"),
            Rejected(form="只算最终 Δv、不做飞行模拟",
                     why="数值对了但读者没有「它真的上去了」的体感,而这是整堂课的高潮"),
        ],
        computation=Computation(what="逐级质量分配的数值搜索,叠加上升段的重力损失积分",
                                method="search", lib="assets/lib/matter.min.js",
                                frame_budget_ms=8.0),
        assumes=["dv", "mass_ratio", "isp"],
        libs=["assets/lib/matter.min.js", "assets/lib/gsap.min.js"],
        avoid=["Δv 预算条(第 3 页已经用过,这里只作为角落里的读数出现)"],
    ),
    PagePlan(
        id="page-06", segment="s2", role="consolidate",
        takeaway="真实火箭的样子,是这几个量互相妥协的结果。",
        beats=["土星五号 / 猎鹰 9 / 长征五号的剖面并排",
               "每一处结构对应回前面的哪一个量",
               "把自己第 5 页搭的那枚放进来比一比"],
        interaction="点击任一段结构,高亮它对应的量并显示真实数值;可以调出自己上一页的方案叠上去对比",
        rejected=[
            Rejected(form="型号参数表", why="表格不产生「这些数字互相牵制」的感觉"),
        ],
        computation=Computation(
            what="不需要。这一页是对照和归位,数值全是查表得到的历史数据;"
                 "做成可调的现场计算,反而会让读者以为这些型号的参数当年是自由选的",
            method="none"),
        assumes=["isp", "mass_ratio"],
        budget=TextBudget(body_chars=520, label_chars=300, controls=4),
    ),
    PagePlan(
        id="page-07", segment="s3", role="build",
        takeaway="轨道不是一条画在天上的线,它是高度、速度和方向三者锁死的结果。",
        beats=["三维地球,一颗卫星",
               "改高度 → 周期跟着变;改倾角 → 地面航迹跟着变",
               "关掉引力试试:它直着飞走了"],
        interaction="可旋转的三维地球,拖动卫星改变高度和倾角,轨道面与地面航迹实时重画;"
                    "有一个「关掉引力」的开关,按下去卫星沿切线直着飞出去",
        rejected=[
            Rejected(form="二维俯视示意图",
                     why="倾角和轨道面在二维里表达不出来,而它们是这一页的全部内容"),
            Rejected(form="播放真实轨道录像", why="不能改参数就建立不起「高度决定周期」这个因果"),
        ],
        computation=Computation(what="轨道根数到三维位置的实时换算,含地球自转下的地面航迹",
                                method="simulation", lib="assets/lib/globe.gl.min.js"),
        assumes=["orbit"],
        libs=["assets/lib/three.min.js", "assets/lib/globe.gl.min.js"],
    ),
    PagePlan(
        id="page-08", segment="s3", role="build",
        takeaway="椭圆轨道上快慢不均,但扫过的面积始终均匀。",
        beats=["一条明显偏心的椭圆轨道",
               "把卫星拖到近地点附近:同样时间扫出又短又胖的扇形",
               "拖到远地点:又长又瘦 —— 面积一样"],
        interaction="拖动卫星到轨道上任意位置,实时画出它在固定时间内扫过的扇形;"
                    "同时保留另一个位置的扇形做并排比较,两块面积的数值始终相等",
        rejected=[
            Rejected(form="逐条讲开普勒三定律",
                     why="另外两条这堂课后面用不到,讲了只占注意力"),
            Rejected(form="自动演示面积相等的动画",
                     why="读者会当成动画的设定;自己拖着看才会信"),
        ],
        computation=Computation(what="开普勒方程的数值求解,以及扇形面积的实时积分",
                                method="iterative", lib="assets/lib/d3.min.js"),
        assumes=["orbit"], establishes=["kepler"],
        libs=["assets/lib/d3.min.js"],
    ),
    PagePlan(
        id="page-09", segment="s3", role="practice",
        takeaway="换轨道靠的不是推得更用力,是在正确的时刻推。",
        beats=["你在低轨,想去高轨",
               "点火时刻选错,得到的是一条歪掉的椭圆",
               "两次切向点火,一次抬远地点一次圆化",
               "省下来的 Δv 就是省下来的燃料"],
        interaction="操控一艘低轨飞船,自己选点火时刻和推力大小;点早点晚都会得到错误的椭圆,"
                    "Δv 预算条实时扣减,可以无限重来;成功后叠出最省的那条给你对照",
        rejected=[
            Rejected(form="给出霍曼转移的两次 Δv 数值让读者验证",
                     why="验证不产生「时机」这个直觉,而时机是这一页唯一想给的东西"),
            Rejected(form="自动演示一次完美转移",
                     why="看别人做对,学不到为什么别的时刻是错的"),
        ],
        computation=Computation(what="二体轨道的实时数值积分,脉冲点火后重新求解轨道根数",
                                method="simulation", lib="assets/lib/three.min.js",
                                frame_budget_ms=8.0),
        assumes=["orbit", "dv", "kepler"], establishes=["hohmann"],
        libs=["assets/lib/three.min.js"],
        budget=TextBudget(body_chars=380, label_chars=240, controls=4),
        avoid=["三维地球(第 7 页已经用过,这里用轨道平面的正视图)"],
    ),
    PagePlan(
        id="page-10", segment="s3", role="build",
        takeaway="低轨不是永久的;空间站每隔一阵就得把自己推回去。",
        beats=["把卫星放在不同高度",
               "快进时间,看轨道一圈圈收缩",
               "300 公里是几个月,800 公里是几百年"],
        interaction="一个高度滑块加一条可拖的时间轴;快进时轨道半径实时收缩,"
                    "落回大气的时刻标在时间轴上,可以并排放两颗不同高度的卫星比寿命",
        rejected=[
            Rejected(form="大气密度随高度的曲线图", why="曲线本身不吓人,轨道一圈圈掉下来才吓人"),
            Rejected(form="一句「有阻力所以会掉」", why="读者会以为这是个小修正,而它决定了空间站必须定期抬轨"),
        ],
        computation=Computation(what="指数大气模型下的阻力摄动积分,步长随快进倍率自适应",
                                method="iterative", lib="assets/lib/d3.min.js"),
        assumes=["orbit", "g"],
        libs=["assets/lib/d3.min.js"],
    ),
    PagePlan(
        id="page-11", segment="s4", role="consolidate",
        takeaway="从地面到目的地,全程是一笔可以从头摞到尾的账。",
        beats=["把前面每一页产生的 Δv 逐项摞起来",
               "点任意一段,回到它来自哪一页的哪个设定",
               "最后留一段空的:你想去哪儿"],
        interaction="一根摞满的 Δv 预算条,每一段可点击回溯到对应页的那个决定;"
                    "末端留白让读者填自己的目标,系统算出还差多少、要怎么补",
        rejected=[
            Rejected(form="逐节文字总结", why="总结不产生新的理解"),
            Rejected(form="知识点思维导图", why="导图会把「代价」这条主线拆散"),
        ],
        computation=Computation(what="全程 Δv 的分段求和与余量核算",
                                method="closed_form", lib="assets/lib/d3.min.js"),
        assumes=["dv", "hohmann", "orbit"],
        libs=["assets/lib/d3.min.js"],
    ),
]

SEGS = [
    Segment(id="s1", title="为什么上不去", minutes=20,
            goal="把「上天」从「扔得高」扭成「扔得快」,并让读者第一次看见轨道",
            pages=[p for p in P if p.segment == "s1"]),
    Segment(id="s2", title="火箭方程", minutes=25,
            goal="让读者亲手体会到:要加速的大部分是燃料自己,分级是唯一的出路",
            pages=[p for p in P if p.segment == "s2"]),
    Segment(id="s3", title="待在那儿", minutes=30,
            goal="从「上去了」过渡到「留得住」:轨道的形状、快慢、转移和衰减",
            pages=[p for p in P if p.segment == "s3"]),
    Segment(id="s4", title="合起来", minutes=15,
            goal="把全程折成一笔账,让读者自己填最后一段",
            pages=[p for p in P if p.segment == "s4"]),
]

DECK = Deck(invariant=INV, terms={t.key: t for t in TERMS}, segments=SEGS,
            trace="runs/orbit-01/trace.jsonl")

# =====================================================================
# 4. view → 删减后的 wire 请求
# =====================================================================

HARNESS_ID = "你在给一套互动讲义写页面。只输出被要求的东西,不写说明文档、测试或总结。"


def to_request(view, tools: list[ToolDef], effort: str = "medium") -> Request:
    """prefix 进 system 并打 cache 断点,body 进 user —— 断点位置照抄 Claude Code。"""
    return Request(
        model="claude-opus-5",
        system=[
            TextBlock(text=HARNESS_ID, cache_control={"type": "ephemeral"}),
            TextBlock(text=view.prefix, cache_control={"type": "ephemeral"}),
        ],
        messages=[Message(role="user", content=[TextBlock(text=view.body)])],
        tools=tools,
        output_config={"effort": effort},
    )


PLAN_TOOL = ToolDef(
    name="submit_plan",
    description="交出整套讲义的规划。term 图要整体校验,所以一次交完。",
    input_schema=PlanSubmission.model_json_schema(),
)
PAGE_TOOL = ToolDef(
    name="submit_page",
    description="这一页写完后调用。内容装不下就报 needs_split,不要压字号塞进去。",
    input_schema=PageSubmission.model_json_schema(),
)

# =====================================================================
# 5. 闸门产物
# =====================================================================

VERDICT = PageVerdict(
    page="page-09",
    attempt=1,
    findings=[
        Finding(gate="font-floor", severity="block", where="page-09.html:142 .burn-readout",
                what="11px,刻度类地板是 12px", fix_hint="改 13px;字阶里 tick 就是 13"),
        Finding(gate="mechanism", severity="block", where="page-09.html 全文",
                what="没有 prefers-reduced-motion 分支,轨道动画无法停",
                fix_hint="base.js 的 Deck.loop 已经处理了,直接用它替掉自建的 requestAnimationFrame"),
        Finding(gate="dead-code", severity="warn", where="page-09.html:301",
                what="hohmannPreview() 定义了没被调用"),
    ],
    render=RenderReport(js_errors=[], failed_resources=[], escaped=[],
                        clipped=[".hint-row 被 overflow:hidden 裁掉 8px"],
                        font_min=11.0, font_median=15.0, shot="shots/page-09.png"),
)

# =====================================================================
# 6. trace 样例:一次并行派发
# =====================================================================

S = "7e7a7a6a-57c8-488e-ac7b-6339d5182610"
TRACE = [
    # 父 agent 在同一条消息里写出三个 tool_use —— 注意时间戳是**逐个**递增的,
    # 因为 block 是边流式输出边派发的,不是同时起跑。
    TraceRow(uuid="a1", parentUuid=None, sessionId=S, isSidechain=False,
             timestamp="2026-08-15T02:10:00.000Z", type="assistant", requestId="req_A",
             message={"role": "assistant", "content": [{"type": "thinking"}],
                      "usage": {"input_tokens": 18402, "output_tokens": 2}}),
    TraceRow(uuid="a2", parentUuid="a1", sessionId=S, isSidechain=False,
             timestamp="2026-08-15T02:10:41.300Z", type="assistant", requestId="req_A",
             message={"role": "assistant",
                      "content": [{"type": "tool_use", "name": "Agent", "id": "tu_09"}],
                      "usage": {"input_tokens": 18402, "output_tokens": 3117,
                                "cache_read_input_tokens": 17960}}),
    TraceRow(uuid="a3", parentUuid="a2", sessionId=S, isSidechain=False,
             timestamp="2026-08-15T02:11:22.800Z", type="assistant", requestId="req_A",
             message={"role": "assistant",
                      "content": [{"type": "tool_use", "name": "Agent", "id": "tu_10"}],
                      "usage": {"input_tokens": 18402, "output_tokens": 5904,
                                "cache_read_input_tokens": 17960}}),
    # 子 agent 自己的行。完成时刻只能从这里取。
    TraceRow(uuid="c1", parentUuid="a2", sessionId=S, isSidechain=True,
             timestamp="2026-08-15T02:11:03.100Z", type="assistant", requestId="req_B",
             message={"role": "assistant", "content": [{"type": "text"}],
                      "usage": {"input_tokens": 9871, "output_tokens": 2}}),
    TraceRow(uuid="c2", parentUuid="c1", sessionId=S, isSidechain=True,
             timestamp="2026-08-15T02:24:47.900Z", type="assistant", requestId="req_B",
             message={"role": "assistant",
                      "content": [{"type": "tool_use", "name": "submit_page"}],
                      "usage": {"input_tokens": 9871, "output_tokens": 41220,
                                "cache_read_input_tokens": 9600}}),
    # 父 agent 收到 tool_result —— 这条的时间戳是**派发**语义,不是完成语义。
    TraceRow(uuid="a4", parentUuid="a2", sessionId=S, isSidechain=False,
             timestamp="2026-08-15T02:11:22.900Z", type="user",
             message={"role": "user", "content": [{"type": "tool_result",
                                                   "tool_use_id": "tu_09"}]},
             toolUseResult={"agentId": "page-09"}),
]


# =====================================================================
# 7. 生成 EXAMPLE.md
# =====================================================================

def j(x, limit=None):
    s = json.dumps(x, ensure_ascii=False, indent=2)
    if limit and len(s) > limit:
        s = s[:limit] + f"\n  … 共 {len(s)} 字符,此处截断"
    return s


def main():
    L: list[str] = []
    add = L.append

    add("# context schema 完整实例 —— 火箭与轨道,90 分钟\n")
    add("由 `core/example.py` 生成。内容是真写的,不是占位符 —— 占位符看不出 schema 哪里不够用。\n")
    add("---\n")

    # ---- §1
    add("## 1. 领域状态:Deck\n")
    add(f"- segment {len(DECK.segments)} 个,合计 "
        f"{sum(s.minutes for s in DECK.segments)} 分钟")
    add(f"- **页数 {DECK.total} —— 派生量**。schema 里没有任何字段能设定它,"
        f"`Deck.total` 就是 `len(pages)`,只读")
    add(f"- term {len(DECK.terms)} 个")
    add(f"- 真实计算的页 {sum(1 for p in DECK.pages if p.computation.method != 'none')} / "
        f"{DECK.total},唯一一页 `none` 写了理由\n")
    add("每页一行:\n")
    add("| 页 | 段 | 作用 | 计算 | establishes | assumes | 库 |")
    add("|---|---|---|---|---|---|---|")
    for p in DECK.pages:
        add(f"| `{p.id}` | {p.segment} | {p.role} | {p.computation.method} | "
            f"{' '.join(p.establishes) or '—'} | {' '.join(p.assumes) or '—'} | "
            f"{' '.join(f.split('/')[-1] for f in p.libs) or '—'} |")
    add("")
    add("一页的完整长相(`page-09`):\n")
    add("```json")
    add(j(DECK.page("page-09").model_dump(mode="json")))
    add("```\n")

    # ---- §2
    add("## 2. term 图:隔离条件下唯一的连贯性来源\n")
    add("subagent 之间互相看不见,所以「第 9 页要沿用第 2 页的记号」不能靠去读第 2 页。")
    add("改成:第 2 页 `establishes`,第 9 页 `assumes`,harness 把定义原样塞进第 9 页的 view。\n")
    add("```")
    owner = {k: p.id for p in DECK.pages for k in p.establishes}
    for t in TERMS:
        users = [p.id for p in DECK.pages if t.key in p.assumes]
        add(f"{t.name:12} {owner[t.key]}  ──▶  {', '.join(users) if users else '(暂无人沿用)'}")
    add("```\n")
    add("这张图在规划期静态校验,三种错在任何 token 花出去之前就报出来:")
    add("悬空引用、前向引用(assume 了更靠后的页才引入的记号)、两页重复 establish 同一个记号。")
    add("最后一种正是跨页不一致的源头,而且没有任何人会读到对方去发现它。\n")

    # ---- §3
    add("## 3. 规划调用\n")
    pv = plan_view(DECK)
    req = to_request(pv, [PLAN_TOOL], effort="high")
    add(f"view:prefix {len(pv.prefix)} 字符 + body {len(pv.body)} 字符\n")
    add("### 3.1 prefix(全套共享,逐字节相同)\n")
    add("```")
    add(pv.prefix)
    add("```\n")
    add("### 3.2 body\n")
    add("```")
    add(pv.body)
    add("```\n")
    add("### 3.3 删减后的 wire 请求\n")
    d = req.model_dump(mode="json", exclude_none=True)
    add("```json")
    add(j({**d,
           "system": [{"text": f"<{len(b['text'])} 字符>",
                       "cache_control": b.get("cache_control")} for b in d["system"]],
           "messages": [{"role": "user",
                         "content": [{"type": "text", "text": f"<{len(pv.body)} 字符>"}]}],
           "tools": [{"name": PLAN_TOOL.name, "description": PLAN_TOOL.description,
                      "input_schema": "<见下>"}]}))
    add("```\n")
    add(f"`submit_plan.input_schema` 由 `PlanSubmission.model_json_schema()` 直接得到,"
        f"{len(json.dumps(PLAN_TOOL.input_schema))} 字节,顶层:\n")
    add("```json")
    add(j({"type": "object",
           "required": PLAN_TOOL.input_schema.get("required"),
           "properties": {k: "…" for k in PLAN_TOOL.input_schema["properties"]},
           "$defs": list(PLAN_TOOL.input_schema.get("$defs", {}))}))
    add("```\n")
    add("模型不写自由文本,只填 `tool_use.input`;填出来的东西就是 `PlanSubmission` 实例,"
        "验证不过就重来。**领域层不是从 Claude Code 的 schema 删减来的,但它挂在 tool_use 这个槽位上。**\n")

    # ---- §4
    add("## 4. 单页构建调用(`page-09`)\n")
    bv = build_view(DECK, "page-09")
    add(f"prefix {len(bv.prefix)} 字符,和规划调用的 prefix **逐字节相同**"
        f"(`{'一致' if bv.prefix == pv.prefix else '不一致'}`)。")
    add("prefix 里不含页数、不含页 id —— 拆一次页如果会改动它,缓存和已派发的任务就全废。\n")
    add("### 4.1 body(这一页拿到的全部内容)\n")
    add("```")
    add(bv.body)
    add("```\n")
    add("### 4.2 隔离是结构性的\n")
    other = [p for p in DECK.pages if p.id != "page-09"]
    leak = [p.id for p in other if p.id in bv.text() or p.takeaway in bv.text()]
    add("```")
    add(f"别的页 id / takeaway 出现在 view 里的:{leak or '无'}")
    add(f"总页数 {DECK.total} 出现在 prefix 里:{'是' if str(DECK.total) in pv.prefix else '否'}")
    add(f"assume 的 3 个 term 定义已解析进 body:"
        f"{all(DECK.terms[k].definition in bv.body for k in DECK.page('page-09').assumes)}")
    add("```\n")
    add("不是过滤掉的,是 `build_view(deck, pid)` 根本没有取别页的那条路径。")
    add("上一轮那句「不许读别的页面」写在指令里靠模型自觉 —— 实测加了检测器才发现真有跨页读取。\n")

    # ---- §5
    add("## 5. 闸门与修复\n")
    add("```json")
    add(j(VERDICT.model_dump(mode="json")))
    add("```\n")
    add(f"`blocked = {VERDICT.blocked}`(有 block 级 finding)。注意 `RenderReport` 里"
        "**没有 verdict 字段** —— 一旦无头渲染自带结论,字号地板就从硬约束偷偷变成"
        "「渲染脚本认为可以」,判定标准散到两个地方去。它只报告。\n")
    add("修复调用复用同一个 prefix,body 只在末尾追加这一页自己的结论:\n")
    rv = repair_view(DECK, "page-09", VERDICT.findings)
    add("```")
    add(rv.body[len(bv.body):].strip())
    add("```\n")
    add(f"prefix 仍然逐字节相同(`{rv.prefix == pv.prefix}`),所以返工不重新付前缀的钱。")
    add("给的是定位到行的确定性结论,不是「再检查一下」—— 实测返工吃掉 12:08,"
        "大头是模型拿到模糊反馈后自己重新找问题。\n")

    # ---- §6
    add("## 6. 记录层:从 Claude Code 的 transcript 删减\n")
    add("nn-03 的 346 行里出现过 35 个字段,留 9 个。**字段名逐字照抄**,")
    add("`lab/timing.py` 和 `lab/audit.py` 一行不改就能审计我们自己的 harness。\n")
    add("```json")
    add(j([r.model_dump(mode="json", exclude_none=True) for r in TRACE[:2]]))
    add("```\n")
    add("三条合并规则写成了代码,因为这三个坑都踩过:\n")
    g = responses(TRACE)
    add("```")
    add(f"按 requestId 分组 → {len(g)} 次响应,而不是 {len(TRACE)} 行")
    add("  (按行数判断并行度会得出「其实是串行的」这种错误结论)")
    for rid, rows in g.items():
        u = usage_of(rows)
        first = (rows[0].message.get("usage") or {}).get("output_tokens")
        add(f"  {rid}: {len(rows)} 行,取首行 usage = {first} tok,"
            f"正确值 = {u.output_tokens} tok,cache_read = {u.cache_read_input_tokens}")
    add("  (只有一组里最后一行的 usage 是完整的,前面带占位值 output_tokens:2)")
    disp, fin = span([r for r in TRACE if r.uuid in ("a2", "a4")],
                     [r for r in TRACE if r.isSidechain])
    add("")
    add(f"派发 {disp}   ← 父 agent 写完这个 tool_use block 的时刻")
    add(f"完成 {fin}   ← 只能从 isSidechain 的行取")
    add("  (父 agent 那条 tool_result 的时间戳也是派发语义 —— 02:11:22.9,")
    add("   拿它当完成时刻会算出 0:00,真实耗时是 13:26)")
    add("")
    add("同一条消息里的两个 Agent 派发时刻:02:10:41.3 与 02:11:22.8,差 41.5 秒")
    add("  (block 是边流式输出边派发的,不是同时起跑;实测 14 个 brief 拉开 6:24)")
    add("```\n")

    # ---- §7
    add("## 7. wire 请求删了什么\n")
    add("| Claude Code 顶层字段 | 我们 | 理由 |")
    add("|---|---|---|")
    for k, keep, why in [
        ("model / messages / system / tools / max_tokens / stream", "留", "API 面"),
        ("thinking", "留", "`{type: adaptive}`"),
        ("output_config", "留", "`effort` 按调用类型给:规划 high,构建 medium"),
        ("metadata", "✂", "device_id + account_uuid,CLI 的计费归属"),
        ("context_management", "✂", "`clear_thinking` 是给长对话省 token 的;构建调用一次性,留着只会掩盖真实 token 曲线"),
        ("system[0] billing header", "✂", "`x-anthropic-billing-header: cc_version=…`"),
    ]:
        add(f"| {k} | {keep} | {why} |")
    add("")
    add("四种 content block(`text` / `thinking`+signature / `tool_use` / `tool_result`)一个不删。\n")
    add("`system` 保留成 list 而不是压成一个字符串,唯一目的是保住 **cache 断点的位置**:")
    add("Claude Code 把断点打在稳定前缀之后,可变部分留在断点之后 —— 这就是 View 的 prefix / body 划分,")
    add("边界不用我们自己试。\n")

    out = pathlib.Path(__file__).resolve().parents[1] / "EXAMPLE.md"
    out.write_text("\n".join(L), encoding="utf-8")
    print(f"写好了: {out}  ({out.stat().st_size} 字节, {len(L)} 行)")
    print(f"Deck 校验通过,页数派生 = {DECK.total},prefix {len(pv.prefix)} 字符")


if __name__ == "__main__":
    main()
