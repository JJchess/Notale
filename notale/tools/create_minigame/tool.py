"""Builder-shaped, currently-unwired create_minigame tool.

Structurally mirrors notale/tools/create_widget/tool.py (a BaseTool wrapping an isolated
plan-then-build generation pipeline), but is deliberately independent of
notale/tools/managed_component.py: no fixed iframe box, no Style-token requirement, no shared
manifest. Not registered in OPTIONAL_PAGE_TOOLS, builder_tools(), or any role's tools: list —
it is importable and fully functional but not yet exposed to any agent.
"""

from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, ConfigDict

from notale.tools.base import BaseTool, ToolContext, ToolResult
from notale.tools.create_minigame.generator import generate_minigame_component
from notale.tools.create_minigame.models import MinigameMedium
from notale.tools.create_minigame.storage import MinigameRecord


class _Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CreateMinigameInput(_Input):
    brief: str = ""
    visual_medium: MinigameMedium | None = None


def _result(record: MinigameRecord) -> ToolResult:
    return ToolResult(
        output=json.dumps(
            {
                "minigame_id": record.minigame_id,
                "tag_name": record.tag_name,
                "title": record.title,
                "index_path": record.index_path,
                "component_path": record.component_path,
            },
            ensure_ascii=False,
        )
    )


class CreateMinigameTool(BaseTool):
    name = "create_minigame"
    description = (
        "Generate one small playable mini-game — a zero-dependency native Web Component plus a "
        "demo-host page — in an isolated plan-then-build pipeline with deterministic contract "
        "validation. Returns file paths and the custom-element tag name."
    )
    input_model = CreateMinigameInput

    def __init__(self, state: Any) -> None:
        self.state = state

    async def execute(self, arguments: CreateMinigameInput, context: ToolContext) -> ToolResult:
        del context
        brief = arguments.brief.strip()
        if not brief:
            return ToolResult(output="brief is required", is_error=True)

        missing = [
            name for name in ("llm", "run_dir", "workspace", "logger")
            if getattr(self.state, name, None) is None
        ]
        if missing:
            return ToolResult(
                output=f"create_minigame tool is missing runtime context: {missing}",
                is_error=True,
            )

        tool_state = getattr(self.state, "tool_state", None)
        if tool_state is None:
            tool_state = {}
        if tool_state.get("minigame_attempted"):
            return ToolResult(output="minigame generation budget is exhausted", is_error=True)
        tool_state["minigame_attempted"] = True

        try:
            record = await generate_minigame_component(
                llm=self.state.llm,
                state=self.state,
                run_dir=self.state.run_dir,
                page=getattr(self.state, "page", None),
                logger=self.state.logger,
                workspace=self.state.workspace,
                brief=brief,
                visual_medium=arguments.visual_medium,
            )
        except Exception as exc:
            event = getattr(self.state, "event", None)
            if callable(event):
                event(
                    "component.failed", component_kind="minigame",
                    error=f"{type(exc).__name__}: {exc}",
                )
            return ToolResult(output=f"create_minigame failed: {exc}", is_error=True)
        return _result(record)
