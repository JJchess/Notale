"""Deterministic validation for create_minigame output.

The contract checks are a direct port of
notale/skills/build-minigame-from-query/scripts/validate_game.py, adapted to operate on
in-memory strings (a MinigamePayload) instead of files on disk, since this tool never writes
its draft output to disk before it passes validation.
"""

from __future__ import annotations

import re
from pathlib import Path

from notale.tools.create_minigame.models import MinigameMedium, MinigamePayload
from notale.utils.node import run_node
from notale.utils.parsing import extract_json


_TAG = re.compile(r"customElements\.define\(\s*[\"']([a-z0-9-]+)[\"']")
_REMOTE = re.compile(r"https?://|[\"']//[^\"']+", re.IGNORECASE)
_CANVAS_USAGE = re.compile(r"getContext\(\s*[\"']2d[\"']|<canvas\b", re.IGNORECASE)
_BARE_SVG_SHAPE = re.compile(r"<(?:rect|circle)\b")
_SVG_TEXTURE = re.compile(
    r"<(?:path|polygon|polyline|image|pattern|linearGradient|radialGradient|use)\b"
)


def parse_minigame_payload(raw: str) -> MinigamePayload:
    index_match = re.search(r"<index_html>\s*([\s\S]*?)\s*</index_html>", raw)
    component_match = re.search(
        r"<game_component_js>\s*([\s\S]*?)\s*</game_component_js>", raw
    )
    if index_match is None:
        raise ValueError("response is missing <index_html>...</index_html>")
    if component_match is None:
        raise ValueError("response is missing <game_component_js>...</game_component_js>")
    header_end = min(index_match.start(), component_match.start())
    metadata = extract_json(raw[:header_end])
    if not isinstance(metadata, dict):
        raise ValueError("minigame metadata must be a JSON object")
    metadata["index_html"] = index_match.group(1).strip()
    metadata["game_component_js"] = component_match.group(1).strip()
    return MinigamePayload.model_validate(metadata)


def _require(pattern: str, text: str, message: str, failures: list[str]) -> None:
    if re.search(pattern, text, re.MULTILINE) is None:
        failures.append(message)


def minigame_contract_failures(payload: MinigamePayload) -> list[str]:
    index = payload.index_html
    component = payload.game_component_js
    combined = index + "\n" + component
    failures: list[str] = []

    if _REMOTE.search(combined):
        failures.append("remote URL or protocol-relative dependency found")
    if re.search(r"\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(", component):
        failures.append("runtime network API found")
    if re.search(r"window\.addEventListener\(\s*[\"']scroll[\"']", component):
        failures.append("window scroll listener found")

    tag_match = _TAG.search(component)
    if tag_match is None:
        failures.append("customElements.define() with a kebab-case tag is required")
    else:
        tag_name = tag_match.group(1)
        if "-" not in tag_name:
            failures.append("custom-element tag must contain a hyphen")
        if re.search(rf"<{re.escape(tag_name)}(?:\s|>)", index) is None:
            failures.append(f"index_html does not mount <{tag_name}>")

    _require(r"attachShadow\(\s*\{\s*mode:\s*[\"']open[\"']", component,
              "open Shadow Root is required", failures)
    for method in ("start", "reset", "getState"):
        _require(rf"^\s+{method}\s*\(", component,
                  f"public {method}() method is required", failures)
    for event_name in ("game-start", "game-progress", "game-complete", "game-reset"):
        if event_name not in component:
            failures.append(f"missing lifecycle event: {event_name}")

    if "aria-live" not in component:
        failures.append("aria-live status is required")
    if ":focus-visible" not in component:
        failures.append("visible focus styling is required")
    if "prefers-reduced-motion" not in component:
        failures.append("reduced-motion handling is required")
    _require(r"addEventListener\(\s*[\"']keydown[\"']", component,
              "keyboard interaction handler is required", failures)
    _require(r"addEventListener\(\s*[\"']click[\"']", component,
              "pointer or touch-compatible click handler is required", failures)
    return failures


def medium_mismatch_failures(medium: MinigameMedium, payload: MinigamePayload) -> list[str]:
    """Best-effort, generation-time cross-check between the plan's declared medium and the
    actual code — the harder counterpart to validate_game.py's non-blocking HINT. Only checks
    the mediums where a mismatch is cheaply detectable; silence elsewhere is not an endorsement."""
    code = payload.index_html + "\n" + payload.game_component_js
    medium_checks = {
        MinigameMedium.PIXEL_ART_CANVAS: lambda: (
            None if _CANVAS_USAGE.search(code)
            else "visual_medium is pixel_art_canvas but no canvas getContext(\"2d\") usage was found"
        ),
        MinigameMedium.TYPOGRAPHIC: lambda: (
            "visual_medium is typographic but the code draws SVG/canvas shapes instead of "
            "relying on HTML+CSS text"
            if _BARE_SVG_SHAPE.search(code) or _SVG_TEXTURE.search(code) or _CANVAS_USAGE.search(code)
            else None
        ),
        MinigameMedium.ASCII_GRID: lambda: (
            None
            if re.search(r"<pre\b", code, re.IGNORECASE) or "monospace" in code.lower()
            else "visual_medium is ascii_grid but no <pre> block or monospace font reference was found"
        ),
    }
    check = medium_checks.get(medium)
    if check is None:
        return []
    failure = check()
    return [failure] if failure else []


async def minigame_js_syntax_failure(
    code: str, *, workspace: Path, label: str, timeout_sec: float, error_chars: int,
) -> str:
    workspace.mkdir(parents=True, exist_ok=True)
    path = workspace / f"check-{label}.js"
    path.write_text(code, encoding="utf-8")
    try:
        result = await run_node(["--check", str(path)], timeout_sec=timeout_sec)
        if result.returncode:
            detail = (result.stdout + result.stderr).decode("utf-8", errors="replace")
            return "game-component.js is invalid: " + detail[:error_chars]
        return ""
    finally:
        path.unlink(missing_ok=True)
