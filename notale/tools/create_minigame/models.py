"""Strict contracts for the create_minigame tool."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MinigameMedium(str, Enum):
    PIXEL_ART_CANVAS = "pixel_art_canvas"
    PRECISE_SVG = "precise_svg"
    TYPOGRAPHIC = "typographic"
    ASCII_GRID = "ascii_grid"
    PAPER_CUTOUT = "paper_cutout"
    ISOMETRIC = "isometric"


class MinigamePlan(StrictModel):
    core_verb: str = Field(min_length=1)
    model_summary: str = Field(min_length=1)
    result_summary: str = Field(min_length=1)
    initial_state: str = Field(min_length=1)
    allowed_actions: str = Field(min_length=1)
    invalid_actions: str = Field(min_length=1)
    completion_rule: str = Field(min_length=1)
    reset_behavior: str = Field(min_length=1)
    uses_score: bool
    score_rule: str = ""
    visual_medium: MinigameMedium
    medium_reason: str = Field(min_length=1)
    tag_name: str = Field(pattern=r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$")
    title: str = Field(min_length=1, max_length=120)


class MinigamePayload(StrictModel):
    title: str = Field(min_length=1, max_length=120)
    assistant_text: str = Field(min_length=1, max_length=300)
    index_html: str = Field(min_length=20)
    game_component_js: str = Field(min_length=50)
