"""Builder-facing create_code_runtime tool."""

from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from notale.tools.base import BaseTool, ToolContext, ToolResult
from notale.tools.create_code_runtime.generator import generate_code_runtime_component
from notale.tools.managed_component import ComponentRecord, page_components
from notale.utils.config import get_config


_CONFIG = get_config().components


class _Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CreateCodeRuntimeInput(_Input):
    brief: str = ""
    width: int = Field(default=1040, ge=_CONFIG.min_width_px, le=_CONFIG.max_width_px)
    height: int = Field(default=500, ge=_CONFIG.min_height_px, le=_CONFIG.max_height_px)


def _result(record: ComponentRecord) -> ToolResult:
    return ToolResult(
        output=json.dumps(
            {
                "component_id": record.component_id,
                "mount_html": record.mount_html,
                "title": record.title,
                "width": record.width,
                "height": record.height,
            },
            ensure_ascii=False,
        )
    )


def _ready(state: Any, kind: str) -> str:
    missing = [
        name for name in ("page_plan", "style")
        if getattr(state, name, None) is None
    ]
    if missing:
        return f"{kind} component tool is missing runtime context: {missing}"
    return ""


def _resolved_brief(value: str, page_plan: Any) -> str:
    """Use Builder detail when supplied, otherwise derive it from the page contract."""
    if value.strip():
        return value
    return "\n".join(
        (
            f"Claim: {page_plan.claim}",
            f"Learning action: {page_plan.learning_action}",
            f"Narrative role: {page_plan.narrative_role}",
        )
    )


class CreateCodeRuntimeTool(BaseTool):
    name = "create_code_runtime"
    description = (
        "Generate one local JavaScript exercise spec, verify it deterministically, and compile "
        "a sandboxed editor/Run/Reset/test component. Returns only mount_html metadata."
    )
    input_model = CreateCodeRuntimeInput

    def __init__(self, state: Any) -> None:
        self.state = state

    async def execute(
        self, arguments: CreateCodeRuntimeInput, context: ToolContext
    ) -> ToolResult:
        del context
        existing = page_components(self.state.run_dir, self.state.page)
        if existing:
            if len(existing) == 1 and existing[0].kind == "code-runtime":
                return _result(existing[0])
            return ToolResult(output="this page already owns another managed component", is_error=True)
        if self.state.tool_state.get("component_attempted"):
            return ToolResult(output="managed component generation budget is exhausted", is_error=True)
        problem = _ready(self.state, "code-runtime")
        if problem:
            return ToolResult(output=problem, is_error=True)
        self.state.tool_state["component_attempted"] = True
        brief = _resolved_brief(arguments.brief, self.state.page_plan)
        try:
            record = await generate_code_runtime_component(
                llm=self.state.llm,
                state=self.state,
                run_dir=self.state.run_dir,
                page=self.state.page,
                page_plan=self.state.page_plan,
                style=self.state.style,
                language=self.state.lecture_language,
                logger=self.state.logger,
                brief=brief,
                width=arguments.width,
                height=arguments.height,
            )
        except Exception as exc:
            self.state.event(
                "component.failed", component_kind="code-runtime",
                error=f"{type(exc).__name__}: {exc}",
            )
            return ToolResult(output=f"create_code_runtime failed: {exc}", is_error=True)
        return _result(record)
