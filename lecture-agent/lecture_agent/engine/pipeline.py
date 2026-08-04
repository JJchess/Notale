"""编排核心：plan → fan-out(逐块生成+自校验+自修) → 组装 → 整档校验+自修 → 备注 → 覆盖度。

对应旧 src/agent.mjs。只依赖 ports.LLMClient 与 domain（禁 import adapters）——换 live/replay/fake 只改注入。
生成器变体（消融轴）由 GeneratorOptions 开关表达：fanout / revise / evolve / plan_perspectives。
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from ..domain.assemble import fill_blocks
from ..domain.design import compile_scene_composition, compile_visual_system
from ..domain.evaluation import check_coverage, refine_plan, replan_page, review_page
from ..domain.evaluation.visual_quality import preflight_page_metrics
from ..domain.generation import (
    BlockResult,
    compile_interaction_brief,
    condense_material,
    condense_scene,
    enrich_notes,
    generate_block,
    generate_widget,
    load_widget_guidelines,
    repair_widget,
)
from ..domain.media import attach_icons
from ..domain.planning import assign_layouts, plan_lecture
from ..domain.skills import (
    AUTHORING_RULES,
    PlanningEntry,
    SkillEntry,
    load_design_rules,
    load_skill_catalog,
    lower_planning_placeholder,
    plan_menu,
)
from ..domain.themes import theme_menu
from ..domain.tools import CalcTool
from ..ports.llm import LLMClient
from ..ports.media import ImageFinder, ImageGenerator
from ..ports.renderer import RenderReport, RenderVerifier
from ..ports.tool import Tool
from ..ports.visual_review import ImageInput, VisualIssue, VisualReviewer, VisualReviewRequest
from ..schema.validate import validate_doc
from ..utils.concurrency import pool

_BLOCK_ERR = re.compile(r"\$\.scenes\[(\d+)\]\.blocks\[(\d+)\]")


def _skill_decision_descriptions(
    registry: dict[str, SkillEntry], planning: dict[str, PlanningEntry]
) -> dict[str, str]:
    """展开家族级 Skill Manifest，供规划审查与页级重新编译使用同一决策面。"""
    descriptions: dict[str, str] = {}
    for skill, description, types in plan_menu(registry, planning):
        for block_type in types:
            descriptions[block_type] = f"{skill}: {description}"
    return descriptions


def _emit_block_done(
    progress: Callable[[dict[str, Any]], None], block_id: str, scene_id: str | None, err: Any
) -> None:
    """一块完成：出错走 block:err（UI 折成"精修"，不吓用户），否则 docUpdated:done。"""
    if err:
        progress({"type": "block", "blockId": block_id, "sceneId": scene_id, "status": "err"})
    else:
        progress(
            {"type": "docUpdated", "blockId": block_id, "sceneId": scene_id, "status": "done"}
        )


@dataclass
class GeneratorOptions:
    fanout: bool = True
    revise: bool = True
    evolve: bool = False
    plan_perspectives: int = 3
    tools: bool = False  # 开启后 sim 块生成走 tool-loop（模型可用 calc 验证表达式）
    concurrency: int = 8  # fan-out / 修复 / notes 的统一有界并发
    sections: bool = True  # 章节分隔页插入（fast 档关，省一次规划调用+少几页）
    media: bool | str = "auto"  # auto=能力可用但只在规划器选择 media 时调用；True 保留旧封面补图
    record: bool = (
        True  # 记录到 results/ledger.jsonl（能力画像+token+代码指纹，见 app/container.py）
    )
    # 真机渲染验收 → 溢出页回炉精简的最大轮数（需注入 render_verifier 才生效；0=关）
    render_rounds: int = 2
    # 逐页六维语义审查→定点回炉轮数；full 配置开启，fast/single-pass 可关以控时延。
    quality_rounds: int = 0
    plan_quality_rounds: int = 0
    # 最终像素级视觉审查/定点修复轮数；依赖注入 VisualReviewer 与截图型 verifier。
    visual_quality_rounds: int = 0


@dataclass
class GenerateResult:
    doc: dict[str, Any]
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    dropped: list[str] = field(default_factory=list)
    perspectives: list[dict[str, Any]] = field(default_factory=list)
    coverage: dict[str, Any] | None = None
    quality: list[dict[str, Any]] = field(default_factory=list)
    knowledge_forms: list[str] = field(default_factory=list)
    evidence_obligations: list[dict[str, str]] = field(default_factory=list)
    widget_routes: list[dict[str, str]] = field(default_factory=list)
    visual_quality: dict[str, Any] | None = None


def _page_brief(scene: dict[str, Any]) -> dict[str, str]:
    """把规划器的页级质量契约规整成内部数据；最终 LectureDoc 不携带该字段。"""
    raw_value = scene.get("brief")
    raw: dict[str, Any] = raw_value if isinstance(raw_value, dict) else {}
    headline = str(scene.get("headline") or scene.get("eyebrow") or scene.get("kind") or "本页")
    brief = {
        "objective": str(raw.get("objective") or f"学生能复述「{headline}」的核心结论"),
        "learningAction": str(raw.get("learningAction") or "inspect"),
        "requiredEvidence": str(raw.get("requiredEvidence") or raw.get("visualTask") or "可见的核心结论"),
        "keyClaim": str(raw.get("keyClaim") or headline),
        "misconception": str(raw.get("misconception") or ""),
        "visualTask": str(raw.get("visualTask") or "视觉必须直接服务本页核心结论"),
        "evidencePolicy": str(raw.get("evidencePolicy") or "none"),
    }
    if scene.get("kind") == "hero":
        brief["learningAction"] = "orient"
        brief["requiredEvidence"] = "主题、核心问题与学习承诺"
        brief["visualTask"] = "封面只建立课题、核心问题与视觉张力；装饰图不承担数学证明"
        brief["evidencePolicy"] = "none"
    return brief


def _page_visual_brief(scene: dict[str, Any]) -> dict[str, Any]:
    """Normalize the design director's page-level intent without inventing media demand."""
    raw_value = scene.get("visualBrief")
    raw: dict[str, Any] = raw_value if isinstance(raw_value, dict) else {}
    capabilities = raw.get("selectedCapabilities")
    if not isinstance(capabilities, list):
        capabilities = [
            str(block.get("type") or "")
            for block in (scene.get("blocks") or [])
            if isinstance(block, dict) and block.get("type")
        ]
    return {
        "designIntent": str(raw.get("designIntent") or scene.get("headline") or scene.get("kind") or ""),
        "selectedCapabilities": [str(value) for value in capabilities if str(value)],
        "compositionFamily": str(raw.get("compositionFamily") or ""),
    }


def _block_scene_context(
    scene: dict[str, Any],
    brief: dict[str, str],
    placeholders: list[dict[str, Any]],
    visual_brief: dict[str, Any] | None = None,
    design_brief: dict[str, Any] | None = None,
) -> str:
    """给 fan-out 子任务共享同一份页契约，避免每块只凭标题各自猜题。"""
    siblings = [
        {
            "id": b.get("id"),
            "type": b.get("type"),
            "role": b.get("role") or "support",
            "intent": b.get("intent") or "",
            "size": b.get("size") or "m",
        }
        for b in placeholders
    ]
    payload = {
        "page": {
            "kind": scene.get("kind"),
            "eyebrow": scene.get("eyebrow"),
            "headline": scene.get("headline"),
            "lead": scene.get("lead"),
        },
        "brief": brief,
        "visualBrief": visual_brief or {},
        "designBrief": design_brief or {},
        "siblingPlan": siblings,
    }
    return (
        "页级共享契约（所有同页 block 必须协同，不得各讲各的）:\n"
        + json.dumps(payload, ensure_ascii=False)
        + "\n证据纪律：没有参考素材时，不得虚构论文年份、人物原话、百分比或精确行业数字；"
        "数值只能是可复算推导，或在画面中明确标为示意/合成数据。视觉必须真实编码 visualTask 所述关系。"
    )


def _merge_render_quality(
    quality: list[dict[str, Any]], scenes: list[dict[str, Any]], report: Any
) -> None:
    """把浏览器逐页实测合并到语义分数；坏页面不能保留“语义 pass”的假高分。"""
    by_scene = {str(item.get("sceneId")): item for item in quality}
    by_page = {int(m.get("i", -1)): m for m in (getattr(report, "page_metrics", []) or [])}
    for page, scene in enumerate(scenes):
        item = by_scene.get(str(scene.get("id")))
        if item is None:
            continue
        metric = by_page.get(page)
        item["semanticScore"] = item.get("score")
        item["renderVerified"] = metric is not None
        if metric is None:
            item["renderPass"] = None
            item["renderIssues"] = ["浏览器未返回本页指标"]
            item["pass"] = False
            continue
        issues: list[str] = []
        ceiling = 10.0
        overflow_x = int(metric.get("overflowX") or 0)
        overflow_y = int(metric.get("overflowY") or 0)
        layout_clip = int(metric.get("layoutClip") or 0)
        formula_clip = int(metric.get("mblockClip") or 0)
        dynamic_blank = list(metric.get("dynamicBlank") or [])
        widget_errors = list(metric.get("widgetErrors") or [])
        plot_warnings = int(metric.get("plotWarnings") or 0)
        if overflow_x > 1 or overflow_y > 4 or layout_clip > 4:
            issues.append(
                f"内容裁切/溢出：x={overflow_x}px, y={overflow_y}px, layout={layout_clip}px"
            )
            ceiling = min(ceiling, 6.0)
        if formula_clip > 4:
            issues.append(f"公式横向裁切 {formula_clip}px")
            ceiling = min(ceiling, 6.0)
        if metric.get("corrupt"):
            issues.append(f"正文损坏标记：{metric['corrupt']}")
            ceiling = min(ceiling, 3.0)
        if dynamic_blank:
            issues.append("动态内容未初始化：" + "+".join(str(x) for x in dynamic_blank))
            ceiling = min(ceiling, 4.0)
        if widget_errors:
            issues.append("widget 运行时错误：" + " | ".join(str(x) for x in widget_errors[:3]))
            ceiling = min(ceiling, 2.0)
        if plot_warnings:
            issues.append(f"图表含 {plot_warnings} 个 Plot 警告标记")
            ceiling = min(ceiling, 4.0)
        chart_use = metric.get("chartMinWidthUse")
        if chart_use is not None and float(chart_use) < 0.78:
            issues.append(f"图表仅利用 {float(chart_use):.0%} 可用宽度")
            ceiling = min(ceiling, 7.0)
        widget_height = metric.get("widgetMinHeight")
        if widget_height is not None and float(widget_height) < 260:
            issues.append(f"互动区域仅高 {float(widget_height):.0f}px")
            ceiling = min(ceiling, 7.0)
        min_text = metric.get("minTextPx")
        if min_text is not None and float(min_text) < 12:
            issues.append(f"正文最小字号 {float(min_text):.1f}px")
            ceiling = min(ceiling, 7.0)
        item["renderMetrics"] = metric
        item["renderIssues"] = issues
        item["renderPass"] = not issues
        if issues:
            item["score"] = min(float(item.get("score") or 0), ceiling)
            item["pass"] = False


async def _doc_repair(
    llm: LLMClient,
    doc: dict[str, Any],
    registry: dict[str, SkillEntry],
    material: str,
    log: Callable[[str], None],
    tools: dict[str, Tool] | None = None,
    rounds: int = 2,
    topic: str = "",
    concurrency: int = 4,
    progress: Callable[[dict[str, Any]], None] = lambda _e: None,
) -> Any:
    """整档校验 → 把 block 级错误路由回对应子代理自修（保留块 id 供版式引用）。"""
    res = validate_doc(doc)
    for rnd in range(1, rounds + 1):
        res = validate_doc(doc)
        if not res.errors:
            return res
        targets: dict[tuple[int, int], list[str]] = {}
        for e in res.errors:
            m = _BLOCK_ERR.search(e)
            if m:
                targets.setdefault((int(m.group(1)), int(m.group(2))), []).append(e)
        if not targets:
            return res  # 剩 scene 级结构错：交报告，不硬修
        log(f"[repair] 第 {rnd} 轮: {len(res.errors)} 错，回炉 {len(targets)} 处 block")

        async def fix(item: tuple[tuple[int, int], list[str]], _i: int) -> None:
            (si, bi), errs = item
            cur = doc["scenes"][si]["blocks"][bi]
            sid = doc["scenes"][si].get("id")
            progress({"type": "block", "blockId": cur.get("id"), "sceneId": sid, "status": "err"})
            reg = registry.get(cur.get("type"))
            if not reg:
                return
            if cur.get("type") == "sim" and cur.get("engine") == "widget":
                # widget 修复也走两阶段子配方，别退回一次性 generate_block。
                r = await generate_widget(
                    llm,
                    intent="修正下述校验错误：" + "；".join(errs),
                    theme=str(doc.get("theme") or "cartesian"),
                    language=str(doc.get("language") or "zh-CN"),
                    topic=topic,
                    material=material,
                    guidelines=load_widget_guidelines(reg.dir),
                )
                if r.block:
                    r.block["id"] = cur.get("id")
                    doc["scenes"][si]["blocks"][bi] = r.block
                    progress({"type": "docUpdated", "blockId": cur.get("id"), "sceneId": sid, "status": "done"})
                return
            r = await generate_block(
                llm,
                type=cur["type"],
                intent="修正下述校验错误：" + "；".join(errs),
                scene_ctx=f"当前(有错): {cur}",
                contract=reg.contract,
                topic=topic,
                material=material,
                tools=tools if cur["type"] == "sim" else None,
            )
            if r.block:
                r.block["id"] = cur.get("id")
                doc["scenes"][si]["blocks"][bi] = r.block
                progress({"type": "docUpdated", "blockId": cur.get("id"), "sceneId": sid, "status": "done"})

        await pool(list(targets.items()), concurrency, fix)
    return validate_doc(doc)


async def _quality_repair(
    llm: LLMClient,
    doc: dict[str, Any],
    *,
    registry: dict[str, SkillEntry],
    planning: dict[str, PlanningEntry],
    page_briefs: dict[str, dict[str, str]],
    placeholder_specs: dict[str, dict[str, Any]],
    topic: str,
    audience: str,
    material: str,
    concurrency: int,
    rounds: int,
    tools: dict[str, Tool] | None,
    log: Callable[[str], None],
    progress: Callable[[dict[str, Any]], None],
) -> tuple[list[str], list[dict[str, Any]]]:
    """逐页完整审查：块内错误定点修；类型/布局错误整页重规划后重生。"""
    warnings: list[str] = []
    latest: dict[str, dict[str, Any]] = {}
    scenes = doc.get("scenes") or []
    active_scene_ids = {str(scene.get("id") or "?") for scene in scenes}
    last_changed: set[str] = set()
    # 只有成功换型才锁定；格式/校验/生成失败不应耗掉该页唯一一次重新编译机会。
    # 总尝试次数仍受 quality rounds 限制，避免无界循环。
    replan_succeeded: set[str] = set()
    skill_descriptions = _skill_decision_descriptions(registry, planning)

    def route_page_issues(
        scene: dict[str, Any], issues: list[str], targets: dict[str, list[dict[str, str]]]
    ) -> None:
        """本轮无法重新编译时，先把可局部修的问题路由到现有主视觉 block。"""
        blocks = list(scene.get("blocks") or [])
        if not blocks:
            return
        current = next(
            (b for b in blocks if b.get("type") == "sim" and b.get("engine") == "widget"),
            next((b for b in blocks if b.get("type") in {"chart", "sim", "formula"}), blocks[0]),
        )
        block_id = str(current.get("id") or "")
        if not block_id:
            return
        targets.setdefault(block_id, []).append(
            {
                "blockId": block_id,
                "severity": "major",
                "problem": "；".join(issues),
                "instruction": "本轮保持当前 block 类型，先修正其内容、代码、数据或数学映射；若学习证据仍不成立，下一轮可再次重新编译页面。",
            }
        )

    async def regenerate_scene(scene: dict[str, Any], issues: list[str]) -> bool:
        """pageIssue 说明原类型/布局不可救：生成新骨架，再把该页全部 block 重生。"""
        sid = str(scene.get("id") or "?")
        brief = page_briefs.get(sid, _page_brief(scene))
        skeleton, err = await replan_page(
            llm,
            current_scene=scene,
            brief=brief,
            issues=issues,
            topic=topic,
            audience=audience,
            material=material,
            allowed_types=set(planning),
            type_descriptions=skill_descriptions,
            all_scenes=scenes,
        )
        if skeleton is None:
            warnings.append(f"逐页质检重规划失败 {sid}: {err}")
            return False
        new_brief = _page_brief(skeleton)
        skeleton.pop("brief", None)
        assign_layouts({"scenes": [skeleton]})
        placeholders = [
            lower_planning_placeholder(dict(block), planning)
            for block in (skeleton.get("blocks") or [])
        ]
        scene_ctx = _block_scene_context(skeleton, new_brief, placeholders)

        async def generate_one(ph: dict[str, Any], _i: int) -> tuple[dict[str, Any], BlockResult]:
            reg = registry.get(str(ph.get("type") or ""))
            if reg is None:
                return ph, BlockResult(None, f"无技能处理 type {ph.get('type')}")
            progress({"type": "block", "blockId": ph.get("id"), "sceneId": sid, "status": "active"})
            if ph.get("type") == "sim" and ph.get("engine") == "widget":
                profile = str(ph.get("_simProfile") or "state")
                preplanned, problem = compile_interaction_brief(
                    ph.get("interactionBrief"),
                    profile=profile,
                    core_insight=str(new_brief.get("objective") or ph.get("intent") or "理解核心过程"),
                )
                log(
                    f"  ↳ {ph.get('id')} widget-route={'fast-build' if preplanned else 'slow-plan'} profile={profile}"
                    + (f" ({problem})" if problem else "")
                )
                result = await generate_widget(
                    llm,
                    intent=(
                        f"{ph.get('intent', '')}\n本块角色: {ph.get('role') or 'visualization'}。\n"
                        f"{scene_ctx}"
                    ),
                    theme=str(doc.get("theme") or "cartesian"),
                    language=str(doc.get("language") or "zh-CN"),
                    topic=topic,
                    material=material,
                    guidelines=load_widget_guidelines(reg.dir),
                    preplanned_contract=preplanned,
                )
            else:
                result = await generate_block(
                    llm,
                    type=str(ph.get("type")),
                    intent=str(ph.get("intent") or ""),
                    scene_ctx=scene_ctx + f"\n当前 block 角色: {ph.get('role') or 'support'}。",
                    contract=reg.contract,
                    topic=topic,
                    material=material,
                    tools=tools if ph.get("type") == "sim" else None,
                )
            _emit_block_done(progress, str(ph.get("id") or "?"), sid, result.err)
            return ph, result

        generated = await pool(placeholders, min(concurrency, max(1, len(placeholders))), generate_one)
        if any(result.block is None for _ph, result in generated):
            failed = [f"{ph.get('id')}: {result.err}" for ph, result in generated if result.block is None]
            warnings.append(f"逐页质检重规划生成失败 {sid}: {'；'.join(failed)}")
            return False
        final_blocks: list[dict[str, Any]] = []
        for ph, result in generated:
            block = dict(result.block or {})
            block["id"] = ph.get("id")
            final_blocks.append(block)
            placeholder_specs[str(ph.get("id"))] = ph
        skeleton["blocks"] = final_blocks
        page_briefs[sid] = new_brief
        scene.clear()
        scene.update(skeleton)
        log(f"[quality] {sid}: pageIssue → 整页重规划并重生 {len(final_blocks)} blocks")
        return True

    for rnd in range(1, rounds + 1):
        review_scenes = [s for s in scenes if str(s.get("id") or "?") in active_scene_ids]
        if not review_scenes:
            break

        async def inspect(scene: dict[str, Any], _i: int) -> tuple[dict[str, Any], Any]:
            brief = page_briefs.get(str(scene.get("id")), _page_brief(scene))
            return scene, await review_page(
                llm,
                topic=topic,
                scene=scene,
                brief=brief,
                audience=audience,
                material=material,
            )

        reviews = await pool(review_scenes, concurrency, inspect)
        targets: dict[str, list[dict[str, str]]] = {}
        replan_targets: list[tuple[dict[str, Any], list[str]]] = []
        for scene, review in reviews:
            sid = str(scene.get("id") or "?")
            log(
                f"[quality] 第 {rnd} 轮 {sid}: {review.score:.1f}/10"
                + (" pass" if review.passed else " needs-work")
            )
            latest[sid] = {
                "sceneId": sid,
                "score": review.score,
                "pass": review.passed,
                "blockIssues": review.block_issues,
                "pageIssues": review.page_issues,
            }
            if review.page_issues and sid not in replan_succeeded:
                combined = review.page_issues + [
                    f"{x['problem']}；{x['instruction']}" for x in review.block_issues
                ]
                replan_targets.append((scene, combined))
            else:
                for issue in review.block_issues:
                    targets.setdefault(issue["blockId"], []).append(issue)
                if review.page_issues:
                    route_page_issues(scene, review.page_issues, targets)

        if not targets and not replan_targets:
            last_changed = set()
            break

        changed_this_round: set[str] = set()
        if replan_targets:
            async def replan_one(item: tuple[dict[str, Any], list[str]], _i: int) -> tuple[str, bool]:
                scene, issues = item
                return str(scene.get("id") or "?"), await regenerate_scene(scene, issues)

            for sid, changed in await pool(replan_targets, concurrency, replan_one):
                if changed:
                    changed_this_round.add(sid)
                    replan_succeeded.add(sid)
                else:
                    failed_scene, failed_issues = next(
                        (scene, issues)
                        for scene, issues in replan_targets
                        if str(scene.get("id") or "?") == sid
                    )
                    route_page_issues(failed_scene, failed_issues, targets)

        block_locations = {
            str(block.get("id")): (scene, bi, block)
            for scene in scenes
            for bi, block in enumerate(scene.get("blocks") or [])
            if block.get("id")
        }

        async def fix(
            item: tuple[str, list[dict[str, str]]],
            _i: int,
            locations: dict[str, tuple[dict[str, Any], int, dict[str, Any]]] = block_locations,
            changed: set[str] = changed_this_round,
        ) -> None:
            block_id, issues = item
            located = locations.get(block_id)
            if not located:
                warnings.append(f"逐页质检定位到不存在的 block: {block_id}")
                return
            scene, bi, current = located
            spec = placeholder_specs.get(block_id, {})
            block_type = str(current.get("type") or spec.get("type") or "")
            reg = registry.get(block_type)
            if not reg:
                warnings.append(f"逐页质检无法回炉未知 block 类型: {block_id}/{block_type}")
                return
            corrections = "\n".join(
                f"- [{x['severity']}] {x['problem']}；修法：{x['instruction']}" for x in issues
            )
            brief = page_briefs.get(str(scene.get("id")), _page_brief(scene))
            scene_ctx = _block_scene_context(scene, brief, list(scene.get("blocks") or []))
            scene_ctx += "\n当前整页真实内容：\n" + json.dumps(scene, ensure_ascii=False)
            intent = (
                str(spec.get("intent") or "保持原教学意图")
                + "\n逐页质量门要求修正：\n"
                + corrections
                + "\n保持 block id、类型及本页唯一 keyClaim，不新增无来源事实。"
            )
            progress({"type": "block", "blockId": block_id, "sceneId": scene.get("id"), "status": "err"})
            if block_type == "sim" and (spec.get("engine") == "widget" or current.get("engine") == "widget"):
                result = await repair_widget(
                    llm,
                    current=current,
                    issues=intent + "\n" + scene_ctx,
                    theme=str(doc.get("theme") or "cartesian"),
                    language=str(doc.get("language") or "zh-CN"),
                    topic=topic,
                    guidelines=load_widget_guidelines(reg.dir),
                )
            else:
                result = await generate_block(
                    llm,
                    type=block_type,
                    intent=intent,
                    scene_ctx=scene_ctx,
                    contract=reg.contract,
                    topic=topic,
                    material=material,
                    tools=tools if block_type == "sim" else None,
                )
            if result.block:
                result.block["id"] = block_id
                scene["blocks"][bi] = result.block
                changed.add(str(scene.get("id") or "?"))
                progress({"type": "docUpdated", "blockId": block_id, "sceneId": scene.get("id"), "status": "done"})
            else:
                warnings.append(f"逐页质检回炉失败 {block_id}: {result.err}")

        if targets:
            await pool(list(targets.items()), concurrency, fix)
        if changed_this_round:
            attach_icons(doc)
        progress({"type": "docUpdated", "doc": doc, "reason": "quality"})
        active_scene_ids = changed_this_round
        last_changed = changed_this_round

    # 最后一轮回炉后的页尚未被查看；只复核这一小组。更早修过的页已在下一轮复核过，不重复花费。
    audit_scenes = [s for s in scenes if str(s.get("id") or "?") in last_changed]
    if audit_scenes:
        async def audit(scene: dict[str, Any], _i: int) -> tuple[dict[str, Any], Any]:
            brief = page_briefs.get(str(scene.get("id")), _page_brief(scene))
            return scene, await review_page(
                llm,
                topic=topic,
                scene=scene,
                brief=brief,
                audience=audience,
                material=material,
            )

        for scene, review in await pool(audit_scenes, concurrency, audit):
            sid = str(scene.get("id") or "?")
            latest[sid] = {
                "sceneId": sid,
                "score": review.score,
                "pass": review.passed,
                "blockIssues": review.block_issues,
                "pageIssues": review.page_issues,
            }
            log(f"[quality] 最终复核 {sid}: {review.score:.1f}/10" + (" pass" if review.passed else " needs-work"))
    for sid, item in latest.items():
        if item.get("pass"):
            continue
        for issue in item.get("pageIssues") or []:
            warnings.append(f"逐页最终复核 {sid}（{float(item.get('score') or 0):.1f}/10）：{issue}")
    return warnings, list(latest.values())


async def _attach_hero_image(
    doc: dict[str, Any],
    topic: str,
    image_finder: ImageFinder | None,
    image_generator: ImageGenerator | None,
) -> None:
    """封面配图：先查图库，查无再文生图兜底。两者都缺/都失败就不配图，不阻断生成。"""
    if not image_finder and not image_generator:
        return
    hero = next(
        (
            b
            for s in doc.get("scenes", [])
            for b in (s.get("blocks") or [])
            if b.get("type") == "hero"
        ),
        None,
    )
    if hero is None or hero.get("image"):
        return
    query = " ".join(hero.get("title") or []) or topic
    asset = None
    if image_finder:
        try:
            asset = await image_finder.find_image(query)
        except Exception:  # noqa: BLE001 - 配图失败不阻断整份生成
            asset = None
    if asset is None and image_generator:
        try:
            asset = await image_generator.generate_image(
                f"一张适合作为课程封面配图的插图，主题：{query}"
            )
        except Exception:  # noqa: BLE001
            asset = None
    if asset:
        hero["image"] = asset.data_uri


def _media_enabled(value: bool | str) -> bool:
    return value is True or str(value).strip().lower() in {"auto", "true", "on", "yes", "1"}


async def _generate_media_block(
    placeholder: dict[str, Any],
    *,
    design_brief: dict[str, Any],
    image_finder: ImageFinder | None,
    image_generator: ImageGenerator | None,
    assets: dict[str, dict[str, Any]],
) -> BlockResult:
    """Resolve one planner-selected media request; never invent an asset id or force a request."""
    purpose = str(placeholder.get("purpose") or "")
    placement = str(placeholder.get("placement") or "")
    subject = str(placeholder.get("subject") or placeholder.get("intent") or "").strip()
    relationship = str(placeholder.get("relationshipToContent") or "").strip()
    fidelity = str(placeholder.get("fidelity") or "conceptual")
    if purpose not in {"evidence", "explanatory", "narrative", "atmospheric"}:
        return BlockResult(None, "media 缺合法 purpose")
    if placement not in {"illustration", "decoration", "background"}:
        return BlockResult(None, "media 缺合法 placement")
    if placement == "background" and purpose == "evidence":
        return BlockResult(None, "evidence 不得作为背景；应改用 illustration")
    if not subject:
        return BlockResult(None, "media 缺 subject")
    if not image_finder and not image_generator:
        return BlockResult(None, "规划选择了 media，但没有可用的 ImageFinder/ImageGenerator")

    strategy = str(placeholder.get("sourceStrategy") or "").strip()
    if strategy not in {"search-first", "generate-first"}:
        strategy = "generate-first" if purpose == "atmospheric" or placement == "decoration" else "search-first"
    query = subject + (f"；{relationship}" if relationship else "")
    dna = json.dumps(design_brief.get("designDNA") or {}, ensure_ascii=False)
    prompt = (
        f"为课程页面制作一张无文字视觉资产。主体：{subject}。用途：{purpose}；放置：{placement}；"
        f"保真要求：{fidelity}。与内容关系：{relationship or '支持页面设计意图'}。"
        f"Design DNA：{dna}。保留原生文字安全区；不要字母、汉字、数字、公式、图表、标签、UI、logo、水印或伪文字。"
    )
    asset = None
    route = ""
    async def try_finder() -> Any:
        if image_finder is None:
            return None
        try:
            return await image_finder.find_image(query)
        except Exception:  # noqa: BLE001 - 单资产失败允许走另一来源
            return None

    async def try_generator() -> Any:
        if image_generator is None:
            return None
        try:
            return await image_generator.generate_image(prompt)
        except Exception:  # noqa: BLE001 - 单资产失败允许走另一来源
            return None

    if strategy == "search-first":
        asset = await try_finder()
        route = "finder" if asset is not None else ""
        if asset is None:
            asset = await try_generator()
            route = "generator" if asset is not None else ""
    else:
        asset = await try_generator()
        route = "generator" if asset is not None else ""
        if asset is None:
            asset = await try_finder()
            route = "finder" if asset is not None else ""
    if asset is None:
        return BlockResult(None, f"media 资产获取失败: {subject}")

    raw_id = re.sub(r"[^a-z0-9-]+", "-", str(placeholder.get("id") or "media").lower()).strip("-")
    asset_id = f"asset-{raw_id or 'media'}"
    assets[asset_id] = {
        "id": asset_id,
        "kind": "photo" if route == "finder" else ("texture" if placement == "decoration" else "generated-art"),
        "src": asset.data_uri,
        "alt": "" if placement == "decoration" else subject,
        "source": asset.source or ("image-finder" if route == "finder" else "generated illustration"),
        "attribution": asset.attribution,
        "promptOrQuery": query if route == "finder" else prompt,
        "focalPoint": placeholder.get("focalPoint") or {"x": 0.5, "y": 0.5},
    }
    if asset.width:
        assets[asset_id]["width"] = asset.width
    if asset.height:
        assets[asset_id]["height"] = asset.height
    if not assets[asset_id].get("attribution"):
        assets[asset_id].pop("attribution", None)
    block: dict[str, Any] = {
        "type": "media",
        "assetId": asset_id,
        "purpose": purpose,
        "placement": placement,
        "fit": str(placeholder.get("fit") or ("cover" if placement == "background" else "contain")),
    }
    if asset.width and asset.height:
        block["aspectRatio"] = max(0.25, min(4.0, round(asset.width / asset.height, 4)))
    focal = placeholder.get("objectPosition") or placeholder.get("focalPoint")
    if isinstance(focal, dict):
        block["objectPosition"] = {
            "x": max(0.0, min(1.0, float(focal.get("x", 0.5)))),
            "y": max(0.0, min(1.0, float(focal.get("y", 0.5)))),
        }
    treatment = str(placeholder.get("treatment") or "")
    if treatment not in {"none", "frame", "full-bleed", "cutout", "duotone", "soft-mask"}:
        treatment = (
            "none" if placement in {"background", "decoration"}
            else "frame" if route == "finder"
            else "soft-mask"
        )
    block["treatment"] = treatment
    if placeholder.get("caption"):
        block["caption"] = str(placeholder["caption"])
    for key in ("mask", "safeZone", "overlay", "overlayStrength"):
        if placeholder.get(key) is not None:
            block[key] = placeholder[key]
    return BlockResult(block)


def _lower_media_backgrounds(doc: dict[str, Any]) -> list[str]:
    """Move generated background requests into scene.background after assets exist."""
    warnings: list[str] = []
    for scene in doc.get("scenes", []) or []:
        blocks = list(scene.get("blocks") or [])
        backgrounds = [
            block for block in blocks
            if isinstance(block, dict) and block.get("type") == "media" and block.get("placement") == "background"
        ]
        if not backgrounds:
            continue
        chosen = backgrounds[0]
        remaining = [block for block in blocks if block is not chosen]
        if not remaining:
            chosen["placement"] = "illustration"
            warnings.append(f"{scene.get('id')}: background 缺原生内容层，降级为 illustration")
            continue
        scene["background"] = {
            "assetId": chosen["assetId"],
            "purpose": chosen.get("purpose") or "atmospheric",
            "fit": chosen.get("fit") or "cover",
            "overlay": chosen.get("overlay") or "scrim",
            "overlayStrength": chosen.get("overlayStrength", 0.45),
            "safeZone": chosen.get("safeZone") or "content-safe",
        }
        scene["blocks"] = remaining
        scene.pop("layout", None)
        if len(backgrounds) > 1:
            warnings.append(f"{scene.get('id')}: 多个 background 请求，仅采用第一个")
    return warnings


def _compile_page_design(
    doc: dict[str, Any],
    *,
    page_visual_briefs: dict[str, dict[str, Any]],
    design_brief: dict[str, Any],
) -> list[str]:
    """Compile page intent after real blocks/assets exist; preserve specialized hero/section renderers."""
    warnings: list[str] = []
    assets = doc.get("assets") or []
    for scene in doc.get("scenes") or []:
        if scene.get("kind") in {"hero", "section"}:
            continue
        sid = str(scene.get("id") or "?")
        visual_brief = page_visual_briefs.get(sid, {})
        try:
            scene["layout"] = compile_scene_composition(
                scene,
                visual_brief=visual_brief,
                design_brief=design_brief,
                assets=assets,
            )
        except (TypeError, ValueError) as exc:
            warnings.append(f"{sid}: 设计编译失败，保留兼容布局: {str(exc)[:160]}")
    return warnings


def _visual_report_payload(report: Any) -> dict[str, Any]:
    return {
        "available": bool(report.available),
        "scores": report.scores.as_dict(),
        "issues": [
            {
                "sceneId": issue.scene_id,
                "route": issue.route,
                "problem": issue.problem,
                "instruction": issue.instruction,
            }
            for issue in report.issues
        ],
        "summary": report.summary,
        "warnings": list(report.warnings),
    }


def _focus_artboard(scene: dict[str, Any]) -> dict[str, Any]:
    """Deterministic failed-page repair: enlarge the strongest evidence without changing content."""
    blocks = [block for block in (scene.get("blocks") or []) if isinstance(block, dict)]
    priority = {"sim": 0, "runnable": 0, "media": 1, "chart": 1, "diagram": 1, "graph": 1}
    ranked = sorted(
        blocks,
        key=lambda block: (
            priority.get(str(block.get("type") or ""), 2),
            {"xl": 0, "l": 1, "m": 2, "s": 3}.get(str(block.get("size") or "m"), 2),
        ),
    )
    main = ranked[0]
    others = [block for block in blocks if block is not main]
    areas = [
        {
            "blockIds": [str(main.get("id"))],
            "col": [1, 10 if others else 13],
            "row": [4, 13],
            "z": 1,
            "align": "stretch",
            "justify": "stretch",
            "bleed": False,
            "clip": True,
            "styleRole": "feature",
        }
    ]
    for index, block in enumerate(others):
        start = 4 + round(9 * index / len(others))
        end = 4 + round(9 * (index + 1) / len(others))
        areas.append(
            {
                "blockIds": [str(block.get("id"))],
                "col": [10, 13],
                "row": [start, max(start + 1, end)],
                "z": 1,
                "align": "stretch",
                "justify": "stretch",
                "bleed": False,
                "clip": True,
                "styleRole": "aside",
            }
        )
    return {
        "kind": "artboard",
        "columns": 12,
        "rows": 12,
        "gap": 14,
        "family": str(scene.get("compositionFamily") or "annotated-specimen"),
        "variant": "visual-repair-focus",
        "titleRegion": {
            "col": [1, 10], "row": [1, 4], "align": "start",
            "justify": "start", "maxWidth": 86, "z": 3,
        },
        "areas": areas,
    }


def _apply_visual_contract_repairs(
    doc: dict[str, Any], issues: list[VisualIssue]
) -> tuple[set[str], list[VisualIssue]]:
    """Apply safe token/composition/media routes; return scenes changed and content routes."""
    changed: set[str] = set()
    content_issues: list[VisualIssue] = []
    by_scene = {str(scene.get("id") or "?"): scene for scene in doc.get("scenes") or []}
    assets = {str(asset.get("id")): asset for asset in doc.get("assets") or [] if isinstance(asset, dict)}
    tokens_repaired = False
    for issue in issues:
        if issue.route == "tokens":
            if not tokens_repaired:
                visual = doc.get("visualSystem")
                if isinstance(visual, dict):
                    typography = visual.get("typography")
                    if isinstance(typography, dict):
                        typography["scale"] = "editorial"
                        typography["displayWeight"] = max(700, int(typography.get("displayWeight") or 700))
                    palette = visual.get("palette")
                    if isinstance(palette, dict) and palette.get("ink"):
                        palette["muted"] = str(palette["ink"])
                tokens_repaired = True
            changed.update(by_scene)
            continue
        scene = by_scene.get(issue.scene_id)
        if scene is None:
            continue
        if issue.route == "composition":
            if scene.get("kind") not in {"hero", "section"}:
                scene["layout"] = _focus_artboard(scene)
                changed.add(issue.scene_id)
        elif issue.route == "media":
            background = scene.get("background")
            if isinstance(background, dict):
                background["fit"] = "cover"
                background["overlay"] = "scrim"
                background["overlayStrength"] = max(0.42, float(background.get("overlayStrength") or 0.45))
            for block in scene.get("blocks") or []:
                if not isinstance(block, dict) or block.get("type") != "media":
                    continue
                asset = assets.get(str(block.get("assetId") or ""), {})
                focal = asset.get("focalPoint")
                if isinstance(focal, dict):
                    block["objectPosition"] = {"x": focal.get("x", 0.5), "y": focal.get("y", 0.5)}
                block["fit"] = "cover"
                block["treatment"] = "cutout" if asset.get("kind") == "cutout" else "frame"
            changed.add(issue.scene_id)
        else:
            content_issues.append(issue)
    return changed, content_issues


async def generate_lecture(
    llm: LLMClient,
    *,
    topic: str,
    pages: int = 12,
    theme: str = "",
    audience: str = "",
    wants: str = "",
    extra: str = "",
    material: str = "",
    coverage: bool = False,
    options: GeneratorOptions | None = None,
    skills_dir: str | None = None,
    image_finder: ImageFinder | None = None,
    image_generator: ImageGenerator | None = None,
    render_verifier: RenderVerifier | None = None,
    visual_reviewer: VisualReviewer | None = None,
    log: Callable[[str], None] = lambda _m: None,
    progress: Callable[[dict[str, Any]], None] = lambda _e: None,
) -> GenerateResult:
    # progress：结构化进度观测点（供 Web App 的进度视图消费；纯观测，不影响生成）。
    # 事件形如 {"type": "stage"|"skeleton"|"block"|"docUpdated"|"done", ...}；回调不得抛异常。
    opts = options or GeneratorOptions()
    registry, planning = load_skill_catalog(skills_dir)
    media_enabled = _media_enabled(opts.media)
    planning_surface = (
        planning if media_enabled else {name: entry for name, entry in planning.items() if name != "media"}
    )
    tool_kit: dict[str, Tool] | None = {"calc": CalcTool()} if opts.tools else None

    mat = await condense_material(llm, material, topic=topic, target_chars=4000) if material else ""

    # ① Plan（STORM 多视角）
    log(f"[plan] 课题: {topic} (~{pages} 页)")
    progress({"type": "stage", "stage": "plan", "status": "start"})
    plan = await plan_lecture(
        llm,
        topic=topic,
        pages=pages,
        theme=theme,
        audience=audience,
        wants=wants,
        extra=extra,
        material=mat,
        type_menu=plan_menu(registry, planning_surface),
        theme_menu=theme_menu(),
        authoring_rules=AUTHORING_RULES + "\n\n课程级视觉导演规则：\n" + load_design_rules(skills_dir),
        perspectives_n=opts.plan_perspectives,
        sections=opts.sections,
        concurrency=opts.concurrency,
    )
    doc = plan.doc
    design_brief_value = doc.get("designBrief")
    design_brief: dict[str, Any] = design_brief_value if isinstance(design_brief_value, dict) else {}
    # Design DNA 不再只当 prompt 散文：编译成 Viewer 可执行的闭合 token contract。
    doc["visualSystem"] = compile_visual_system(design_brief)
    # 课程级证据义务只在规划/质检阶段存在；最终 LectureDoc 不公开这些内部字段。
    doc["_knowledgeForms"] = list(plan.knowledge_forms)
    doc["_evidenceObligations"] = list(plan.evidence_obligations)
    plan_quality_warnings: list[str] = []
    skill_descriptions = _skill_decision_descriptions(registry, planning)
    if opts.plan_quality_rounds > 0:
        progress({"type": "stage", "stage": "plan-quality", "status": "start"})
    # rounds=0 仍运行确定性的证据路由/容量守卫；制度约束不能依赖是否开启额外 LLM 审查。
    plan_quality_warnings = await refine_plan(
        llm,
        doc,
        topic=topic,
        audience=audience,
        material=mat,
        allowed_types=set(skill_descriptions),
        type_descriptions=skill_descriptions,
        rounds=opts.plan_quality_rounds,
    )
    for warning in plan_quality_warnings:
        log(f"[plan-quality] {warning}")
    if opts.plan_quality_rounds > 0:
        progress({"type": "stage", "stage": "plan-quality", "status": "done"})
    doc["schemaVersion"] = "1.0"
    doc.setdefault("language", "zh-CN")
    if theme:
        doc["theme"] = theme
    doc.setdefault("id", "lecture")

    placeholders: list[tuple[dict[str, Any], dict[str, Any]]] = []
    placeholder_specs: dict[str, dict[str, Any]] = {}
    page_briefs: dict[str, dict[str, str]] = {}
    page_visual_briefs: dict[str, dict[str, Any]] = {}
    used_block_ids: set[str] = set()
    for si, s in enumerate(doc.get("scenes", [])):
        s["id"] = s.get("id") or f"s{si}"  # 稳定 scene id：供进度视图 / 版式引用（与 block id 同规）
        # brief 是规划→生成→讲稿/质检之间的内部契约。先保存，随后从 scene 移除，
        # 避免规划元数据混进最终 LectureDoc 或被 viewer 当成公开内容。
        page_briefs[str(s["id"])] = _page_brief(s)
        page_visual_briefs[str(s["id"])] = _page_visual_brief(s)
        composition = page_visual_briefs[str(s["id"])].get("compositionFamily")
        if composition:
            s["compositionFamily"] = composition
        s.pop("brief", None)
        s.pop("visualBrief", None)
        for bi, b in enumerate(s.get("blocks") or []):
            original_id = str(b.get("id") or "")
            block_id = original_id or f"s{si}b{bi}"
            if block_id in used_block_ids:
                block_id = f"s{si}b{bi}"
                suffix = 2
                while block_id in used_block_ids:
                    block_id = f"s{si}b{bi}-{suffix}"
                    suffix += 1
                log(f"[plan] 重复 block id {original_id!r} → {block_id}")
            b["id"] = block_id
            used_block_ids.add(block_id)
            if b.get("type") not in planning and b.get("type") not in registry:  # 防幻觉类型丢内容
                log(f'[plan] 未知 type "{b.get("type")}"，回退 list')
                b["type"] = "list"
            lowered = lower_planning_placeholder(b, planning)
            b.clear()
            b.update(lowered)
            placeholder_specs[str(b["id"])] = dict(b)
            placeholders.append((b, s))

    removed_for_budget = doc.pop("_budgetRemovedScenes", None)
    if removed_for_budget:
        log(f"[plan] 页数预算编译移除: {', '.join(str(value) for value in removed_for_budget)}")
    doc.pop("_knowledgeForms", None)
    doc.pop("_evidenceObligations", None)
    doc.pop("designBrief", None)

    assign_layouts(doc)
    log(
        f"[plan] {len(doc.get('scenes', []))} 页 / {len(placeholders)} block；theme={doc.get('theme')}"
    )
    # 骨架就绪：先发结构（页/块占位）供进度视图搭骨架，再标记规划阶段结束。
    progress(
        {
            "type": "skeleton",
            "doc": {
                "title": doc.get("title"),
                "theme": doc.get("theme"),
                "scenes": [
                    {
                        "id": s.get("id"),
                        "kind": s.get("kind"),
                        "headline": s.get("headline"),
                        "eyebrow": s.get("eyebrow"),
                        "blocks": [
                            {"id": b.get("id"), "type": b.get("type")}
                            for b in (s.get("blocks") or [])
                        ],
                    }
                    for s in doc.get("scenes", [])
                ],
            },
        }
    )
    progress({"type": "stage", "stage": "plan", "status": "done"})

    # ② Fan-out（逐块生成；no_fanout 消融 = 串行）
    conc = opts.concurrency if opts.fanout else 1
    # sim.widget 走独立 plan→build→repair 子配方；预加载一次裁剪版 craft 指引（仅当真有 widget 块）。
    widget_guidelines = ""
    if any(p[0].get("type") == "sim" and p[0].get("engine") == "widget" for p in placeholders):
        sim_reg = registry.get("sim")
        if sim_reg:
            widget_guidelines = load_widget_guidelines(sim_reg.dir)

    progress({"type": "stage", "stage": "fanout", "status": "start", "total": len(placeholders)})
    widget_routes: list[dict[str, str]] = []
    asset_records: dict[str, dict[str, Any]] = {}

    async def gen(item: tuple[dict[str, Any], dict[str, Any]], _i: int) -> tuple[str, BlockResult]:
        ph, scene = item
        brief = page_briefs.get(str(scene.get("id")), _page_brief(scene))
        visual_brief = page_visual_briefs.get(str(scene.get("id")), {})
        scene_ctx = _block_scene_context(
            scene,
            brief,
            list(scene.get("blocks") or []),
            visual_brief=visual_brief,
            design_brief=design_brief,
        )
        progress(
            {"type": "block", "blockId": ph["id"], "sceneId": scene.get("id"), "status": "active"}
        )
        reg = registry.get(ph["type"])
        if not reg:
            progress({"type": "block", "blockId": ph["id"], "sceneId": scene.get("id"), "status": "err"})
            return ph["id"], BlockResult(None, f"无技能处理 type {ph['type']}")
        if ph["type"] == "media":
            if not media_enabled:
                result = BlockResult(None, "media 能力已禁用")
            else:
                result = await _generate_media_block(
                    ph,
                    design_brief=design_brief,
                    image_finder=image_finder,
                    image_generator=image_generator,
                    assets=asset_records,
                )
            log(f"  {'✗' if result.err else '✓'} {ph['id']} (media:{ph.get('purpose')}/{ph.get('placement')})")
            _emit_block_done(progress, ph["id"], scene.get("id"), result.err)
            return ph["id"], result
        if ph["type"] == "sim" and ph.get("engine") == "widget":
            # 逃生舱：直接产 HTML 片段，两阶段（先契约后写码）+ 校验自修，观感钉死 deck 主题。
            profile = str(ph.get("_simProfile") or "state")
            preplanned, contract_problem = compile_interaction_brief(
                ph.get("interactionBrief"),
                profile=profile,
                core_insight=str(brief.get("objective") or ph.get("intent") or "理解核心过程"),
            )
            route = "fast-build" if preplanned is not None else "slow-plan"
            widget_routes.append(
                {"blockId": str(ph["id"]), "profile": profile, "route": route}
            )
            log(
                f"  ↳ {ph['id']} widget-route={route} profile={profile}"
                + (f" ({contract_problem})" if contract_problem else "")
            )
            r = await generate_widget(
                llm,
                intent=(
                    f"{ph.get('intent', '')}\n本块角色: {ph.get('role') or 'visualization'}。\n"
                    f"{scene_ctx}"
                ),
                theme=str(doc.get("theme") or "cartesian"),
                language=str(doc.get("language") or "zh-CN"),
                topic=topic,
                material=mat,
                guidelines=widget_guidelines,
                preplanned_contract=preplanned,
            )
            log(f"  {'✗' if r.err else '✓'} {ph['id']} (sim:widget)")
            _emit_block_done(progress, ph["id"], scene.get("id"), r.err)
            return ph["id"], r
        r = await generate_block(
            llm,
            type=ph["type"],
            intent=ph.get("intent", ""),
            scene_ctx=scene_ctx + f"\n当前 block 角色: {ph.get('role') or 'support'}。",
            contract=reg.contract,
            topic=topic,
            material=mat,
            tools=tool_kit if ph["type"] == "sim" else None,
        )
        log(f"  {'✗' if r.err else '✓'} {ph['id']} ({ph['type']})")
        _emit_block_done(progress, ph["id"], scene.get("id"), r.err)
        return ph["id"], r

    results = await pool(placeholders, conc, gen)
    # 初始 fan-out 的网络/模型长尾不应直接变成 dropped block。只对失败节点再调度一次；
    # 每个节点内部已有任务级 deadline，所以这次重试仍然有界，不会恢复成 provider 的数小时尾部。
    failed_ids = {bid for bid, result in results if result.block is None}
    if failed_ids:
        retry_items = [item for item in placeholders if str(item[0].get("id")) in failed_ids]
        log(f"[fanout] {len(retry_items)} block 首次失败，进行一次有界重试")
        retried = await pool(retry_items, min(conc, max(1, len(retry_items))), gen)
        retry_map = dict(retried)
        results = [
            (bid, retry_map.get(bid, result)) if bid in retry_map else (bid, result)
            for bid, result in results
        ]
    blocks_by_id = {bid: r.block for bid, r in results}

    # ③ Assemble（回填）
    progress({"type": "stage", "stage": "assemble", "status": "start"})
    dropped = fill_blocks(doc, blocks_by_id)
    if dropped:
        # fill_blocks 会清掉引用失效 block 的 layout；基于剩余真实类型重新分配，避免 anchor/steps 悬空。
        assign_layouts(doc)
    attach_icons(doc)  # 确定性收尾：list 项按关键词自动配本地图标（零 LLM/零网络）
    if asset_records:
        doc["assets"] = list(asset_records.values())
    for warning in _lower_media_backgrounds(doc):
        log(f"[media] {warning}")
        plan_quality_warnings.append(warning)
    for warning in _compile_page_design(
        doc,
        page_visual_briefs=page_visual_briefs,
        design_brief=design_brief,
    ):
        log(f"[design] {warning}")
        plan_quality_warnings.append(warning)
    assign_layouts(doc)
    if opts.media is True:
        await _attach_hero_image(doc, topic, image_finder, image_generator)
    for s in doc.get("scenes", []):  # 每页组装完成 → 转绿
        progress({"type": "docUpdated", "sceneId": s.get("id"), "status": "done"})
    progress({"type": "stage", "stage": "assemble", "status": "done"})

    # ④ 整档校验 + 结构自修（revise 消融可关）
    progress({"type": "stage", "stage": "validate", "status": "start"})
    if opts.revise:
        final = await _doc_repair(
            llm, doc, registry, mat, log, tool_kit, topic=topic,
            concurrency=opts.concurrency, progress=progress,
        )
    else:
        final = validate_doc(doc)
    quality_summary: list[dict[str, Any]] = []
    final.warnings.extend(plan_quality_warnings)
    progress({"type": "docUpdated", "doc": doc, "reason": "validate"})
    progress({"type": "stage", "stage": "validate", "status": "done"})

    # ④.3 逐页语义质量门：完整查看同页公式/数据/解释/视觉类型，问题按 block id 定点回炉。
    # 与结构校验分离：schema 合法只说明“能渲染”，不说明“讲得对、图选对、数据有依据”。
    if opts.quality_rounds > 0 and not final.errors:
        progress({"type": "stage", "stage": "quality", "status": "start"})
        quality_warnings, quality_summary = await _quality_repair(
            llm,
            doc,
            registry=registry,
            planning=planning,
            page_briefs=page_briefs,
            placeholder_specs=placeholder_specs,
            topic=topic,
            audience=audience,
            material=mat,
            concurrency=opts.concurrency,
            rounds=opts.quality_rounds,
            tools=tool_kit,
            log=log,
            progress=progress,
        )
        final = validate_doc(doc)
        final.warnings.extend(quality_warnings)
        progress({"type": "stage", "stage": "quality", "status": "done"})

    # ④.5 真机渲染验收 → 溢出页回炉精简（注入了 render_verifier 才跑）
    #
    # 这是流水线唯一的**视觉**反馈点。此前 SPEC 写着「每页 scrollHeight ≤ 720、禁溢出」，
    # 但没有任何东西在执行——溢出的页被渲染器 zoom 到下限后直接裁掉，无人知晓。
    # 注意顺序：必须在 notes 之前，因为回炉会改写 scene 内容，讲者备注只能依据最终文本。
    render_report = None
    render_hard_errors: list[str] = []
    render_changed_scene_ids: set[str] = set()
    visual_quality_payload: dict[str, Any] | None = None
    # 即使结构/语义校验已有错误，也至少执行一次只读浏览器诊断并产出截图。
    # 否则 schema error 会遮蔽真实的溢出、空白或 widget 运行时问题，视觉报告还会
    # 误写成“浏览器未返回指标”。只有进入本阶段时 schema 已合法，才允许自动回炉。
    schema_valid_for_render_repairs = not final.errors
    if render_verifier is not None and opts.render_rounds > 0:
        progress({"type": "stage", "stage": "render", "status": "start"})
        for rnd in range(1, opts.render_rounds + 1):
            render_report = await render_verifier.verify(json.dumps(doc, ensure_ascii=False))
            if not schema_valid_for_render_repairs:
                log("[render] 文档校验未通过：已完成只读浏览器诊断，跳过自动回炉")
                break
            runtime_bad = {
                int(metric.get("i", -1)): [str(error) for error in metric.get("widgetErrors") or []]
                for metric in render_report.page_metrics
                if metric.get("widgetErrors")
                and 0 <= int(metric.get("i", -1)) < len(doc.get("scenes") or [])
            }
            if runtime_bad:
                log(f"[render] 第 {rnd} 轮: {len(runtime_bad)} 页 widget 运行时错误，定点修复")

                async def fix_runtime_widget(
                    item: tuple[int, list[str]], _i: int
                ) -> tuple[int, str | None]:
                    idx, errors = item
                    scene = doc["scenes"][idx]
                    widgets = [
                        (bi, block)
                        for bi, block in enumerate(scene.get("blocks") or [])
                        if block.get("type") == "sim" and block.get("engine") == "widget"
                    ]
                    if not widgets:
                        return idx, "浏览器报告 widget 错误，但页面中找不到 widget block"
                    for bi, current in widgets:
                        progress(
                            {
                                "type": "block",
                                "blockId": current.get("id"),
                                "sceneId": scene.get("id"),
                                "status": "err",
                            }
                        )
                        result = await repair_widget(
                            llm,
                            current=current,
                            issues=(
                                "真实浏览器执行失败，必须修正后保持首帧非空：\n- "
                                + "\n- ".join(errors)
                            ),
                            theme=str(doc.get("theme") or "cartesian"),
                            language=str(doc.get("language") or "zh-CN"),
                            topic=topic,
                            guidelines=widget_guidelines,
                            # 浏览器会立即复验；这里只做一次针对错误信息的代码修复，
                            # 避免非致命静态 warning 再触发一轮昂贵调用。
                            rounds=1,
                        )
                        if result.block is None:
                            return idx, result.err or "widget 运行时修复失败"
                        repaired = dict(result.block)
                        repaired["id"] = current.get("id")
                        scene["blocks"][bi] = repaired
                        render_changed_scene_ids.add(str(scene.get("id") or "?"))
                        progress(
                            {
                                "type": "docUpdated",
                                "blockId": repaired.get("id"),
                                "sceneId": scene.get("id"),
                                "status": "done",
                            }
                        )
                    return idx, None

                runtime_results = await pool(
                    sorted(runtime_bad.items()), opts.concurrency, fix_runtime_widget
                )
                runtime_failures = [
                    f"#{idx}: {error}" for idx, error in runtime_results if error is not None
                ]
                if runtime_failures:
                    render_hard_errors = ["widget 运行时修复失败：" + "；".join(runtime_failures)]
                    break
                progress({"type": "docUpdated", "doc": doc, "reason": "widget-runtime-repair"})
                # 运行时修复必须在同一轮真实复验。否则错误若发生在最后一轮，
                # 旧报告可能被当成已解决，形成新的 fake-green。
                render_report = await render_verifier.verify(json.dumps(doc, ensure_ascii=False))
                runtime_bad = {
                    int(metric.get("i", -1)): [
                        str(error) for error in metric.get("widgetErrors") or []
                    ]
                    for metric in render_report.page_metrics
                    if metric.get("widgetErrors")
                    and 0 <= int(metric.get("i", -1)) < len(doc.get("scenes") or [])
                }
                if runtime_bad:
                    render_hard_errors = [
                        "widget 运行时修复后复验仍失败："
                        + "；".join(
                            f"#{idx}: {', '.join(errors)}"
                            for idx, errors in sorted(runtime_bad.items())
                        )
                    ]
                    break
            bad = {
                int(p["page"]): max(
                    1,
                    int(p.get("overflowY") or 0),
                    int(p.get("overflowX") or 0),
                    int(p.get("layoutClip") or 0),
                    int(p.get("mblockClip") or 0),
                )
                for p in render_report.overflow_pages
                if 0 <= int(p["page"]) < len(doc.get("scenes") or [])
            }
            ignored_prefixes = ("D:", "F:", "G:", "I:", "O:")
            non_overflow_errors = [e for e in render_report.errors if not e.startswith(ignored_prefixes)]
            if non_overflow_errors:
                render_hard_errors = non_overflow_errors
                log(f"[render] 第 {rnd} 轮: 运行时硬失败 → {non_overflow_errors[:3]}")
                break
            if not bad:
                log(f"[render] 第 {rnd} 轮: 0 溢出，验收通过")
                break
            log(f"[render] 第 {rnd} 轮: {len(bad)} 页溢出，回炉精简 → {sorted(bad)}")

            async def reflow(item: tuple[int, int], _i: int) -> None:
                idx, px = item
                scene = doc["scenes"][idx]
                progress({"type": "block", "sceneId": scene.get("id"), "status": "err"})
                r = await condense_scene(llm, scene, overflow_px=px, topic=topic)
                if r.scene is not None:
                    doc["scenes"][idx] = r.scene
                    render_changed_scene_ids.add(str(r.scene.get("id") or "?"))
                    progress({"type": "docUpdated", "sceneId": r.scene.get("id"), "status": "done"})
                else:
                    log(f"[render] 第 {idx} 页精简失败: {r.err}")

            await pool(sorted(bad.items()), opts.concurrency, reflow)
            progress({"type": "docUpdated", "doc": doc, "reason": "reflow"})

        # 最终像素级评审：一次看整档截图，按 route 定点修复，然后真机复验。
        if (
            visual_reviewer is not None
            and opts.visual_quality_rounds > 0
            and render_report is not None
            and not render_hard_errors
            and schema_valid_for_render_repairs
        ):
            progress({"type": "stage", "stage": "visual-quality", "status": "start"})

            def metrics_with_context(report: RenderReport) -> list[dict[str, Any]]:
                enriched: list[dict[str, Any]] = []
                scenes = list(doc.get("scenes") or [])
                for metric in report.page_metrics:
                    item = dict(metric)
                    raw_index = item.get("i")
                    if raw_index is None:
                        raw_index = item.get("page", -1)
                    index = int(raw_index)
                    if 0 <= index < len(scenes):
                        scene = scenes[index]
                        item["sceneId"] = str(scene.get("id") or f"page-{index + 1}")
                        item["compositionSignature"] = json.dumps(
                            scene.get("layout") or {}, ensure_ascii=False, sort_keys=True
                        )
                    enriched.append(item)
                return enriched

            preflight = preflight_page_metrics(metrics_with_context(render_report))
            if preflight.hard_errors:
                render_hard_errors.extend(preflight.hard_errors)
            shots = [str(path) for path in render_report.shots]
            if not shots:
                final.warnings.append("视觉审查未运行：渲染器未产出逐页截图")
            elif not render_hard_errors:
                review_images: list[ImageInput] = []
                review_images.extend(shots[1:])
                request = VisualReviewRequest(
                    # shots[0] 是 Reveal overview contact sheet；其余是逐页高分辨率截图。
                    contact_sheet=shots[0],
                    failed_pages=review_images,
                    deck_context={
                        "topic": topic,
                        "language": doc.get("language"),
                        "scenes": [
                            {
                                "sceneId": scene.get("id"),
                                "headline": scene.get("headline"),
                                "compositionFamily": scene.get("compositionFamily"),
                            }
                            for scene in doc.get("scenes") or []
                        ],
                    },
                )
                review = await visual_reviewer.review(request)
                combined_issues = [*preflight.issues, *review.issues]
                visual_quality_payload = _visual_report_payload(review)
                visual_quality_payload["preflightIssues"] = [
                    {
                        "sceneId": issue.scene_id,
                        "route": issue.route,
                        "problem": issue.problem,
                        "instruction": issue.instruction,
                    }
                    for issue in preflight.issues
                ]
                if not review.available:
                    final.warnings.extend(review.warnings)
                elif combined_issues:
                    changed, content_issues = _apply_visual_contract_repairs(doc, combined_issues)

                    async def repair_visual_content(issue: VisualIssue, _i: int) -> str | None:
                        scene = next(
                            (
                                candidate
                                for candidate in doc.get("scenes") or []
                                if str(candidate.get("id") or "?") == issue.scene_id
                            ),
                            None,
                        )
                        if scene is None:
                            return f"{issue.scene_id}: 找不到页"
                        candidates = [
                            block
                            for block in scene.get("blocks") or []
                            if isinstance(block, dict)
                            and block.get("type") not in {"sim", "runnable", "media"}
                        ]
                        if not candidates:
                            return f"{issue.scene_id}: 无可定点重生成的静态 block"
                        current = candidates[0]
                        reg = registry.get(str(current.get("type") or ""))
                        if reg is None:
                            return f"{issue.scene_id}: 无 Skill 处理 {current.get('type')}"
                        block_id = str(current.get("id") or "")
                        placeholder = placeholder_specs.get(block_id, {})
                        result = await generate_block(
                            llm,
                            type=str(current.get("type")),
                            intent=(
                                str(placeholder.get("intent") or "保持本页核心结论")
                                + f"\n截图级修复：{issue.instruction}"
                            ),
                            scene_ctx=_block_scene_context(
                                scene,
                                page_briefs.get(issue.scene_id, _page_brief(scene)),
                                list(scene.get("blocks") or []),
                                visual_brief=page_visual_briefs.get(issue.scene_id, {}),
                                design_brief=design_brief,
                            ),
                            contract=reg.contract,
                            topic=topic,
                            material=mat,
                        )
                        if result.block is None:
                            return f"{issue.scene_id}: {result.err or 'block 修复失败'}"
                        repaired = dict(result.block)
                        repaired["id"] = block_id
                        for index, block in enumerate(scene.get("blocks") or []):
                            if block is current:
                                scene["blocks"][index] = repaired
                                break
                        return None

                    failures = [
                        failure
                        for failure in await pool(content_issues, opts.concurrency, repair_visual_content)
                        if failure
                    ]
                    if failures:
                        final.warnings.append("视觉 block 修复未全部完成：" + "；".join(failures[:6]))
                    changed.update(issue.scene_id for issue in content_issues if issue.scene_id)
                    render_changed_scene_ids.update(changed)
                    if changed:
                        progress({"type": "docUpdated", "doc": doc, "reason": "visual-quality-repair"})
                        render_report = await render_verifier.verify(
                            json.dumps(doc, ensure_ascii=False)
                        )
                        post_ignored_prefixes = ("D:", "F:", "G:", "I:")
                        post_render_errors = [
                            error
                            for error in render_report.errors
                            if not error.startswith(post_ignored_prefixes)
                        ]
                        postflight = preflight_page_metrics(metrics_with_context(render_report))
                        render_hard_errors.extend(post_render_errors)
                        render_hard_errors.extend(postflight.hard_errors)
                        final_images: list[ImageInput] = [
                            str(path) for path in render_report.shots[1:]
                        ]
                        if not render_hard_errors:
                            final_review = await visual_reviewer.review(
                                VisualReviewRequest(
                                    contact_sheet=str(render_report.shots[0])
                                    if render_report.shots
                                    else shots[0],
                                    failed_pages=final_images,
                                    deck_context=request.deck_context,
                                )
                            )
                            visual_quality_payload = _visual_report_payload(final_review)
                            visual_quality_payload["repairedScenes"] = sorted(changed)
                            if final_review.available:
                                scores = final_review.scores.as_dict()
                                visual_quality_payload["pass"] = all(
                                    score >= 4.0 for score in scores.values()
                                )
                                if not visual_quality_payload["pass"]:
                                    final.warnings.append(
                                        "视觉质量未达到 4/5 交付线："
                                        + ", ".join(
                                            f"{key}={value:.1f}"
                                            for key, value in scores.items()
                                        )
                                    )
                            else:
                                final.warnings.extend(final_review.warnings)
                elif review.available:
                    visual_quality_payload["pass"] = all(
                        score >= 4.0 for score in review.scores.as_dict().values()
                    )
            progress({"type": "stage", "stage": "visual-quality", "status": "done"})

        # 浏览器回炉改过 HTML/文案后，旧的语义分数已经失效。只重审被改页，避免运行时修复
        # 修好了空白却悄悄改坏数学映射；不重复审查未变化页。
        if (
            schema_valid_for_render_repairs
            and render_changed_scene_ids
            and opts.quality_rounds > 0
            and not render_hard_errors
        ):
            changed_scenes = [
                scene
                for scene in doc.get("scenes") or []
                if str(scene.get("id") or "?") in render_changed_scene_ids
            ]

            async def audit_render_change(
                scene: dict[str, Any], _i: int
            ) -> tuple[dict[str, Any], Any]:
                sid = str(scene.get("id") or "?")
                return scene, await review_page(
                    llm,
                    topic=topic,
                    scene=scene,
                    brief=page_briefs.get(sid, _page_brief(scene)),
                    audience=audience,
                    material=mat,
                )

            by_scene = {str(item.get("sceneId")): item for item in quality_summary}
            for scene, page_review in await pool(
                changed_scenes, opts.concurrency, audit_render_change
            ):
                sid = str(scene.get("id") or "?")
                by_scene[sid] = {
                    "sceneId": sid,
                    "score": page_review.score,
                    "pass": page_review.passed,
                    "blockIssues": page_review.block_issues,
                    "pageIssues": page_review.page_issues,
                }
                log(
                    f"[quality] 浏览器回炉后复核 {sid}: {page_review.score:.1f}/10"
                    + (" pass" if page_review.passed else " needs-work")
                )
            quality_summary = list(by_scene.values())
        # 回炉后内容变了，重跑整档校验，避免精简引入的结构错逃逸
        prior_warnings = list(final.warnings)
        final = validate_doc(doc)
        final.warnings = prior_warnings + final.warnings
        final.errors.extend(render_hard_errors)
        if render_report is not None and render_report.overflow_pages:
            final.warnings.append(
                f"真机渲染仍有 {len(render_report.overflow_pages)} 页溢出（已尽力精简）："
                + ", ".join(
                    f"#{p['page']}({max(int(p.get('overflowY') or 0), int(p.get('mblockClip') or 0), int(p.get('layoutClip') or 0))}px)"
                    for p in render_report.overflow_pages[:8]
                )
            )
        if render_report is not None and quality_summary:
            _merge_render_quality(quality_summary, list(doc.get("scenes") or []), render_report)
        progress({"type": "stage", "stage": "render", "status": "done"})

    if quality_summary and render_report is None:
        _merge_render_quality(
            quality_summary,
            list(doc.get("scenes") or []),
            RenderReport(ok=True, warnings=["未执行浏览器逐页验收"]),
        )
    for item in quality_summary:
        if item.get("pass"):
            continue
        issues = list(item.get("pageIssues") or []) + list(item.get("renderIssues") or [])
        block_issues = [str(x.get("problem")) for x in (item.get("blockIssues") or []) if isinstance(x, dict)]
        detail = (issues + block_issues)[:3]
        final.errors.append(
            f"逐页质量未通过 {item.get('sceneId')}（{float(item.get('score') or 0):.1f}/10）："
            + ("；".join(detail) if detail else "未达到 9.8 且零 issue 的交付门槛")
        )

    # ④.7 讲者备注增强：只对语义与真机验收都已通过的最终页面写讲稿。
    # 旧顺序在 render/reflow 之前写 notes，既会让讲稿依据旧内容，也会为已知失败 deck 白花调用。
    if not final.errors:
        progress({"type": "stage", "stage": "notes", "status": "start"})
        await enrich_notes(
            llm,
            doc,
            audience=audience,
            concurrency=opts.concurrency,
            page_briefs=page_briefs,
        )
        progress({"type": "stage", "stage": "notes", "status": "done"})

    # ⑤ 覆盖度审查（opt-in，完成 STORM 闭环）
    cov = None
    if coverage and plan.perspectives and not final.errors:
        progress({"type": "stage", "stage": "coverage", "status": "start"})
        try:
            cov = await check_coverage(llm, doc, plan.perspectives)
        except Exception:  # noqa: BLE001
            pass
        progress({"type": "stage", "stage": "coverage", "status": "done"})

    progress(
        {
            "type": "done",
            "errors": len(final.errors),
            "dropped": len(dropped),
            "coverage": bool(cov),
            "quality": quality_summary,
            "visualQuality": visual_quality_payload,
            "widgetRoutes": widget_routes,
            "doc": doc,
        }
    )
    return GenerateResult(
        doc=doc,
        errors=final.errors,
        warnings=final.warnings,
        dropped=dropped,
        perspectives=plan.perspectives,
        coverage=cov,
        quality=quality_summary,
        knowledge_forms=plan.knowledge_forms,
        evidence_obligations=plan.evidence_obligations,
        widget_routes=widget_routes,
        visual_quality=visual_quality_payload,
    )
