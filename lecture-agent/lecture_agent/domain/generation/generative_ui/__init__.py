"""Vendored Generative UI core; LectureDoc-specific hosting lives in sibling ``widget.py``."""

from .bundler import compose_bundle
from .prompts import build_planning_prompt, build_primary_prompt, build_validation_repair_prompt
from .validators import infer_widget_type, parse_split_response, payload_validation_errors

__all__ = [
    "build_planning_prompt",
    "build_primary_prompt",
    "build_validation_repair_prompt",
    "compose_bundle",
    "infer_widget_type",
    "parse_split_response",
    "payload_validation_errors",
]
