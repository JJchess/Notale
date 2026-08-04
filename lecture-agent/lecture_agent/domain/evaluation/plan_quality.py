"""fan-out 前的整份骨架审查：修复需要换页目标/组件组合的规划级问题。"""

from __future__ import annotations

import asyncio
import json
import re
from typing import Any

from ...ports.llm import LLMClient
from ...utils.jsonio import parse_json

_PLAN_REVIEW_TIMEOUT_S = 300.0
_PAGE_REPLAN_TIMEOUT_S = 240.0

_SIM_CAPABILITIES = frozenset({"sim", "state-sim", "model-sim", "geometry-sim"})


def _is_sim_type(block_type: Any) -> bool:
    return str(block_type or "") in _SIM_CAPABILITIES


def _sim_type_for(profile: str, allowed_types: set[str]) -> str:
    preferred = f"{profile}-sim"
    if preferred in allowed_types:
        return preferred
    return "sim" if "sim" in allowed_types else ""


def _explicit_sim_profile(brief: dict[str, Any]) -> str | None:
    text = " ".join(
        str(brief.get(key) or "").lower()
        for key in ("objective", "learningAction", "requiredEvidence", "visualTask")
    )
    # Structural transitions win even when their stage happens to use coordinates or dragging.
    # Spatial placement is not geometry evidence (for example, an AVL rotation).
    if any(
        token in text
        for token in (
            "state sequence", "state transition", "intermediate state", "step-by-step",
            "structure transformation", "structure mutation", "before and after",
            "trace", "step through", "play back", "replay", "rotation", "insertion", "deletion",
            "状态序列", "状态转移", "中间状态", "逐步执行", "每一步",
            "结构变换", "结构变化", "结构演化", "前后状态", "单步", "回放",
            "旋转", "插入", "删除",
        )
    ):
        return "state"
    if any(
        token in text
        for token in (
            "coordinate", "constraint", "contour", "surface", "boundary", "drag",
            "spatial invariant", "坐标", "约束", "等高线", "曲面", "边界", "拖拽",
            "几何不变量",
        )
    ):
        return "geometry"
    if any(
        token in text
        for token in (
            "parameter", "recompute", "quantitative causal", "math model",
            "参数", "重算", "定量因果", "数学模型",
        )
    ):
        return "model"
    return None


def _sim_profile_for_brief(brief: dict[str, Any]) -> str:
    explicit = _explicit_sim_profile(brief)
    if explicit:
        return explicit
    return "model"


def _normalize_sim_profile_routes(
    doc: dict[str, Any], allowed_types: set[str]
) -> list[str]:
    """Align planner-selected sim capabilities with explicit evidence semantics."""
    warnings: list[str] = []
    for scene in doc.get("scenes") or []:
        brief = scene.get("brief") if isinstance(scene.get("brief"), dict) else {}
        profile = _explicit_sim_profile(brief)
        replacement = _sim_type_for(profile, allowed_types) if profile else ""
        if not replacement:
            continue
        for block in scene.get("blocks") or []:
            current = str(block.get("type") or "")
            if current not in _SIM_CAPABILITIES or current == replacement:
                continue
            block["type"] = replacement
            if replacement == "sim":
                block["engine"] = "widget"
            else:
                block.pop("engine", None)
            warnings.append(
                f"规划能力归一化 {scene.get('id') or '?'}：{current} → {replacement}（依据学习证据）"
            )
    return warnings


async def refine_plan(
    llm: LLMClient,
    doc: dict[str, Any],
    *,
    topic: str,
    audience: str = "",
    material: str = "",
    allowed_types: set[str],
    type_descriptions: dict[str, str] | None = None,
    rounds: int = 1,
) -> list[str]:
    """原地修订有规划级缺陷的 scene；严格保持页数、顺序、scene id 与 kind。"""
    warnings: list[str] = []
    system = """你是课程骨架的总编审。此时 block 尚未生成，所以必须在昂贵 fan-out 之前修掉页目标和组件选择错误。
逐页及跨页检查：
1. 每页只有一个可观察 objective 和一个 keyClaim；相邻页不重复。
   objective 必须落成一个主要 learningAction 和可观察的 requiredEvidence。先判断证据，再依据 Skill 菜单的
   affordance 选表达能力：固定关系、单个最终快照或无需控制的少量状态可用静态图；状态序列、中间状态、
   结构变换、逐步执行、回放必须用 state-sim；参数改变后的定量因果用 model-sim；坐标/约束操作用 geometry-sim；实现/运行/调试用 runnable。
   sim 证明过程状态，runnable 证明代码执行，不能互相冒充。
   不按主题硬编码组件，也不按配额硬塞互动。跨页还要检查课程是否只有 read/inspect 而没有任何主动产出证据的活动。
2. 近似直觉、带条件引理、特殊模型结论、一般定理不得偷换。依赖 L-smooth/凸/强凸等条件时标题和目标显式写条件。
   收敛/速率/保证页还要在观众可见的 headline/lead/formula 规划里容纳步长范围等必要假设，不能只写进 notes/brief。
3. visualTask 必须能由所选 block 真正编码：chart 适合固定数值趋势/比较；标量一阶递推用 model-sim；二维几何用 geometry-sim；离散算法状态用 state-sim；装饰 diagram 不表达坐标、梯度或状态变化。
4. 若解释学习率调度，优先画学习率 η(t) 本身；没有可复算模型时不要编造“某调度对应的损失曲线”。
   若 objective 是“比较多个条件/参数”，visualTask 和 block intent 必须要求首帧同时出现各对照；一个滑块一次只显示一条轨迹不算比较。
   若讲鞍点，必须规划二维曲面/等高线或两条正交切片来编码相反曲率；单条一维切片不能承担该目标。
   比较 SGD/AdaGrad/RMSProp/Adam/动量时，不得用随手合成的 loss 曲线暗示固定性能排名；应比较更新机制，
   或显式给出可复算目标函数、初值和超参数后再画派生轨迹。
5. 无素材时不规划论文年份、引语、百分比、真实基准数字；示意数据明确 synthetic。
6. 一页视觉重量约 4–7；公式+图表若公式很长，应改成分步公式或避免窄栏；quiz 必须可从前文推导。
   l/xl 的 sim.widget 页面最多再配一个 s/m 短辅助块；quiz、callout、长公式不得和复杂互动舞台四块同页。
7. 所有观众可见标题/导语/组件文案与 doc language 一致；数学符号、代码标识符和必要专名除外。
8. 一个 quiz block 只有一道题，objective/keyClaim 只能检验一个判定链；不得写成同时覆盖梯度方向、学习率、调度等整章目标。

只输出 JSON：{"revisions":[{"sceneId":"原 id","reason":"为什么必须改","scene":{完整修订 scene}}]}。
只列确实低于 9.8/10 的页；若全合格返回空 revisions。硬约束：页数/顺序/sceneId/kind 不变；scene 仍是骨架，blocks 只能含 id/type/role/intent/size/可选 engine/interactionBrief，不写最终 block 内容；每个修订 scene 必须含 brief、notes、blocks。"""
    for _round in range(rounds):
        deterministic_problems = []
        for scene in doc.get("scenes") or []:
            problem = validate_plan_revision(scene, scene, doc.get("scenes") or [], allowed_types)
            if problem:
                deterministic_problems.append({"sceneId": scene.get("id"), "problem": problem})
        payload = {
            "topic": topic,
            "audience": audience,
            "allowedTypes": sorted(allowed_types),
            "skillCapabilities": type_descriptions or {},
            "referenceMaterial": material or "[none provided]",
            "deckSkeleton": doc,
            "deterministicProblems": deterministic_problems,
        }
        try:
            raw = parse_json(
                await asyncio.wait_for(
                    llm.complete(
                        [
                            {"role": "system", "content": system},
                            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                        ],
                        purpose="quality:plan",
                    ),
                    timeout=_PLAN_REVIEW_TIMEOUT_S,
                )
            )
        except Exception as exc:  # noqa: BLE001
            warnings.append(f"规划质量审查失败: {str(exc)[:120]}")
            break
        revisions = raw.get("revisions") if isinstance(raw, dict) else None
        if not isinstance(revisions, list) or not revisions:
            break
        scenes = doc.get("scenes") or []
        by_id = {str(s.get("id")): (i, s) for i, s in enumerate(scenes)}
        changed = 0
        for rev in revisions:
            if not isinstance(rev, dict):
                continue
            sid = str(rev.get("sceneId") or "")
            candidate = rev.get("scene")
            located = by_id.get(sid)
            if located is None or not isinstance(candidate, dict):
                warnings.append(f"规划修订忽略未知 scene: {sid or '?'}")
                continue
            idx, old = located
            _normalize_revision_candidate(candidate, old, scenes)
            problem = validate_plan_revision(candidate, old, scenes, allowed_types)
            if problem:
                warnings.append(f"规划修订 {sid} 被拒绝: {problem}")
                continue
            candidate["id"] = sid
            candidate["kind"] = old.get("kind")
            candidate.pop("layout", None)
            scenes[idx] = candidate
            changed += 1
        if not changed:
            break
    warnings.extend(_normalize_sim_profile_routes(doc, allowed_types))
    warnings.extend(_enforce_course_evidence_obligations(doc, allowed_types))
    warnings.extend(_enforce_evidence_safe_plans(doc, allowed_types))
    warnings.extend(_enforce_geometry_routes(doc, allowed_types))
    warnings.extend(_enforce_learning_evidence_routes(doc, allowed_types))
    warnings.extend(_enforce_widget_capacity(doc))
    warnings.extend(_enforce_quiz_scope(doc))
    return warnings


def _learning_evidence_needs(brief: dict[str, Any]) -> tuple[bool, bool]:
    """从显式学习契约判定能力需求；不按课题或学科名称做映射。"""
    action = str(brief.get("learningAction") or "").lower()
    evidence = str(brief.get("requiredEvidence") or "").lower()
    objective = str(brief.get("objective") or "").lower()
    visual_task = str(brief.get("visualTask") or "").lower()
    text = " ".join((action, evidence, objective, visual_task))
    code_evidence = any(
        token in text
        for token in (
            "code", "program", "function", "stdout", "test result",
            "代码", "程序", "函数", "运行结果", "测试结果",
        )
    )
    needs_runnable = code_evidence and any(
        token in text
        for token in ("implement", "debug", "run", "execute", "实现", "调试", "运行", "执行")
    )
    explicit_interaction = any(
        token in text
        for token in (
            "manipulate", "experiment", "change input", "adjust parameter",
            "step through", "play back", "replay",
            "操纵", "试验", "改变输入", "调参", "单步", "回放",
        )
    )
    transition_evidence = action in {"trace", "step", "play", "replay"} or any(
        token in text
        for token in (
            "state sequence", "state transition", "intermediate state", "step-by-step",
            "structure transformation", "structure mutation", "before and after",
            "状态序列", "状态转移", "中间状态", "逐步执行", "每一步",
            "结构变换", "结构变化", "结构演化", "前后状态", "演化过程",
        )
    )
    return needs_runnable, explicit_interaction or transition_evidence


def _enforce_learning_evidence_routes(
    doc: dict[str, Any], allowed_types: set[str]
) -> list[str]:
    """模型审查超时时仍保证显式的执行/交互证据有可承载的 Skill。"""
    warnings: list[str] = []
    for scene in doc.get("scenes") or []:
        if scene.get("kind") in {"hero", "section"}:
            continue
        brief = scene.get("brief") if isinstance(scene.get("brief"), dict) else {}
        blocks = list(scene.get("blocks") or [])
        if not blocks:
            continue
        types = {str(block.get("type") or "") for block in blocks}
        needs_runnable, needs_sim = _learning_evidence_needs(brief)
        if needs_runnable and "runnable" in allowed_types and "runnable" not in types:
            main = next(
                (block for block in blocks if block.get("type") in {"code", "sim", "graph", "diagram"}),
                blocks[0],
            )
            main["type"] = "runnable"
            main.pop("engine", None)
            main["role"] = "practice"
            main["size"] = "xl"
            main["intent"] = (
                str(main.get("intent") or brief.get("objective") or "实现并运行代码")
                + "；提供可编辑代码、固定测试输入、stdout 与测试结果"
            )
            scene["blocks"] = [main]
            warnings.append(f"规划证据兜底 {scene.get('id') or '?'}：执行证据路由到 runnable")
        elif needs_sim and not any(_is_sim_type(value) for value in types):
            sim_type = _sim_type_for(_sim_profile_for_brief(brief), allowed_types)
            if not sim_type:
                continue
            main = next(
                (block for block in blocks if block.get("type") in {"graph", "diagram", "chart", "timeline", "flow"}),
                blocks[0],
            )
            main["type"] = sim_type
            if sim_type == "sim":
                main["engine"] = "widget"
            else:
                main.pop("engine", None)
            main["role"] = "visualization"
            main["size"] = "xl"
            main["intent"] = (
                str(main.get("intent") or brief.get("visualTask") or "交互探索")
                + "；首帧已执行一步，提供单步/复位或真实可操作输入，保留前后状态并突出变化"
            )
            scene["blocks"] = [main]
            route_label = "sim.widget" if sim_type == "sim" else sim_type
            warnings.append(
                f"规划证据兜底 {scene.get('id') or '?'}：过程状态证据路由到 {route_label}"
            )
    return warnings


def _enforce_course_evidence_obligations(
    doc: dict[str, Any], allowed_types: set[str]
) -> list[str]:
    """Close course-level evidence obligations even when the skeleton omitted the objective."""
    obligations = doc.get("_evidenceObligations")
    if not isinstance(obligations, list):
        return []
    scenes = [
        scene
        for scene in (doc.get("scenes") or [])
        if scene.get("kind") not in {"hero", "section", "quiz"} and scene.get("blocks")
    ]
    used: set[int] = set()
    warnings: list[str] = []

    def score(scene: dict[str, Any], capability: str) -> int:
        raw_brief = scene.get("brief")
        brief: dict[str, Any] = raw_brief if isinstance(raw_brief, dict) else {}
        text = " ".join(str(value or "").lower() for value in brief.values())
        if capability == "runnable":
            return sum(token in text for token in ("implement", "run", "debug", "代码", "实现", "运行", "测试"))
        if capability == "state-sim":
            return sum(token in text for token in ("trace", "state", "step", "状态", "逐步", "结构", "旋转"))
        if capability == "model-sim":
            return sum(
                token in text
                for token in (
                    "parameter", "model", "quantitative", "formula", "recurrence", "complexity",
                    "参数", "模型", "定量", "公式", "递推", "复杂度", "高度", "节点数", "计算",
                )
            )
        if capability == "geometry-sim":
            return sum(token in text for token in ("coordinate", "constraint", "坐标", "约束", "几何"))
        return sum(
            token in text
            for token in (
                "relation", "structure", "hierarchy", "node", "edge", "tree", "graph",
                "关系", "结构", "层级", "节点", "边", "树", "图", "依赖",
            )
        )

    for raw in obligations:
        if not isinstance(raw, dict):
            continue
        capability = str(raw.get("capability") or "")
        if capability not in allowed_types:
            # Legacy registries expose one undifferentiated sim type.
            if capability.endswith("-sim") and "sim" in allowed_types:
                effective = "sim"
            else:
                continue
        else:
            effective = capability
        knowledge_form = str(raw.get("knowledgeForm") or "")
        acceptable = {capability, effective}
        if knowledge_form == "relational-structure":
            acceptable |= {"diagram", "graph", "flow", "timeline"}
        elif knowledge_form == "quantitative-model":
            acceptable |= {"chart", "model-sim"}
        if any(
            str(block.get("type") or "") in acceptable
            for scene in scenes
            for block in (scene.get("blocks") or [])
        ):
            continue
        candidates = []
        for i, scene in enumerate(scenes):
            if i in used:
                continue
            raw_brief = scene.get("brief")
            candidate_brief = raw_brief if isinstance(raw_brief, dict) else {}
            needs_runnable, needs_sim = _learning_evidence_needs(candidate_brief)
            existing = {str(block.get("type") or "") for block in (scene.get("blocks") or [])}
            if capability != "runnable" and (needs_runnable or "runnable" in existing):
                continue
            if not capability.endswith("-sim") and (
                needs_sim or any(_is_sim_type(block_type) for block_type in existing)
            ):
                continue
            candidates.append((i, scene))
        if not candidates:
            continue
        index, scene = max(candidates, key=lambda pair: (score(pair[1], capability), pair[0]))
        used.add(index)
        brief = scene.get("brief") if isinstance(scene.get("brief"), dict) else {}
        scene["brief"] = brief
        brief["learningAction"] = str(raw.get("learningAction") or brief.get("learningAction") or "inspect")
        brief["requiredEvidence"] = str(raw.get("requiredEvidence") or brief.get("requiredEvidence") or "可观察证据")
        if capability == "runnable":
            brief["objective"] = "学生能实现并运行本页核心可执行过程，通过固定测试验证结果"
            brief["visualTask"] = "编辑核心实现并同时看到固定输入、stdout 与测试反馈"
            role = "practice"
        else:
            brief.setdefault("objective", "学生能通过可观察证据解释本页核心关系")
            brief["visualTask"] = str(raw.get("requiredEvidence") or brief.get("visualTask") or "直接编码核心证据")
            role = "visualization"
        main = next(
            (
                block
                for block in scene.get("blocks") or []
                if block.get("type") in {"code", "chart", "graph", "diagram", "flow", "timeline", "list"}
            ),
            scene["blocks"][0],
        )
        main["type"] = effective
        main["role"] = role
        main["size"] = "xl"
        main["intent"] = (
            str(raw.get("requiredEvidence") or brief.get("objective") or "完成课程证据义务")
            + "；直接产出本课程级证据义务要求的可观察结果"
        )
        main.pop("engine", None)
        if effective == "sim":
            main["engine"] = "widget"
        scene["blocks"] = [main]
        warnings.append(
            f"课程证据义务 {raw.get('knowledgeForm') or '?'}：{scene.get('id') or '?'} 路由到 {effective}"
        )
    return warnings


def _enforce_widget_capacity(doc: dict[str, Any]) -> list[str]:
    """模型即使忽略容量提示，也不允许复杂互动页带四块内容进入 fan-out。"""
    warnings: list[str] = []
    preference = {"formula": 0, "statement": 1, "callout": 2, "list": 3, "quiz": 4}
    for scene in doc.get("scenes") or []:
        blocks = list(scene.get("blocks") or [])
        widgets = [
            block
            for block in blocks
            if block.get("type") in {"state-sim", "geometry-sim"}
            or (block.get("type") in {"sim", "model-sim"} and block.get("engine") == "widget")
        ]
        if not widgets or len(blocks) <= 2:
            continue
        widget = widgets[0]
        auxiliaries = [block for block in blocks if block is not widget]
        auxiliary = min(
            auxiliaries,
            key=lambda block: (
                preference.get(str(block.get("type")), 9),
                {"s": 0, "m": 1, "l": 2, "xl": 3}.get(str(block.get("size")), 4),
            ),
        )
        kept = [block for block in blocks if block is widget or block is auxiliary]
        removed = [str(block.get("id") or block.get("type") or "?") for block in blocks if block not in kept]
        scene["blocks"] = kept
        warnings.append(
            f"规划容量兜底 {scene.get('id') or '?'}：复杂 widget 页只保留主舞台 + {auxiliary.get('type')}，移除 {', '.join(removed)}"
        )
    return warnings


def _enforce_evidence_safe_plans(doc: dict[str, Any], allowed_types: set[str]) -> list[str]:
    """不允许未解决的合成优化器排名进入 fan-out；确定性退回机制比较。"""
    warnings: list[str] = []
    fallback_type = "table" if "table" in allowed_types else ("list" if "list" in allowed_types else "")
    if not fallback_type:
        return warnings
    optimizer_names = ("sgd", "adagrad", "rmsprop", "adam", "momentum", "动量")
    for scene in doc.get("scenes") or []:
        brief = scene.get("brief") if isinstance(scene.get("brief"), dict) else {}
        visual_task = str(brief.get("visualTask") or "").lower()
        if (
            sum(name in visual_task for name in optimizer_names) < 2
            or not any(
                token in visual_task
                for token in ("loss", "损失", "收敛轨迹", "收敛路径", "下降曲线")
            )
            or str(brief.get("evidencePolicy") or "").lower() != "synthetic"
        ):
            continue
        charts = [block for block in scene.get("blocks") or [] if block.get("type") == "chart"]
        if not charts:
            continue
        main = charts[0]
        main["type"] = fallback_type
        main.pop("engine", None)
        main["role"] = "evidence"
        main["size"] = "xl"
        main["intent"] = (
            "逐方法比较状态变量、累积量与参数更新公式；只讲机制差异，不给出固定性能排名"
        )
        brief["visualTask"] = "对照各优化器保存的状态量和参数更新路径，不编码普遍性能排名"
        brief["evidencePolicy"] = "derived"
        # 四种方法的状态/递推本身已是高密度主体；旧说明 list 会重复并把表格压进窄栏。
        scene["blocks"] = [main]
        warnings.append(
            f"规划证据兜底 {scene.get('id') or '?'}：synthetic 优化器 loss 排名改为 {fallback_type} 机制比较"
        )
    return warnings


def _enforce_geometry_routes(doc: dict[str, Any], allowed_types: set[str]) -> list[str]:
    """二维曲面/等高线不能因规划审查漏修而落回普通 chart/graph。"""
    geometry_type = _sim_type_for("geometry", allowed_types)
    if not geometry_type:
        return []
    warnings: list[str] = []
    for scene in doc.get("scenes") or []:
        brief = scene.get("brief") if isinstance(scene.get("brief"), dict) else {}
        visual_task = str(brief.get("visualTask") or "").lower()
        if not any(token in visual_task for token in ("等高线", "损失曲面", "contour", "surface")):
            continue
        blocks = list(scene.get("blocks") or [])
        if any(
            block.get("type") == "geometry-sim"
            or (block.get("type") == "sim" and block.get("engine") == "widget")
            for block in blocks
        ):
            continue
        visual = next(
            (
                block
                for block in blocks
                if block.get("type") in {"chart", "graph", "sim", "state-sim", "model-sim", "diagram"}
            ),
            None,
        )
        if visual is None:
            continue
        visual["type"] = geometry_type
        if geometry_type == "sim":
            visual["engine"] = "widget"
        else:
            visual.pop("engine", None)
        visual["role"] = "visualization"
        visual["size"] = "l"
        visual["intent"] = str(visual.get("intent") or visual_task) + "；真实绘制二维几何与轨迹"
        warnings.append(
            f"规划几何兜底 {scene.get('id') or '?'}：二维等高线/曲面主视觉路由到 {geometry_type}"
        )
    return warnings


def _enforce_quiz_scope(doc: dict[str, Any]) -> list[str]:
    """一个 quiz block 只生成一道题；把模型常见的“整章都考”承诺收窄成一个可验证目标。"""
    warnings: list[str] = []
    for scene in doc.get("scenes") or []:
        if scene.get("kind") != "quiz":
            continue
        brief = scene.get("brief") if isinstance(scene.get("brief"), dict) else {}
        objective = str(brief.get("objective") or "")
        quiz_topics = ("梯度方向", "学习率影响", "调度", "自适应", "动量")
        if sum(topic in objective for topic in quiz_topics) < 2:
            continue
        blocks = [block for block in scene.get("blocks") or [] if block.get("type") == "quiz"]
        if not blocks:
            continue
        if "学习率" in objective:
            brief.update(
                {
                    "objective": "学生能判断学习率过大时迭代会震荡或发散",
                    "keyClaim": "学习率并非越大越好",
                    "misconception": "学习率越大一定收敛越快",
                    "visualTask": "作答后从一步更新与轨迹变化读出判定链条",
                }
            )
            blocks[0]["intent"] = "用一道可复算题检验学习率过大导致震荡或发散"
        else:
            brief.update(
                {
                    "objective": "学生能判断更新方向是否为负梯度方向",
                    "keyClaim": "下降更新与梯度的点积应为负",
                    "misconception": "梯度方向就是下降方向",
                    "visualTask": "作答后从点积符号读出判定链条",
                }
            )
            blocks[0]["intent"] = "用一道可复算题检验负梯度方向"
        warnings.append(f"规划测评兜底 {scene.get('id') or '?'}：整章测评收窄为一道判定链")
    return warnings


def validate_plan_revision(
    scene: dict[str, Any],
    old: dict[str, Any],
    all_scenes: list[dict[str, Any]],
    allowed_types: set[str],
) -> str:
    if scene.get("id") != old.get("id") or scene.get("kind") != old.get("kind"):
        return "不得改变 scene id/kind"
    brief = scene.get("brief")
    required_brief = {"objective", "keyClaim", "misconception", "visualTask", "evidencePolicy"}
    if not isinstance(brief, dict) or not required_brief.issubset(brief):
        return "brief 字段不完整"
    blocks = scene.get("blocks")
    if not isinstance(blocks, list) or not blocks or len(blocks) > 4:
        return "blocks 应为 1–4 个骨架占位"
    other_ids = {
        str(b.get("id"))
        for s in all_scenes
        if s is not old
        for b in (s.get("blocks") or [])
        if isinstance(b, dict) and b.get("id")
    }
    seen: set[str] = set()
    placeholder_keys = {"id", "type", "role", "intent", "size", "engine", "interactionBrief"}
    for block in blocks:
        if not isinstance(block, dict):
            return "block 占位必须是对象"
        extra_keys = set(block) - placeholder_keys
        if extra_keys:
            return f"block 占位含最终内容字段: {', '.join(sorted(extra_keys))}"
        bid = str(block.get("id") or "")
        if not bid or bid in seen or bid in other_ids:
            return f"block id 缺失或重复: {bid or '?'}"
        seen.add(bid)
        if block.get("type") not in allowed_types:
            return f"非法 block type: {block.get('type')}"
        if not str(block.get("intent") or "").strip():
            return f"block {bid} 缺 intent"
        if block.get("size") not in {"s", "m", "l", "xl"}:
            return f"block {bid} size 非法"
        if "interactionBrief" in block and not isinstance(block.get("interactionBrief"), dict):
            return f"block {bid} interactionBrief 必须是对象"
    weights = {"s": 1, "m": 2, "l": 3, "xl": 4}
    total_weight = sum(weights[str(block.get("size"))] for block in blocks)
    if total_weight > 7:
        return f"页面视觉重量 {total_weight} 超过 7；删减辅助块或把主体设为独占页"
    widget_blocks = [
        block
        for block in blocks
        if block.get("type") in {"state-sim", "geometry-sim"}
        or (block.get("type") in {"sim", "model-sim"} and block.get("engine") == "widget")
    ]
    if widget_blocks and len(blocks) > 2:
        return "复杂 widget 页最多再配一个短辅助块；quiz/callout/长公式不能与互动舞台同页堆叠"
    kind = old.get("kind")
    types = [b.get("type") for b in blocks]
    if kind == "hero" and types != ["hero"]:
        return "hero 页必须恰好一个 hero block"
    if kind == "quiz" and "quiz" not in types:
        return "quiz 页必须含 quiz block"
    if kind == "quiz":
        objective = str(brief.get("objective") or "").lower()
        quiz_topics = ("梯度方向", "学习率影响", "调度", "自适应", "动量")
        if sum(topic in objective for topic in quiz_topics) >= 2:
            return "一个 quiz block 只能检验一个判定链；objective 不得同时覆盖多个章节知识点"
    visual_task = str(brief.get("visualTask") or "").lower()
    needs_runnable, needs_sim = _learning_evidence_needs(brief)
    if needs_runnable and "runnable" not in types:
        return "学习动作要求实现/运行/调试，必须由 runnable 产出执行证据；只读 code 不成立"
    if needs_sim and not any(_is_sim_type(value) for value in types):
        return "学习证据包含状态序列/结构变换/逐步执行或可控因果，必须使用 sim 呈现过程状态"
    optimizer_names = ("sgd", "adagrad", "rmsprop", "adam", "momentum", "动量")
    optimizer_count = sum(name in visual_task for name in optimizer_names)
    evidence_policy = str(brief.get("evidencePolicy") or "").lower()
    if (
        optimizer_count >= 2
        and any(
            token in visual_task for token in ("loss", "损失", "收敛轨迹", "收敛路径", "下降曲线")
        )
        and evidence_policy == "synthetic"
    ):
        return "优化器性能依赖目标函数与超参数；synthetic loss 曲线不能暗示 SGD/AdaGrad/RMSProp/Adam/动量的固定排名"
    if any(token in visual_task for token in ("等高线", "损失曲面", "contour", "surface")):
        has_geometry_engine = any(
            b.get("type") == "geometry-sim"
            or (b.get("type") == "sim" and b.get("engine") == "widget")
            for b in blocks
        )
        if not has_geometry_engine:
            return (
                "等高线/曲面 visualTask 必须使用 sim engine=widget 真实编码二维几何"
                if "sim" in allowed_types and "geometry-sim" not in allowed_types
                else "等高线/曲面 visualTask 必须使用 geometry-sim 真实编码二维几何"
            )
    if any(token in visual_task for token in ("坐标", "轨迹", "梯度方向")) and set(types) <= {
        "graph",
        "diagram",
        "list",
        "callout",
        "statement",
    }:
        return "坐标/轨迹 visualTask 不能只用 graph/diagram 等概念图"
    return ""


def _normalize_revision_candidate(
    candidate: dict[str, Any], old: dict[str, Any], all_scenes: list[dict[str, Any]]
) -> None:
    """容忍模型沿用旧骨架字段名，但归一后仍走同一严格 validator。"""
    if candidate.get("id") != old.get("id") or candidate.get("kind") != old.get("kind"):
        return  # id/kind 篡改必须留给 validator 拒绝，不能悄悄改回去
    old_brief_value = old.get("brief")
    old_brief: dict[str, Any] = old_brief_value if isinstance(old_brief_value, dict) else {}
    raw_brief_value = candidate.get("brief")
    raw_brief: dict[str, Any] = raw_brief_value if isinstance(raw_brief_value, dict) else {}
    brief = {
        key: str(candidate.get(key) or raw_brief.get(key) or old_brief.get(key) or fallback)
        for key, fallback in {
            "objective": "学生能复述本页核心结论",
            "learningAction": old_brief.get("learningAction") or "inspect",
            "requiredEvidence": old_brief.get("requiredEvidence") or old_brief.get("visualTask") or "可见的核心结论",
            "keyClaim": candidate.get("headline") or old.get("headline") or "本页核心结论",
            "misconception": "",
            "visualTask": old_brief.get("visualTask") or "视觉直接编码本页核心关系",
            "evidencePolicy": old_brief.get("evidencePolicy") or "none",
        }.items()
    }
    candidate["brief"] = brief
    for key in brief:
        candidate.pop(key, None)
    candidate.setdefault("notes", old.get("notes") or "说明本页在叙事中的作用。")
    candidate.pop("layout", None)

    other_ids = {
        str(block.get("id"))
        for scene in all_scenes
        if scene is not old
        for block in (scene.get("blocks") or [])
        if isinstance(block, dict) and block.get("id")
    }
    valid_roles = {"claim", "evidence", "visualization", "practice", "support"}
    visual_types = {
        "chart", "sim", "state-sim", "model-sim", "geometry-sim",
        "graph", "diagram", "timeline", "flow",
    }
    size_map = {
        "s": "s", "sm": "s", "small": "s", "half": "m",
        "m": "m", "md": "m", "medium": "m",
        "l": "l", "lg": "l", "large": "l",
        "xl": "xl", "full": "xl", "extra-large": "xl", "extra_large": "xl",
    }
    geometry_task = any(
        token in str(brief.get("visualTask") or "").lower()
        for token in ("等高线", "损失曲面", "contour", "surface")
    )
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", str(old.get("id") or "scene")).strip("-") or "scene"
    seen: set[str] = set()
    for i, block in enumerate(candidate.get("blocks") or []):
        if not isinstance(block, dict):
            continue
        bid = str(block.get("id") or "")
        if not bid or bid in seen or bid in other_ids:
            bid = f"{slug}-r{i + 1}"
        block["id"] = bid
        seen.add(bid)
        if block.get("role") not in valid_roles:
            block["role"] = "visualization" if block.get("type") in visual_types else ("claim" if i == 0 else "support")
        block["size"] = size_map.get(str(block.get("size") or "").lower(), block.get("size") or "m")
        if block.get("type") == "sim" and geometry_task:
            # 规划模型经常正确选择 sim，却漏写唯一能承载二维几何的 engine 字段。
            # 这是宿主能力路由，不改变教学意图；在 validator 前确定性补齐，避免好修订被整页拒绝。
            block["engine"] = "widget"
        elif block.get("type") not in _SIM_CAPABILITIES:
            block.pop("engine", None)
    _fit_revision_capacity(candidate, old)


def _fit_revision_capacity(candidate: dict[str, Any], old: dict[str, Any]) -> None:
    """把正确但过载的 replan 编译成最小证据集，而不是整页拒绝。"""
    blocks = [block for block in (candidate.get("blocks") or []) if isinstance(block, dict)]
    if not blocks:
        return
    weights = {"s": 1, "m": 2, "l": 3, "xl": 4}
    raw_brief = candidate.get("brief")
    brief: dict[str, Any] = raw_brief if isinstance(raw_brief, dict) else {}
    needs_runnable, needs_sim = _learning_evidence_needs(brief)
    widget = next(
        (
            block
            for block in blocks
            if block.get("type") in {"state-sim", "geometry-sim"}
            or (block.get("type") in {"sim", "model-sim"} and block.get("engine") == "widget")
        ),
        None,
    )
    if widget is not None:
        auxiliaries = [block for block in blocks if block is not widget]
        auxiliary = min(
            auxiliaries,
            key=lambda block: (
                {"formula": 0, "statement": 1, "callout": 2, "list": 3, "quiz": 4}.get(str(block.get("type")), 8),
                weights.get(str(block.get("size")), 2),
            ),
            default=None,
        )
        candidate["blocks"] = [block for block in blocks if block is widget or block is auxiliary]
        return
    if len(blocks) <= 4 and sum(weights.get(str(block.get("size")), 2) for block in blocks) <= 7:
        return

    def priority(block: dict[str, Any]) -> tuple[int, int]:
        block_type = str(block.get("type") or "")
        if needs_runnable and block_type == "runnable":
            rank = 0
        elif needs_sim and _is_sim_type(block_type):
            rank = 0
        elif old.get("kind") == "quiz" and block_type == "quiz":
            rank = 0
        else:
            rank = {
                "sim": 1, "state-sim": 1, "model-sim": 1, "geometry-sim": 1,
                "graph": 2, "chart": 2, "diagram": 2, "formula": 3,
                "quiz": 3, "statement": 4, "callout": 5, "list": 6, "runnable": 7,
            }.get(block_type, 7)
        return rank, weights.get(str(block.get("size")), 2)

    chosen: list[dict[str, Any]] = []
    total = 0
    for block in sorted(blocks, key=priority):
        weight = weights.get(str(block.get("size")), 2)
        if len(chosen) >= 4 or total + weight > 7:
            continue
        chosen.append(block)
        total += weight
    if chosen:
        candidate["blocks"] = [block for block in blocks if block in chosen]


async def replan_page(
    llm: LLMClient,
    *,
    current_scene: dict[str, Any],
    brief: dict[str, str],
    issues: list[str],
    topic: str,
    audience: str,
    material: str,
    allowed_types: set[str],
    type_descriptions: dict[str, str],
    all_scenes: list[dict[str, Any]],
) -> tuple[dict[str, Any] | None, str | None]:
    """质量门发现“类型/布局/页目标级”问题时，重做本页骨架而非死守错误 block 类型。"""
    system = """你是课程页重规划器。质量门已证明当前页靠原 block 类型无法修好；请只重做这一页的骨架。
输出 JSON：{"scene":{完整 scene 骨架}}，不要解释。硬约束：
- scene id/kind 不变；保留同一教学位置，但可改 headline/lead/brief/notes 和 block 组合。
    - brief 必须明确一个 learningAction 与 requiredEvidence；先选择能产出该证据的 Skill，再决定 block。状态序列/结构变换用 state-sim，参数因果用 model-sim，坐标/约束用 geometry-sim；实现/运行/调试用 runnable。
- blocks 只含 id/type/role/intent/size/可选 engine/interactionBrief，不写最终内容；id 全局唯一。
- 每页一个可观察 objective、一个 keyClaim；标题写清所有必要前提。
- 二维曲面/等高线/几何轨迹用 geometry-sim；普通 graph/diagram 只表达概念关系，不能冒充坐标。
- 定量曲线必须由页面给出的公式直接计算，或清楚标为合成示意；不能用随手编的点冒充数学定义。
- 若现有 objective 本身要求一页塞两件事，可收窄目标；不要增加页数。"""
    payload = {
        "topic": topic,
        "audience": audience,
        "referenceMaterial": material or "[none provided]",
        "allowedTypes": type_descriptions,
        "currentBrief": brief,
        "currentScene": current_scene,
        "qualityIssues": issues,
    }
    try:
        raw = parse_json(
            await asyncio.wait_for(
                llm.complete(
                    [
                        {"role": "system", "content": system},
                        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                    ],
                    purpose="quality:replan",
                ),
                timeout=_PAGE_REPLAN_TIMEOUT_S,
            )
        )
    except Exception as exc:  # noqa: BLE001
        return None, f"页级重规划失败: {str(exc)[:120]}"
    candidate = raw.get("scene") if isinstance(raw, dict) else None
    if not isinstance(candidate, dict):
        return None, "页级重规划未返回 scene 对象"
    _normalize_revision_candidate(candidate, current_scene, all_scenes)
    # Accept legacy quality fixtures/models that still answer with an undifferentiated sim, but
    # normalize it onto the new planner capability before validation.
    if "sim" not in allowed_types:
        profile = _sim_profile_for_brief(candidate.get("brief") or brief)
        replacement = _sim_type_for(profile, allowed_types)
        if replacement:
            for block in candidate.get("blocks") or []:
                if block.get("type") == "sim":
                    block["type"] = replacement
                    block.pop("engine", None)
    problem = validate_plan_revision(candidate, current_scene, all_scenes, allowed_types)
    if problem:
        return None, f"页级重规划被拒绝: {problem}"
    candidate.pop("layout", None)
    return candidate, None
