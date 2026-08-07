"""Deterministic compilation of lecture design intent into executable visual contracts."""

from .compiler import compile_scene_composition
from .director import (
    LayoutDecision,
    frame_layout_signature,
    hard_layout_failures,
    layout_signature,
    pagination_failures,
    solve_document_layouts,
    solve_scene_layout,
    split_failed_scenes,
)
from .tokens import compile_visual_system
from .validation import CompositionIssue, validate_scene_composition

__all__ = [
    "CompositionIssue",
    "compile_scene_composition",
    "compile_visual_system",
    "LayoutDecision",
    "hard_layout_failures",
    "layout_signature",
    "frame_layout_signature",
    "pagination_failures",
    "solve_document_layouts",
    "solve_scene_layout",
    "split_failed_scenes",
    "validate_scene_composition",
]
