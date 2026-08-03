from __future__ import annotations

import re
from typing import Any, Dict, List

from .bundler import compose_bundle, example_widget_code, planning_layout_rules, resolve_example_direction
from .constants import CORE_GUIDANCE, MODULE_GUIDANCE
from .directions import render_direction_menu


def recent_conversation_context(history: List[Dict[str, Any]]) -> str:
    lines: List[str] = []
    for msg in history[-6:]:
        if not isinstance(msg, dict):
            continue
        role = str(msg.get("role") or "unknown")
        name = str(msg.get("character_name") or msg.get("role_id") or "").strip()
        content = str(msg.get("content") or "").strip()
        if not content:
            continue
        prefix = f"{role}:{name}" if name else role
        lines.append(f"{prefix}: {content[:300]}")
    return "\n".join(lines) if lines else "(none)"


def _guideline_bundle(widget_type: str) -> str:
    # Bundles are composed from orthogonal fragments (see bundler.py): shared design
    # core + the module-specific fragments for this widget_type. Unknown types get
    # the bare core. The constants fallback only fires if fragment files are missing.
    try:
        bundle = compose_bundle(widget_type)
    except Exception:
        bundle = ""
    if bundle:
        return f'<module name="{widget_type}">\n{bundle}\n</module>'

    fallback = MODULE_GUIDANCE.get(widget_type) or CORE_GUIDANCE
    return f'<module name="{widget_type}">\n{fallback}\n</module>'


# Default example (lab-dark) — kept as a module-level constant for the read_me trailer.
EXAMPLE_WIDGET_CODE = example_widget_code()

# Per-direction example metadata: (title, loading_messages, assistant_text, committed details).
_EXAMPLE_META: Dict[str, tuple] = {
    "lab-dark": (
        "damped_pendulum_lab",
        ["Calibrating pendulum", "Lighting the lab"],
        "An interactive damped pendulum — drag the slider to change damping.",
        "instrument furniture (tick ruler, corner θ readout in mono), exactly ONE emphasized live element (the bob — glowing in dark mode, saturated ink in light; all chrome stays matte), the whole instrument re-skins with the app theme via [data-theme], restyled controls with hover/active states",
    ),
    "paper-editorial": (
        "poem_stanza_card",
        ["Setting the type", "Inking the page"],
        "A stanza-by-stanza reading card for The Road Not Taken.",
        "warm paper panel, oversized quote mark, serif display, hairline rules, 450ms crossfades, terracotta fill-on-hover button",
    ),
    "studio-pop": (
        "color_mix_studio",
        ["Stretching the canvas", "Squeezing the tubes"],
        "Pick two colors and watch them blend.",
        "thick borders, hard offset shadows with hover lift, circular badge, 700-weight oversized hex display",
    ),
    "terminal-data": (
        "kpi_pulse_board",
        ["Connecting feeds", "Crunching deltas"],
        "A service KPI board — toggle the period to compare.",
        "a panel that re-skins with the app theme via [data-theme], tabular-nums count-up, sparklines, dotted dividers, semantic delta chips",
    ),
    "soft-organic": (
        "breathing_circle",
        ["Planting the seed", "Finding the rhythm"],
        "A guided 4-4-6 breathing exercise.",
        "blob radii, layered translucent halos, slow ease-in-out breathing motion, pill button, reduced-motion gate",
    ),
    "blueprint": (
        "lever_balance_blueprint",
        ["Drafting the schematic", "Calibrating forces"],
        "Slide the fulcrum to balance the lever.",
        "grid paper surface, dashed construction lines, dimension lines with end ticks, amber fulcrum, mono labels",
    ),
    "ink-wash": (
        "ink_wash_nocturne",
        ["研墨铺纸", "落笔成山"],
        "一幅程序生成的水墨夜景——点击「另作一幅」换一幅构图。",
        "procedurally GENERATED scenery (noise ridgelines with atmospheric perspective, mist bands, paper grain) instead of hand-placed shapes, seal stamp, tracked serif verse, slow ink-reveal transition",
    ),
    "host-calm": (
        "account_overview_card",
        ["Laying out cards", "Wiring filters"],
        "An account overview with filterable projects.",
        "host CSS variables only, metric cards, hairline-bordered list with hover rows, chip filter with active state",
    ),
}

_PLAN_DIRECTION_RE = re.compile(r'"aesthetic_direction"\s*:\s*"([a-z-]+)')


def _structural_example(plan: str) -> str:
    match = _PLAN_DIRECTION_RE.search(plan or "")
    direction = resolve_example_direction(match.group(1) if match else None)
    title, loading, assistant_text, committed = _EXAMPLE_META[direction]
    code = example_widget_code(direction)
    import json as _json

    meta_line = _json.dumps(
        {"title": title, "widget_type": "interactive", "loading_messages": loading, "assistant_text": assistant_text},
        ensure_ascii=False,
    )
    return f"""
## Structural example ({title}, aesthetic_direction: {direction})

Notice how the direction is committed fully — {committed}. Commit to YOUR chosen direction just as completely. If your direction differs from this example, do NOT copy its palette or surfaces — implement your direction's spec and Kit instead; a different direction must look completely different.

{meta_line}
<widget_code>
{code}
</widget_code>
""".strip()


def build_planning_prompt(
    *,
    query: str,
    widget_type: str,
    recent_context: str,
) -> str:
    return f"""
You are the design-planning step for an interactive UI widget generator. You do NOT write final HTML/CSS/JS here. You produce a STRUCTURAL CONTRACT as JSON — a precise blueprint that the next step implements verbatim. The contract pins down the four things that most often go wrong (layout, state, interaction, aesthetic direction) while leaving drawing details to the implementer.

Current request:
{query}

Suggested widget type:
{widget_type}

Relevant recent conversation:
{recent_context}

Think about what makes this a GOOD demonstration — not a static picture. For conceptual/technical topics (algorithms, architectures, physical systems, math), the user wants to manipulate something and SEE the consequence. A static labelled diagram with a click-to-show-text panel is a failure mode — avoid it.

CLARITY BEATS RICHNESS. The single most important thing is that the core concept reads crisply and unambiguously. A clean diagram that shows ONE idea sharply is far better than a busy widget with many controls where the main visual is muddy. Do NOT add extra controls, modes, or parameters (extra kernels, free-form editing, multiple toggles) if they make the central visualization harder to read. When in doubt, cut.

Rendering medium — choose deliberately, state it in the contract:
- Geometric / structural concepts (boundaries, lines, vectors, regions, graphs, flows, hierarchies) → DECLARATIVE SVG with named elements (`<line>`, `<path>`, `<circle>`). Crisp vector strokes. Compute lines/curves ANALYTICALLY and set element coordinates — NEVER draw a boundary by sampling a pixel grid and dotting cells; that looks blurry and noisy.
- Use `<canvas>` ONLY for genuinely pixel/particle-heavy content: many moving particles, continuous fields, fluid/heat simulation, dense per-pixel shading. If the core visual is lines and shapes, canvas is the wrong tool.
- Note: canvas does NOT reliably resolve `var(--color-*)` for fillStyle/strokeStyle — another reason to prefer SVG for anything color-coded.

Aesthetic direction — pick ONE deliberately (the implementation step receives the full specs; this is the menu):
{render_direction_menu()}
Match the SUBJECT's mood, not habit. Variety is a goal: widgets on different topics must not share a direction. If the user names a style ("cyberpunk", "watercolor"), answer custom:<name> and define the palette yourself.

Design rules the contract MUST respect:
- Width is fluid (host-driven, unknown). Layout uses 100% / 1fr / minmax(0,1fr) — never fixed pixel widths on regions. Height grows with content.
{planning_layout_rules()}
- At least one control must produce a VISIBLE change in the main visualization.
- The initial render is non-empty and meaningful — never "click to start".
- There is ONE update entry point: every state change calls a single update() that re-derives the view from current state. For SVG this means updating the named elements' attributes; for canvas it means a redraw. Either way, no scattered ad-hoc mutations spread across handlers.

Return ONE JSON object only — no prose, no markdown fences. Schema:

{{
  "core_insight": "<one sentence — what the user should understand after using this>",
  "render_medium": "svg | canvas",
  "render_medium_reason": "<short — why this medium fits the core visual>",
  "aesthetic_direction": "<lab-dark | paper-editorial | studio-pop | terminal-data | soft-organic | blueprint | ink-wash | host-calm | custom:<short-name>>",
  "direction_reason": "<one short clause — why this direction fits this subject>",
  "palette": ["<surface hex>", "<ink hex>", "<accent1 hex>", "<accent2 hex, optional>"],
  "signature_detail": "<ONE memorable visual idea, e.g. 'glowing bob with fading motion trail', 'oversized serif drop cap', 'dashed dimension arrows with end ticks'>",
  "layout_pattern": "<stage+readout-row | balanced-split | stepper | bento | editorial-column — simulations and anything with a main viz default to stage+readout-row (FULL-WIDTH stage); pick balanced-split ONLY if the sidebar is at most 2 short cards whose combined height stays under the stage height>",
  "layout_skeleton": "<region tree implementing layout_pattern, top-to-bottom, with fluid sizing AND column balance, e.g. 'title row (100%) / controls wrap row (100%) / stage canvas 16:9 (100%) / readout row (3x 1fr)'>",
  "state_model": [
    {{"name": "<jsVarName>", "type": "int|float|bool|string|array", "range_or_values": "<e.g. 0..7, true/false, ['我','爱','你']>", "initial": "<concrete initial value>"}}
  ],
  "interactions": [
    {{"trigger": "<element + event, e.g. 'range#heads input'>", "effect": "<which state changes and what updates visually>"}}
  ],
  "render_contract": "<one sentence: what update() re-derives from state, and (for SVG) which named elements it sets, or (for canvas) what it redraws>",
  "initial_paint": "<what is on screen at first render, with concrete values from state_model initials. Must be MID-ACTION: the system one step in (first iteration applied, simulation a moment after launch) — never a zeroed dashboard or an empty stage waiting for a click>"
}}

Keep every string tight and concrete. Prefer \"range#k (1..8) -> recompute neighbors, recolor decision regions\" over \"interactive slider\". The state_model names you choose ARE the variable names the implementer will use.
""".strip()


def build_primary_prompt(
    *,
    query: str,
    widget_type: str,
    recent_context: str,
    plan: str = "",
) -> str:
    plan_section = (
        "\nStructural contract to implement (from the planning step — implement it faithfully, "
        "do not redesign). Use the exact state_model variable names, wire every interaction's "
        "trigger to a real event handler, and route all updates through the single update() the "
        "render_contract describes. Honor render_medium: if it says svg, build the visual from "
        "named SVG elements and compute lines/curves analytically (never sample a pixel grid to "
        "draw a boundary); if it says canvas, reserve it for particle/field-style content. "
        "Honor the design brief: commit fully to aesthetic_direction using its palette and the "
        "signature_detail — the skill guidance below carries the full direction specs (surface, "
        "ink, type, motion). Keep the core visual crisp — prefer clarity over extra controls:\n"
        f"{plan}\n"
        if plan.strip()
        else ""
    )
    return f"""
You are generating a self-contained interactive UI widget for the current discussion.

Write ALL user-facing text (title, loading_messages, assistant_text, visible widget strings) in the SAME language as the current request. Code identifiers and JSON keys stay ASCII.

Current request:
{query}

Suggested widget type:
{widget_type}

Relevant recent conversation:
{recent_context}
{plan_section}
Visualization skill guidance:
{_guideline_bundle(widget_type)}

{_structural_example(plan)}

---

Your response MUST have exactly two parts in this order - nothing else:

Part 1 - a single JSON object on one or more lines (no widget_code field):
{{
  "title": "<short title, SAME language as the request>",
  "widget_type": "{widget_type}",
  "loading_messages": ["<msg in request's language>", "..."],
  "assistant_text": "<one short sentence in the request's language>"
}}

Part 2 - the widget HTML/CSS/JS wrapped in <widget_code> tags (raw, NOT JSON-escaped):
<widget_code>
<style>...</style>
<div>...</div>
<script>...</script>
</widget_code>

Rules:
- widget_type must stay "{widget_type}" unless the request clearly requires another allowed type.
- assistant_text must be one short natural sentence only.
- widget_code must be a complete self-contained HTML fragment ready to render in a sandboxed iframe.
- No <!doctype>, <html>, <head>, <body> tags.
- Structure order inside widget_code: <style> first, then markup, then <script>.
- Do NOT JSON-escape widget_code - write it as raw HTML/CSS/JS between the tags.
- Use the current request as the primary goal; use recent conversation only when it sharpens the intended UI.
- Put explanations in assistant_text, not inside the widget body.
- No markdown fences around the JSON.
- No text outside these two parts.

Layout — width is fluid, height is content-driven (THIS IS LOAD-BEARING, READ CAREFULLY):
- The host container has a fixed width that you do NOT know. Design the widget to be FLUID horizontally.
- NEVER hardcode pixel widths on layout containers. Forbidden patterns: `width: 800px`, `width: 600px`, `min-width: 700px`, `grid-template-columns: 180px 1fr 240px` (fixed pixel tracks force overflow on narrow hosts).
- Use `width: 100%`, `max-width: <Npx>`, fractional units (`1fr`), or `minmax(0, 1fr)` for grid tracks. For multi-column layouts prefer `grid-template-columns: repeat(auto-fit, minmax(<Npx>, 1fr))` or all-`1fr` tracks.
- Canvas and images have intrinsic pixel dimensions for drawing — that is fine on the element itself, but ALWAYS wrap them with `style="width:100%; max-width:<Npx>; height:auto; display:block"` so they shrink with the host.
- Height: do NOT set a fixed pixel height on any outer/root wrapper. The frame grows to fit your content. Inner regions (a heatmap cell, a canvas) may have pixel heights, but the root container must let height be `auto`.
- Do NOT use `overflow: hidden` on the outermost wrapper — it hides content when your size guess is wrong.
- Verify mentally: would your widget still look right if the host were 600px wide? 900px wide? If not, redesign with fluid units.

Before emitting, run the beauty check from the skill guidance: direction committed fully, one signature detail present, every interactive element has hover/active feedback with a transition, exactly one dominant element, readable in both light and dark host modes, all displayed numbers rounded — and ZERO machine tells: no self-introducing headline, no bilingual double labels, no instruction pills, no status text boxed as a metric, no identical-card filler row, no ambient neon (only one live element class may glow; chrome stays matte).
""".strip()


def build_repair_prompt(*, query: str, broken_payload: Dict[str, Any]) -> str:
    import json as _json

    widget_type = str(broken_payload.get("widget_type") or "interactive")
    display_payload = {k: v for k, v in broken_payload.items() if k != "widget_code"}
    widget_code_snippet = str(broken_payload.get("widget_code") or "")[:300]
    return f"""
Fix the following widget response so it is valid and renderable.

Write ALL user-facing text (title, loading_messages, assistant_text, visible widget strings) in the SAME language as the original request. Code identifiers and JSON keys stay ASCII.

Original request:
{query}

Broken metadata (widget_code excluded):
{_json.dumps(display_payload, ensure_ascii=False)}

Broken widget_code (first 300 chars):
{widget_code_snippet}

Relevant guidance:
{_guideline_bundle(widget_type)}

Return the fixed response in EXACTLY the same two-part format:

Part 1 - metadata JSON (no widget_code field, no width/height):
{{"title": "...", "widget_type": "{widget_type}", "loading_messages": [...], "assistant_text": "..."}}

Part 2 - raw widget HTML/CSS/JS:
<widget_code>
<style>...</style>
...markup...
<script>...</script>
</widget_code>

Validation rules for widget_code:
- Must be an HTML fragment (no <!doctype>, <html>, <head>, <body>).
- Must contain at least one of: <div>, <svg>, <canvas>, <style>.
- Length must be at least 50 characters.
- Do NOT JSON-escape the widget_code - write it raw between the tags.
""".strip()


def build_validation_repair_prompt(
    *,
    query: str,
    widget_type: str,
    recent_context: str,
    broken_payload: Dict[str, Any],
    validation_errors: List[str],
) -> str:
    import json as _json

    error_lines = "\n".join(f"- {item}" for item in validation_errors) or "- payload is invalid"
    display_payload = {k: v for k, v in broken_payload.items() if k != "widget_code"}
    widget_code_snippet = str(broken_payload.get("widget_code") or "")[:300]
    return f"""
Regenerate this widget response so it passes validation and stays faithful to the request.

Write ALL user-facing text (title, loading_messages, assistant_text, visible widget strings) in the SAME language as the current request. Code identifiers and JSON keys stay ASCII.

Current request:
{query}

Suggested widget type:
{widget_type}

Relevant recent conversation:
{recent_context}

Previous invalid metadata:
{_json.dumps(display_payload, ensure_ascii=False)}

Previous invalid widget_code (first 300 chars):
{widget_code_snippet}

Validation errors to fix:
{error_lines}

Visualization skill guidance:
{_guideline_bundle(widget_type)}

Return the fixed response in EXACTLY the same two-part format:

Part 1 - metadata JSON (no widget_code field, no width/height):
{{
  "title": "<short title, SAME language as the request>",
  "widget_type": "{widget_type}",
  "loading_messages": ["<msg in request's language>", "..."],
  "assistant_text": "<one short sentence in the request's language>"
}}

Part 2 - raw widget HTML/CSS/JS:
<widget_code>
<style>...</style>
...markup...
<script>...</script>
</widget_code>

Requirements:
- Fix every validation error listed above.
- Keep widget_type as "{widget_type}" unless the request absolutely forces another allowed type.
- Keep the widget self-contained and renderable inside a sandboxed iframe.
- Do NOT JSON-escape widget_code - write it raw between the tags.
- Put explanations in assistant_text, not inside the widget body.
""".strip()
