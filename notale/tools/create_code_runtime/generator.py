"""Focused specification generation and repair for create_code_runtime."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from notale.core.models import PagePlan
from notale.core.observability import EventLog
from notale.tools._component_model import component_model_call
from notale.tools.create_code_runtime.models import CodeRuntimeSpec
from notale.tools.create_code_runtime.runtime import render_code_runtime_fragment
from notale.tools.create_code_runtime.validation import validate_runtime_execution
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


def _runtime_prompt(
    *, brief: str, page_plan: PagePlan, style: GeneratedDesignSkill, language: str
) -> str:
    return f"""Create one compact JavaScript coding exercise specification for a fixed lecture component.

Builder brief:
{brief}

Page boundary:
{_page_boundary(page_plan)}

Lecture language: {language}
Style identity (for tone only; do not emit HTML or CSS): {style.name} — {style.description}

Return JSON only. `starter_code` and `reference_code` must each define a synchronous `function solve(input)`. Each fixture carries `input_json` and `expected_json` as strings containing valid JSON. Starter code must execute for every fixture but should leave a meaningful learner task; reference code must exactly produce every parsed expected value. Use 2–6 varied fixtures. No imports, require, process, network/browser globals, eval, Function constructor, workers, promises, timers, or external packages. Keep the exercise focused on the page claim and write visible title/instruction in the lecture language."""


async def generate_code_runtime_component(
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
    width: int,
    height: int,
) -> ComponentRecord:
    generation_started = time.monotonic()
    prompt = _runtime_prompt(
        brief=brief, page_plan=page_plan, style=style, language=language
    )
    logger.emit(
        "component.build.started", agent_id=f"component:p{page}:code-runtime", page=page,
        component_kind="code-runtime",
    )
    calls = repairs = 0
    raw, _ = await component_model_call(
        llm, state=state, logger=logger, run_dir=run_dir, page=page, kind="code-runtime",
        stage="spec", turn=1,
        system_prompt=(
            "Design a JavaScript exercise specification, not a web page. Return exactly one JSON "
            "object; the host deterministically supplies the editor, worker, Run, Reset and tests."
        ),
        user_prompt=prompt, response_model=CodeRuntimeSpec,
    )
    calls += 1

    async def inspect(value: str) -> tuple[CodeRuntimeSpec | None, list[str]]:
        try:
            spec = CodeRuntimeSpec.model_validate(extract_json(value))
        except Exception as exc:
            return None, [str(exc)]
        failures = await validate_runtime_execution(
            spec,
            workspace=state.workspace,
            timeout_sec=_CONFIG.components.validation_timeout_sec,
            error_chars=_CONFIG.components.validation_error_max_chars,
        )
        return spec, failures

    spec, failures = await inspect(raw)
    if failures:
        if repairs >= _CONFIG.components.maximum_repair_calls:
            raise ValueError("code runtime spec validation failed: " + "; ".join(failures))
        repairs += 1
        logger.emit(
            "component.repair.started", agent_id=f"component:p{page}:code-runtime", page=page,
            component_kind="code-runtime", component_stage="spec", errors=failures,
        )
        repaired, _ = await component_model_call(
            llm, state=state, logger=logger, run_dir=run_dir, page=page, kind="code-runtime",
            stage="repair-spec", turn=2,
            system_prompt="Repair a JavaScript exercise specification. Return only the full JSON object.",
            user_prompt=prompt + "\n\nFix these errors:\n- " + "\n- ".join(failures) + "\n\nPrevious response:\n" + raw,
            response_model=CodeRuntimeSpec,
        )
        calls += 1
        spec, failures = await inspect(repaired)
        if failures:
            raise ValueError("code runtime spec is invalid after repair: " + "; ".join(failures))
    assert spec is not None
    fragment = render_code_runtime_fragment(spec, language=language)
    js_failure = await inline_script_failure(
        fragment,
        workspace=state.workspace,
        label=f"code-runtime-p{page}",
        timeout_sec=_CONFIG.components.validation_timeout_sec,
        error_chars=_CONFIG.components.validation_error_max_chars,
    )
    if js_failure:
        raise ValueError(js_failure)
    document = render_component_document(
        fragment, style=style, language=language, title=spec.title,
        width=width, height=height,
    )
    component_id = make_component_id(
        page, "code-runtime", f"{brief}\0{width}\0{height}"
    )
    record = write_component(
        run_dir, component_id=component_id, page=page, kind="code-runtime",
        title=spec.title, widget_type="code-runtime", width=width, height=height,
        document=document, model_calls=calls, repair_calls=repairs,
        provenance="Notale deterministic JavaScript runtime v1",
    )
    logger.emit(
        "component.validated", agent_id=f"component:p{page}:code-runtime", page=page,
        duration_ms=round((time.monotonic() - generation_started) * 1000),
        component_kind="code-runtime", component_id=component_id, model_calls=calls,
        repair_calls=repairs, chars=len(document), sha256=record.sha256,
    )
    return record
