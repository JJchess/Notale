"""Adapted GenerativeUI design bundles for fixed-canvas Notale components.

The direction system, modular guideline architecture, and structural examples are
ported from JJchess/GenerativeUI commit
``89e62a5aabcf18f2b2c9cbb2d6d0c242a9fb2f34``. Notale deliberately replaces
that project's fluid chat host, CDN, provider, and host-color contracts.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path


UPSTREAM_PROVENANCE = (
    "JJchess/GenerativeUI@89e62a5aabcf18f2b2c9cbb2d6d0c242a9fb2f34"
)
_FRAGMENTS = Path(__file__).resolve().parent / "assets" / "guidance" / "fragments"

_MODULE_PLAN: dict[str, tuple[str, ...]] = {
    "interactive": (
        "modules/ui-a", "modules/ui-physics", "modules/ui-b", "modules/palette",
        "modules/scenery-recipes",
    ),
    "mockup": ("modules/ui-a", "modules/ui-b", "modules/palette"),
    "chart": ("modules/ui-a", "modules/ui-b", "modules/palette"),
    "chart_interactive": ("modules/ui-a", "modules/ui-b", "modules/palette"),
    "art": ("modules/budget", "modules/svg-core", "modules/art", "modules/scenery-recipes"),
    "art_interactive": (
        "modules/budget", "modules/svg-core", "modules/art", "modules/scenery-recipes",
        "modules/ui-a", "modules/ui-physics", "modules/ui-b", "modules/palette",
    ),
    "diagram": (
        "modules/palette", "modules/budget", "modules/svg-core", "modules/diagram-types",
    ),
}

_DIRECTIONS: dict[str, str] = {
    "lab-dark": (
        "Precision instrument: dark or high-contrast stage, fine grid/rulers, mono tabular "
        "readouts, restrained glow on live elements, crisp linear motion. Use Style surface/ink "
        "and accent tokens rather than an independent neon palette."
    ),
    "paper-editorial": (
        "Warm print: editorial hierarchy, hairline rules, serif display when compatible with the "
        "Style font, generous margins, one oversized typographic mark, slow opacity/transform fades."
    ),
    "studio-pop": (
        "Gallery poster: bold geometric blocks, thick borders, hard-offset accents, oversized "
        "numerals and snappy feedback, all derived from the Style surfaces and two accents."
    ),
    "terminal-data": (
        "Trading desk: dense but legible mono readouts, dotted grids, sparklines and semantic "
        "deltas; use Style ink/surface and reserve accent colors for live data."
    ),
    "soft-organic": (
        "Field notebook: roomy spacing, organic radii, layered translucent shapes and calm "
        "ease-in-out motion; tint Style accents instead of introducing a separate palette."
    ),
    "blueprint": (
        "Engineer's drawing: measured grid, construction lines, dimension arrows, crop marks and "
        "one active-part highlight using the Style accent."
    ),
    "ink-wash": (
        "Ink scroll: atmospheric layered forms, quiet negative space, one seal-like accent and "
        "slow reveals; derive paper/ink/seal roles from Style bg, ink and accent."
    ),
    "host-calm": (
        "Quiet native: Style-token surfaces, hairline borders, restrained spacing and one small "
        "accent edge; no independent component branding."
    ),
}

_EXAMPLES: dict[str, str] = {
    "lab-dark": "lab-dark-pendulum",
    "paper-editorial": "paper-editorial-poem",
    "studio-pop": "studio-pop-mixer",
    "terminal-data": "terminal-data-kpis",
    "soft-organic": "soft-organic-breathing",
    "blueprint": "blueprint-lever",
    "ink-wash": "ink-wash-nocturne",
    "host-calm": "host-calm-record",
}

_HOST_VARIABLES = {
    "--color-background-primary": "--notale-surface",
    "--color-background-secondary": "--notale-bg",
    "--color-background-tertiary": "--notale-bg",
    "--color-background-info": "--notale-surface",
    "--color-background-danger": "--notale-surface",
    "--color-background-success": "--notale-surface",
    "--color-background-warning": "--notale-surface",
    "--color-text-primary": "--notale-ink",
    "--color-text-secondary": "--notale-muted",
    "--color-text-tertiary": "--notale-muted",
    "--color-text-info": "--notale-accent",
    "--color-text-danger": "--notale-accent-2",
    "--color-text-success": "--notale-accent",
    "--color-text-warning": "--notale-accent-2",
    "--color-border-primary": "--notale-line",
    "--color-border-secondary": "--notale-line",
    "--color-border-tertiary": "--notale-line",
    "--color-border-info": "--notale-accent",
    "--font-sans": "--notale-font-body",
    "--font-serif": "--notale-font-display",
    "--font-mono": "--notale-font-mono",
    "--border-radius-md": "--notale-radius-md",
    "--border-radius-lg": "--notale-radius-lg",
    "--border-radius-xl": "--notale-radius-xl",
}


def direction_menu() -> str:
    return "\n".join(f"- {key}: {value}" for key, value in _DIRECTIONS.items())


def direction_spec(key: str) -> str:
    return _DIRECTIONS.get(key, _DIRECTIONS["host-calm"])


@lru_cache(maxsize=None)
def _read(relative: str) -> str:
    return (_FRAGMENTS / f"{relative}.md").read_text(encoding="utf-8").strip()


def _adapt_host_contract(text: str) -> str:
    value = text.replace("imagine_html", "widget_code").replace("imagine_svg", "widget_code")
    value = value.replace("sendPrompt()", "a local state transition")
    value = value.replace("sendPrompt(", "void(")
    value = value.replace("openLink(", "void(")
    for source, target in _HOST_VARIABLES.items():
        value = value.replace(source, target)
    blocked_lines = (
        "cdn allowlist", "cdnjs.cloudflare.com", "esm.sh", "cdn.jsdelivr.net", "unpkg.com",
        "<script src=", "load libraries via", "external resources may", "href=\"https://",
        "width is fluid", "fluid and unknown", "height grows with content", "height is content-driven",
        "frame grows to fit", "do not set a fixed pixel height", "host container has a fixed width",
        "--color-", "includes chart.js", "hardcoded hex is correct",
    )
    return "\n".join(
        line for line in value.splitlines()
        if not any(token in line.casefold() for token in blocked_lines)
    )


@lru_cache(maxsize=None)
def compose_bundle(widget_type: str) -> str:
    core = (
        _read("core/00-head"), _read("core/20-direction-rules"),
        _read("core/30-craft"), _read("core/35-patterns"), _read("core/40-technical"),
    )
    parts = [_adapt_host_contract(item) for item in core]
    parts.extend(_adapt_host_contract(_read(item)) for item in _MODULE_PLAN.get(widget_type, ()))
    if widget_type in {"chart", "chart_interactive"}:
        parts.append(
            "## Native chart override\nBuild charts with declarative SVG or Canvas and plain "
            "JavaScript. Do not use Chart.js or any library. Draw axes, labels, legends, marks, "
            "hit targets and updates locally."
        )
    return "\n\n".join(parts)


@lru_cache(maxsize=None)
def planning_layout_rules() -> str:
    return _adapt_host_contract(_read("planning/layout-rules"))


@lru_cache(maxsize=None)
def example_widget_code(direction: str) -> str:
    name = _EXAMPLES.get(direction, _EXAMPLES["host-calm"])
    value = (_FRAGMENTS / "examples" / f"{name}.html").read_text(encoding="utf-8").strip()
    return _adapt_host_contract(value)


def notale_override(width: int, height: int) -> str:
    return f"""## Notale host override — later and authoritative

- The component viewport is exactly {width}×{height}px. The component root must fill 100% width and height, use `min-width:0; min-height:0`, and keep every visible element inside it.
- Return one root marked `data-notale-widget-root`, with `<style>` before markup and one optional inline `<script>` after markup.
- Use no remote assets, CDN, external scripts, fetch/import, navigation, host chat calls, or third-party globals. Native HTML/CSS/JS/SVG/Canvas only.
- Style Studio is authoritative. Use `--notale-bg`, `--notale-surface`, `--notale-ink`, `--notale-muted`, `--notale-accent`, `--notale-accent-2`, `--notale-accent-3`, `--notale-line`, `--notale-font-display`, `--notale-font-body`, and `--notale-font-mono`. Never define these variables and never use `--color-*` host variables.
- The chosen direction controls composition, density, edge treatment, typography roles and motion—not a separate palette. Extra literal colors are allowed only for meaningful data categories.
- No nested scrolling. Prefer a clean dominant visualization and concise direct labels. Do not add a generic title bar/card grid around it.
""".strip()
