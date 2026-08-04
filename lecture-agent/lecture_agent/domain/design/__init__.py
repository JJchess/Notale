"""Deterministic compilation of lecture design intent into executable visual contracts."""

from .compiler import compile_scene_composition
from .tokens import compile_visual_system
from .validation import CompositionIssue, validate_scene_composition

__all__ = [
    "CompositionIssue",
    "compile_scene_composition",
    "compile_visual_system",
    "validate_scene_composition",
]
