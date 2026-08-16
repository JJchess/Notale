"""Strict contracts for the create_widget tool."""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class WidgetType(str, Enum):
    INTERACTIVE = "interactive"
    CHART = "chart"
    CHART_INTERACTIVE = "chart_interactive"
    MOCKUP = "mockup"
    ART = "art"
    ART_INTERACTIVE = "art_interactive"
    DIAGRAM = "diagram"


class AestheticDirection(str, Enum):
    LAB_DARK = "lab-dark"
    PAPER_EDITORIAL = "paper-editorial"
    STUDIO_POP = "studio-pop"
    TERMINAL_DATA = "terminal-data"
    SOFT_ORGANIC = "soft-organic"
    BLUEPRINT = "blueprint"
    INK_WASH = "ink-wash"
    HOST_CALM = "host-calm"


class WidgetStateField(StrictModel):
    name: str = Field(pattern=r"^[A-Za-z_$][A-Za-z0-9_$]*$")
    type: Literal["int", "float", "bool", "string", "array", "object"]
    range_or_values: str = Field(min_length=1)
    initial: str = Field(min_length=1)


class WidgetInteraction(StrictModel):
    trigger: str = Field(min_length=1)
    effect: str = Field(min_length=1)


class WidgetPlan(StrictModel):
    core_insight: str = Field(min_length=1)
    render_medium: Literal["svg", "canvas", "dom"]
    render_medium_reason: str = Field(min_length=1)
    aesthetic_direction: AestheticDirection
    direction_reason: str = Field(min_length=1)
    signature_detail: str = Field(min_length=1)
    layout_pattern: Literal[
        "stage-readout-row", "balanced-split", "stepper", "bento", "editorial-column"
    ]
    layout_skeleton: str = Field(min_length=1)
    state_model: list[WidgetStateField] = Field(default_factory=list)
    interactions: list[WidgetInteraction] = Field(default_factory=list)
    render_contract: str = Field(min_length=1)
    initial_paint: str = Field(min_length=1)


class WidgetPayload(StrictModel):
    title: str = Field(min_length=1, max_length=120)
    widget_type: WidgetType
    assistant_text: str = Field(min_length=1, max_length=300)
    widget_code: str = Field(min_length=50)
