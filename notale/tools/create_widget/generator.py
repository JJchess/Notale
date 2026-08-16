"""Focused planning, generation, and repair for the create_widget tool."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from notale.core.models import PagePlan, PageType
from notale.core.observability import EventLog
from notale.tools._component_model import component_model_call
from notale.tools.create_widget.guidance import (
    UPSTREAM_PROVENANCE,
    compose_bundle,
    direction_menu,
    direction_spec,
    example_widget_code,
    notale_override,
    planning_layout_rules,
)
from notale.tools.create_widget.models import (
    WidgetPayload,
    WidgetPlan,
    WidgetType,
)
from notale.tools.create_widget.validation import (
    parse_widget_payload,
    widget_fragment_failures,
)
from notale.tools.managed_component import (
    ComponentRecord,
    inline_script_failure,
    make_component_id,
    render_component_document,
    write_component,
)
from notale.utils.config import get_config
from notale.utils.parsing import extract_json
from notale.utils.skill_catalog import GeneratedDesignSkill


_CONFIG = get_config()


def infer_widget_type(brief: str, page_plan: PagePlan) -> WidgetType:
    text = brief.casefold()
    if page_plan.type == PageType.SIM_EXPLORABLE:
        return WidgetType.INTERACTIVE
    if any(word in text for word in ("chart", "graph", "plot", "图表", "曲线", "柱状")):
        return WidgetType.CHART_INTERACTIVE
    if any(word in text for word in ("diagram", "flow", "map", "流程", "结构图")):
        return WidgetType.DIAGRAM
    if any(word in text for word in ("mockup", "界面", "表单")):
        return WidgetType.MOCKUP
    if any(word in text for word in ("illustration", "art", "插画", "场景")):
        return WidgetType.ART
    return WidgetType.INTERACTIVE


def _page_boundary(page_plan: PagePlan) -> str:
    return json.dumps(
        {
            "type": page_plan.type.value,
            "composition": page_plan.composition,
            "claim": page_plan.claim,
            "learning_action": page_plan.learning_action,
            "narrative_role": page_plan.narrative_role,
        },
        ensure_ascii=False,
        indent=2,
    )


def _plan_semantic_failures(plan: WidgetPlan, *, require_interaction: bool) -> list[str]:
    failures: list[str] = []
    if require_interaction and not plan.state_model:
        failures.append("simulation plan needs explicit state_model fields")
    if require_interaction and not plan.interactions:
        failures.append("simulation plan needs a visible state-changing interaction")
    return failures


def _widget_plan_prompt(
    *,
    brief: str,
    widget_type: WidgetType,
    width: int,
    height: int,
    page_plan: PagePlan,
    style: GeneratedDesignSkill,
) -> str:
    return f"""Plan one fixed-canvas visual component. Do not write HTML/CSS/JS.

Builder brief:
{brief}

Page boundary:
{_page_boundary(page_plan)}

Viewport: {width}×{height}px
Widget type: {widget_type.value}

Authoritative run Style and assigned composition:
{style.render(page_plan.composition)}

Aesthetic directions. Pick one for its craft and spatial language, while the run Style remains the palette/type authority:
{direction_menu()}

Layout craft inherited from GenerativeUI:
{planning_layout_rules()}

The initial paint must already show a meaningful mid-action state. For an explorable simulation, define a real algorithm, equation, rule, dataset, or state machine; specify concrete state, a trace from state to derived results, one update() projection, a visibly consequential control, and deterministic Reset. Return only the requested JSON object."""


def _widget_build_prompt(
    *,
    brief: str,
    widget_type: WidgetType,
    width: int,
    height: int,
    plan: WidgetPlan,
    style: GeneratedDesignSkill,
) -> tuple[str, str]:
    system = (
        "You are a focused widget implementer, not the lecture Planner or page Builder.\n\n"
        + compose_bundle(widget_type.value)
        + "\n\n## Chosen direction\n"
        + direction_spec(plan.aesthetic_direction.value)
        + "\n\n"
        + notale_override(width, height)
    )
    tokens = json.dumps(style.tokens, ensure_ascii=False, indent=2)
    example = example_widget_code(plan.aesthetic_direction.value)
    user = f"""Implement this exact component brief and structural contract.

Brief:
{brief}

Structural contract:
{plan.model_dump_json(indent=2)}

Style tokens:
{tokens}

The following upstream example is a structural/craft reference for the chosen direction. Do not copy its topic, palette, dimensions, IDs, or prose; translate its craft into the Style tokens above:
<structural_example>
{example}
</structural_example>

Return exactly two parts and nothing else:
{{"title":"short title in the lecture language","widget_type":"{widget_type.value}","assistant_text":"one short summary"}}
<widget_code>
<style>...</style>
<section data-notale-widget-root>...</section>
<script>...</script>
</widget_code>

For interactive output, all state changes must call one update(), the initial update must paint the specified mid-action state, and a visible Reset control must restore it. Keep every element within {width}×{height}px."""
    return system, user


async def generate_widget_component(
    *,
    llm: Any,
    state: Any,
    run_dir: Path,
    page: int,
    page_plan: PagePlan,
    style: GeneratedDesignSkill,
    language: str,
    logger: EventLog,
    brief: str,
    widget_type: WidgetType,
    width: int,
    height: int,
) -> ComponentRecord:
    generation_started = time.monotonic()
    logger.emit(
        "component.plan.started", agent_id=f"component:p{page}:widget", page=page,
        component_kind="widget", widget_type=widget_type.value,
    )
    calls = repairs = 0
    turn = 1
    plan_prompt = _widget_plan_prompt(
        brief=brief, widget_type=widget_type, width=width, height=height,
        page_plan=page_plan, style=style,
    )
    raw_plan, _ = await component_model_call(
        llm, state=state, logger=logger, run_dir=run_dir, page=page, kind="widget",
        stage="plan", turn=turn,
        system_prompt=(
            "Create a precise structural contract for one visual component. Return only JSON. "
            "Style Studio is authoritative; aesthetic directions contribute craft, not a new palette."
        ),
        user_prompt=plan_prompt, response_model=WidgetPlan,
    )
    calls += 1
    try:
        plan = WidgetPlan.model_validate(extract_json(raw_plan))
        plan_failures = _plan_semantic_failures(
            plan, require_interaction=page_plan.type == PageType.SIM_EXPLORABLE
        )
        if plan_failures:
            raise ValueError("; ".join(plan_failures))
    except Exception as exc:
        if repairs >= _CONFIG.components.maximum_repair_calls:
            raise ValueError(f"widget plan is invalid: {exc}") from exc
        repairs += 1
        turn += 1
        logger.emit(
            "component.repair.started", agent_id=f"component:p{page}:widget", page=page,
            component_kind="widget", component_stage="plan", errors=[str(exc)],
        )
        repaired, _ = await component_model_call(
            llm, state=state, logger=logger, run_dir=run_dir, page=page, kind="widget",
            stage="repair-plan", turn=turn,
            system_prompt="Repair a component structural contract. Return only valid JSON.",
            user_prompt=plan_prompt + f"\n\nPrevious invalid response:\n{raw_plan}\n\nError:\n{exc}",
            response_model=WidgetPlan,
        )
        calls += 1
        plan = WidgetPlan.model_validate(extract_json(repaired))
        failures = _plan_semantic_failures(
            plan, require_interaction=page_plan.type == PageType.SIM_EXPLORABLE
        )
        if failures:
            raise ValueError("widget plan is invalid after repair: " + "; ".join(failures))
    logger.emit(
        "component.plan.completed", agent_id=f"component:p{page}:widget", page=page,
        component_kind="widget", direction=plan.aesthetic_direction.value,
        render_medium=plan.render_medium,
    )
    system, build_prompt = _widget_build_prompt(
        brief=brief, widget_type=widget_type, width=width, height=height,
        plan=plan, style=style,
    )
    turn += 1
    logger.emit(
        "component.build.started", agent_id=f"component:p{page}:widget", page=page,
        component_kind="widget", widget_type=widget_type.value,
    )
    raw_build, _ = await component_model_call(
        llm, state=state, logger=logger, run_dir=run_dir, page=page, kind="widget",
        stage="build", turn=turn, system_prompt=system, user_prompt=build_prompt,
    )
    calls += 1

    async def inspect(raw: str) -> tuple[WidgetPayload | None, list[str]]:
        try:
            payload = parse_widget_payload(raw)
        except Exception as exc:
            return None, [str(exc)]
        failures = widget_fragment_failures(
            payload,
            expected_type=widget_type,
            require_interaction=page_plan.type == PageType.SIM_EXPLORABLE,
        )
        js_failure = await inline_script_failure(
            payload.widget_code,
            workspace=state.workspace,
            label=f"widget-p{page}",
            timeout_sec=_CONFIG.components.validation_timeout_sec,
            error_chars=_CONFIG.components.validation_error_max_chars,
        )
        if js_failure:
            failures.append(js_failure)
        return payload, failures

    payload, failures = await inspect(raw_build)
    if failures:
        if repairs >= _CONFIG.components.maximum_repair_calls:
            raise ValueError("widget build validation failed: " + "; ".join(failures))
        repairs += 1
        turn += 1
        logger.emit(
            "component.repair.started", agent_id=f"component:p{page}:widget", page=page,
            component_kind="widget", component_stage="build", errors=failures,
        )
        repair_prompt = build_prompt + (
            "\n\nRegenerate the complete two-part response. Fix every deterministic validation "
            "error below while preserving the structural contract:\n- " + "\n- ".join(failures)
            + "\n\nPrevious response:\n" + raw_build
        )
        raw_build, _ = await component_model_call(
            llm, state=state, logger=logger, run_dir=run_dir, page=page, kind="widget",
            stage="repair-build", turn=turn, system_prompt=system, user_prompt=repair_prompt,
        )
        calls += 1
        payload, failures = await inspect(raw_build)
        if failures:
            raise ValueError("widget build is invalid after repair: " + "; ".join(failures))
    assert payload is not None
    document = render_component_document(
        payload.widget_code, style=style, language=language, title=payload.title,
        width=width, height=height,
    )
    component_id = make_component_id(
        page, "widget", f"{brief}\0{widget_type.value}\0{width}\0{height}"
    )
    record = write_component(
        run_dir, component_id=component_id, page=page, kind="widget",
        title=payload.title, widget_type=widget_type.value, width=width, height=height,
        document=document, model_calls=calls, repair_calls=repairs,
        provenance=UPSTREAM_PROVENANCE,
    )
    logger.emit(
        "component.validated", agent_id=f"component:p{page}:widget", page=page,
        duration_ms=round((time.monotonic() - generation_started) * 1000),
        component_kind="widget", component_id=component_id, model_calls=calls,
        repair_calls=repairs, chars=len(document), sha256=record.sha256,
    )
    return record
