"""Deterministic validation for create_widget output."""

from __future__ import annotations

import re

from notale.tools.create_widget.models import WidgetPayload, WidgetType
from notale.utils.parsing import extract_json, visible_text


_FULL_DOCUMENT = re.compile(r"<!doctype|<\s*(?:html|head|body)\b", re.I)
_REMOTE = re.compile(
    r"<\s*(?:script|link|iframe|img|source|video|audio|object)\b[^>]*"
    r"(?:src|href|srcset|data)\s*=|<\s*a\b[^>]*href\s*=|@import|"
    r"url\(\s*['\"]?https?://|\b(?:fetch|import)\s*\(|"
    r"\b(?:XMLHttpRequest|WebSocket|EventSource)\b",
    re.I,
)
_THIRD_PARTY = re.compile(r"\b(?:Chart|anime|gsap|d3|THREE|BABYLON|PIXI)\s*(?:\.|\()")
_RESERVED_DEFINITION = re.compile(
    r"--notale-(?:bg|surface|ink|muted|accent|accent-2|accent-3|line|font(?:-display|-body|-mono)?|mono)\s*:",
    re.I,
)
_HOST_VARIABLE = re.compile(r"--color-[a-z0-9-]+", re.I)
_INTERACTIVE_TYPES = {
    WidgetType.INTERACTIVE, WidgetType.CHART_INTERACTIVE, WidgetType.ART_INTERACTIVE,
}
def parse_widget_payload(raw: str) -> WidgetPayload:
    match = re.search(r"<widget_code>\s*([\s\S]*?)\s*</widget_code>", raw)
    if match is None:
        raise ValueError("response is missing <widget_code>...</widget_code>")
    metadata = extract_json(raw[: match.start()])
    if not isinstance(metadata, dict):
        raise ValueError("widget metadata must be a JSON object")
    metadata["widget_code"] = match.group(1).strip()
    return WidgetPayload.model_validate(metadata)


def widget_fragment_failures(
    payload: WidgetPayload,
    *,
    expected_type: WidgetType,
    require_interaction: bool,
) -> list[str]:
    code = payload.widget_code
    lower = code.lower()
    failures: list[str] = []
    if payload.widget_type != expected_type:
        failures.append(f"widget_type must remain {expected_type.value}")
    if _FULL_DOCUMENT.search(code):
        failures.append("widget_code must be an HTML fragment, not a document")
    root_attributes = re.findall(
        r"<[^>]+\bdata-notale-widget-root(?:\s|=|>)", code, re.I
    )
    if len(root_attributes) != 1:
        failures.append("widget_code needs exactly one data-notale-widget-root")
    if _REMOTE.search(code):
        failures.append("widget_code contains a remote or external runtime dependency")
    if _THIRD_PARTY.search(code):
        failures.append("widget_code uses an unavailable third-party global")
    if _RESERVED_DEFINITION.search(code):
        failures.append("widget_code must consume, not redefine, --notale-* tokens")
    if _HOST_VARIABLE.search(code):
        failures.append("widget_code uses foreign --color-* host variables")
    if re.search(r"position\s*:\s*fixed", code, re.I):
        failures.append("widget_code must not use position:fixed")
    token_refs = set(re.findall(r"var\(\s*(--notale-[a-z0-9-]+)", code, re.I))
    if len(token_refs) < 3:
        failures.append("widget_code must visibly inherit at least three Style Studio tokens")
    if not visible_text(code):
        failures.append("widget_code has no visible labels")
    style_at = lower.find("<style")
    root_at = lower.find("data-notale-widget-root")
    script_at = lower.find("<script")
    if style_at < 0 or style_at > root_at:
        failures.append("widget_code must place <style> before its root markup")
    if script_at >= 0 and script_at < root_at:
        failures.append("widget_code must place <script> after its root markup")
    interactive = require_interaction or payload.widget_type in _INTERACTIVE_TYPES
    if interactive:
        if not re.search(r"<(?:button|input|select|textarea)\b|data-action\s*=", code, re.I):
            failures.append("interactive widget needs a real control")
        if not re.search(r"addEventListener\s*\(|\bon(?:click|input|change)\s*=", code, re.I):
            failures.append("interactive widget needs a wired event handler")
        if not re.search(r"(?:function\s+update\b|\bupdate\s*=)", code):
            failures.append("interactive widget needs one update() projection entry point")
        if not re.search(r"\breset\b", code, re.I):
            failures.append("interactive widget needs a deterministic Reset control")
    return failures
