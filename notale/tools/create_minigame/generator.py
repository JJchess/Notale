"""Focused planning, generation, and repair for the create_minigame tool."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from notale.core.observability import EventLog
from notale.tools._component_model import component_model_call
from notale.tools.create_minigame.models import MinigameMedium, MinigamePayload, MinigamePlan
from notale.tools.create_minigame.storage import MinigameRecord, make_minigame_id, write_minigame
from notale.tools.create_minigame.validation import (
    medium_mismatch_failures,
    minigame_contract_failures,
    minigame_js_syntax_failure,
    parse_minigame_payload,
)
from notale.utils.parsing import extract_json


MAX_REPAIR_CALLS = 1
VALIDATION_TIMEOUT_SEC = 8.0
VALIDATION_ERROR_MAX_CHARS = 1600
PROVENANCE = "Notale create_minigame v1"

_MEDIUM_NOTES: dict[MinigameMedium, str] = {
    MinigameMedium.PIXEL_ART_CANVAS: (
        "Pixel-art Canvas: fixed low logical resolution, integer coordinates and scaling, "
        "ctx.imageSmoothingEnabled = false, CSS image-rendering: pixelated, one limited palette. "
        "Draw with a palette-indexed grid helper instead of inventing sprite code from scratch:\n\n"
        "function drawPixelGrid(ctx, grid, palette, cellSize) {\n"
        "  ctx.imageSmoothingEnabled = false;\n"
        "  for (let y = 0; y < grid.length; y++) {\n"
        "    for (let x = 0; x < grid[y].length; x++) {\n"
        "      const color = palette[grid[y][x]];\n"
        "      if (color == null) continue;\n"
        "      ctx.fillStyle = color;\n"
        "      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);\n"
        "    }\n"
        "  }\n"
        "}\n"
        "// grid: 2D array of palette indices; palette: array of CSS color strings"
    ),
    MinigameMedium.PRECISE_SVG: (
        "Precise vector SVG: use this only when exact semantic geometry is the subject — graphs, "
        "networks, routes/maps, diagrams, charts, geometric or physics constructions. Plain "
        "<rect>/<circle> are correct here, not a placeholder."
    ),
    MinigameMedium.TYPOGRAPHIC: (
        "Typographic/kinetic HTML+CSS: the model is abstract and spaceless — predictions, bids, "
        "probability, negotiation, timers, counters. Big animated digits or words carry the state; "
        "no SVG or canvas imagery at all."
    ),
    MinigameMedium.ASCII_GRID: (
        "ASCII/monospace grid: a deliberate retro text aesthetic fits puzzle, logic, or "
        "code/terminal-flavored topics. Use a <pre> block or a CSS grid of monospace characters."
    ),
    MinigameMedium.PAPER_CUTOUT: (
        "Paper-cutout/collage: everyday, whimsical, non-technical subjects where charm matters more "
        "than precision. Layered flat shapes, soft drop shadow, slight rotation, rounded or torn "
        "edges."
    ),
    MinigameMedium.ISOMETRIC: (
        "Isometric block/tile: use only when spatial stacking is the point — strategy, "
        "city-building, economy simulations. CSS 3D transforms or a Canvas isometric projection; "
        "heavier to build than the other mediums."
    ),
}


def _plan_prompt(*, brief: str, visual_medium: MinigameMedium | None) -> str:
    medium_hint = (
        f"\n\nThe caller already committed to this visual medium: {visual_medium.value}. Use it."
        if visual_medium is not None else ""
    )
    return f"""Reduce this topic to one compact playable mini-game with real rules, feedback, an
ending, and replay.

Topic / brief:
{brief}

Reduce the game to one sentence: the player does one core verb inside one model to achieve or
discover one result. Decide the goal, initial state, allowed actions, invalid actions, completion
rule, reset behavior, and whether a score is meaningful here (only use one when the model defines
better and worse outcomes — never invent a precise metric that isn't backed by the model).

Then choose the visual medium deliberately. The most common failure is reaching for plain SVG
<rect>/<circle> as a generic stand-in for tiles, characters, obstacles, or props because they are
the fastest thing to type — not because the model needs exact geometry. Pick one of:
- pixel_art_canvas — a tangible world: characters/agents, tile maps, movement, pathfinding,
  collection or chore loops, resource/ecosystem simulations.
- precise_svg — exact semantic geometry: graphs, networks, routes/maps, diagrams, charts,
  geometric or physics constructions.
- typographic — an abstract, spaceless model: predictions, bids, probability, negotiation, timers,
  counters — the "board" is a number or a claim, not a place.
- ascii_grid — puzzle, logic, or code/terminal-flavored topics where a deliberate retro text
  aesthetic fits.
- paper_cutout — everyday, whimsical, non-technical subjects where charm matters more than
  precision.
- isometric — spatial stacking matters: strategy, city-building, economy simulations.

State the medium and why the model calls for it. Also choose a kebab-case custom-element tag name
(e.g. "lawn-mower-path-game") and a short visible title.{medium_hint} Return only the requested
JSON object."""


def _build_prompt(*, brief: str, plan: MinigamePlan) -> tuple[str, str]:
    system = (
        "You are a focused mini-game implementer. Deliver one zero-dependency native Web "
        "Component mini-game as two files: a demo-host index.html and a game-component.js. Use "
        "an open Shadow Root and expose start(), reset(), and getState() (returning a detached "
        "serializable snapshot). Dispatch composed, bubbling CustomEvents: game-start, "
        "game-progress with { state, action, metrics }, game-complete with { score, metrics, "
        "trace }, and game-reset. Keep canonical state in one serializable object routed through "
        "one transition function; derive feedback, completion, and score from that model, never "
        "invented after the fact. Support pointer/touch and the necessary keyboard actions, keep "
        "focus visible, provide an aria-live status, and honor prefers-reduced-motion. No remote "
        "URLs, no fetch/XMLHttpRequest/WebSocket, no window scroll listener, no third-party "
        "dependencies — everything inline in these two files.\n\n"
        + _MEDIUM_NOTES[plan.visual_medium]
    )
    user = f"""Implement this exact game contract.

Brief:
{brief}

Structural contract:
{plan.model_dump_json(indent=2)}

Return exactly two parts and nothing else:
{{"title":"{plan.title}","assistant_text":"one short summary of the game"}}
<index_html>
...full standalone HTML document that mounts <{plan.tag_name}></{plan.tag_name}> and loads
game-component.js as a module...
</index_html>
<game_component_js>
...the complete game-component.js content, defining the {plan.tag_name} custom element via
customElements.define("{plan.tag_name}", ...)...
</game_component_js>

The custom-element tag in index_html and the customElements.define(...) call in game_component_js
must both use exactly "{plan.tag_name}"."""
    return system, user


async def generate_minigame_component(
    *,
    llm: Any,
    state: Any,
    run_dir: Path,
    page: int | None,
    logger: EventLog,
    workspace: Path,
    brief: str,
    visual_medium: MinigameMedium | None,
) -> MinigameRecord:
    generation_started = time.monotonic()
    logger.emit(
        "component.plan.started", agent_id="component:minigame", page=page,
        component_kind="minigame",
    )
    calls = repairs = 0
    turn = 1
    plan_prompt = _plan_prompt(brief=brief, visual_medium=visual_medium)
    raw_plan, _ = await component_model_call(
        llm, state=state, logger=logger, run_dir=run_dir, page=page or 0, kind="minigame",
        stage="plan", turn=turn,
        system_prompt="Design a precise structural contract for one mini-game. Return only JSON.",
        user_prompt=plan_prompt, response_model=MinigamePlan,
    )
    calls += 1
    try:
        plan = MinigamePlan.model_validate(extract_json(raw_plan))
        if plan.uses_score and not plan.score_rule.strip():
            raise ValueError("plan uses_score but score_rule is empty")
    except Exception as exc:
        if repairs >= MAX_REPAIR_CALLS:
            raise ValueError(f"minigame plan is invalid: {exc}") from exc
        repairs += 1
        turn += 1
        logger.emit(
            "component.repair.started", agent_id="component:minigame", page=page,
            component_kind="minigame", component_stage="plan", errors=[str(exc)],
        )
        repaired, _ = await component_model_call(
            llm, state=state, logger=logger, run_dir=run_dir, page=page or 0, kind="minigame",
            stage="repair-plan", turn=turn,
            system_prompt="Repair a mini-game structural contract. Return only valid JSON.",
            user_prompt=plan_prompt + f"\n\nPrevious invalid response:\n{raw_plan}\n\nError:\n{exc}",
            response_model=MinigamePlan,
        )
        calls += 1
        plan = MinigamePlan.model_validate(extract_json(repaired))
        if plan.uses_score and not plan.score_rule.strip():
            raise ValueError(
                "minigame plan is invalid after repair: uses_score but score_rule is empty"
            )
    logger.emit(
        "component.plan.completed", agent_id="component:minigame", page=page,
        component_kind="minigame", visual_medium=plan.visual_medium.value,
    )

    system, build_prompt = _build_prompt(brief=brief, plan=plan)
    turn += 1
    logger.emit(
        "component.build.started", agent_id="component:minigame", page=page,
        component_kind="minigame",
    )
    raw_build, _ = await component_model_call(
        llm, state=state, logger=logger, run_dir=run_dir, page=page or 0, kind="minigame",
        stage="build", turn=turn, system_prompt=system, user_prompt=build_prompt,
    )
    calls += 1

    async def inspect(raw: str) -> tuple[MinigamePayload | None, list[str]]:
        try:
            payload = parse_minigame_payload(raw)
        except Exception as exc:
            return None, [str(exc)]
        failures = minigame_contract_failures(payload)
        failures += medium_mismatch_failures(plan.visual_medium, payload)
        js_failure = await minigame_js_syntax_failure(
            payload.game_component_js, workspace=workspace, label="minigame",
            timeout_sec=VALIDATION_TIMEOUT_SEC, error_chars=VALIDATION_ERROR_MAX_CHARS,
        )
        if js_failure:
            failures.append(js_failure)
        return payload, failures

    payload, failures = await inspect(raw_build)
    if failures:
        if repairs >= MAX_REPAIR_CALLS:
            raise ValueError("minigame build validation failed: " + "; ".join(failures))
        repairs += 1
        turn += 1
        logger.emit(
            "component.repair.started", agent_id="component:minigame", page=page,
            component_kind="minigame", component_stage="build", errors=failures,
        )
        repair_prompt = build_prompt + (
            "\n\nRegenerate the complete two-part response. Fix every deterministic validation "
            "error below while preserving the structural contract:\n- " + "\n- ".join(failures)
            + "\n\nPrevious response:\n" + raw_build
        )
        raw_build, _ = await component_model_call(
            llm, state=state, logger=logger, run_dir=run_dir, page=page or 0, kind="minigame",
            stage="repair-build", turn=turn, system_prompt=system, user_prompt=repair_prompt,
        )
        calls += 1
        payload, failures = await inspect(raw_build)
        if failures:
            raise ValueError("minigame build is invalid after repair: " + "; ".join(failures))
    assert payload is not None

    minigame_id = make_minigame_id(f"{brief}\0{plan.tag_name}\0{plan.visual_medium.value}")
    record = write_minigame(
        run_dir, minigame_id=minigame_id, page=page, title=payload.title,
        tag_name=plan.tag_name, visual_medium=plan.visual_medium,
        index_html=payload.index_html, game_component_js=payload.game_component_js,
        model_calls=calls, repair_calls=repairs, provenance=PROVENANCE,
    )
    logger.emit(
        "component.validated", agent_id="component:minigame", page=page,
        duration_ms=round((time.monotonic() - generation_started) * 1000),
        component_kind="minigame", minigame_id=minigame_id, model_calls=calls,
        repair_calls=repairs, sha256_index=record.sha256_index,
        sha256_component=record.sha256_component,
    )
    return record
