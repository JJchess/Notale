"""Aesthetic direction library — single source for guideline bundle, planning menu, and validators.

Edit HERE; then regenerate the top-level guideline artifacts:
    python -m agent.skills.generative_ui.bundler
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Direction:
    key: str
    menu_line: str
    spec_block: str


DIRECTIONS_INTRO = """## Aesthetic directions — pick ONE before coding

This is mandatory. Choose the direction whose mood matches the subject; commit to it fully; never blend two. Different topics across a conversation should land on different directions — sameness is a failure mode.

Widgets follow the app's light/dark theme. Each direction below gives a **light register** (the default rules) and a **dark register** (applied under `[data-theme="dark"]`, which the app sets on `<html>`). Keep the aesthetic identity — type, motion, signature, structure — constant across both registers; only surface/ink/accent shift. NEVER use `@media (prefers-color-scheme)` — it tracks the OS, not the app's toggle, and desyncs from the page. The one exception is a pictorial scene (an ink-wash painting, a drawn sunset): like any painting it carries its own fixed background and does not invert."""


DIRECTIONS: dict[str, Direction] = {
    "lab-dark": Direction(
        key="lab-dark",
        menu_line="instrument: tick rulers, mono readouts, one live trace — re-skins to the app theme — physics/chem/algorithm sims, particles, waves",
        spec_block="""**`lab-dark` — precision instrument.** Physics/chemistry/algorithm simulations; particles, fields, waves; anything animated on a stage. Reference: an oscilloscope or mission-control display — NOT a neon dashboard. The instrument re-skins with the app theme; the dark register is the classic phosphor look.
- Light surface: panel `#F3F1FA`, inner stage `#FBFAFE`, gridlines `rgba(90,78,128,.10)`; ink `#23203A` / muted `#6B6385`
- Dark surface (`[data-theme="dark"]`): panel `#131028`, inner stage `#0F0C20`, gridlines `rgba(168,155,190,.10)`; ink `#E8E0F0` / muted `#A89BBE`
- Accent — ONE phosphor color chosen to fit the subject. Dark register = luminous (cyan `#22D3EE` waves/cold/signal, amber `#FBBF24` heat/energy, green `#4ADE80` life/chemistry); light register = the SAME hue as saturated ink (cyan→`#0E7490`, amber→`#B45309`, green→`#15803D`). A second hue appears only when the subject is genuinely binary — as flat fills, never a second neon.
- Glow budget: in the DARK register exactly ONE class of live element glows (the moving particle, the active trace) via `box-shadow`/`shadowBlur`. In the LIGHT register there is NO glow — the live element reads by saturation + a 2px stroke instead. Chrome NEVER glows in either register.
- Structure is drawn, not buttoned: flat fills, 1px hairlines, containment regions, solid connectors. Neon-outlined pill nodes are a machine tell. Active state = fill brightens + one accent edge, not a glow border.
- Type: mono readouts (`ui-monospace, 'Cascadia Mono', Consolas, monospace`) with `font-variant-numeric: tabular-nums`; sans labels; uppercase tracked labels at most 2–3 per widget
- Motion: state 120ms linear; layout 350ms `cubic-bezier(.22,1,.36,1)`
- Signature (both registers): instrument furniture — a hairline tick ruler with scale marks along one axis, a corner mono readout strip, a crosshair or scanline where apt — plus the single emphasized live trace
- Kit: button light `#ECE8F6` / dark `#241D40`, `1px solid` register hairline, `border-radius:8px`, active `scale(.97)` · slider track light `#DDD6EC` / dark `#2E2553` + thumb = the accent ink (flat, no glow) · a `<canvas>` reads `document.documentElement.getAttribute('data-theme')` to choose its palette and redraws on change""",
    ),
    "paper-editorial": Direction(
        key="paper-editorial",
        menu_line="warm paper, serif display, terracotta/moss — poetry, literature, history, language, philosophy",
        spec_block="""**`paper-editorial` — warm print.** Poetry, literature, history, philosophy, language, storytelling.
- Light surface: panel `#FAF6EE`, ink `#272420`, hairline rule `#D6CDBD`, muted `#8A8273`
- Dark surface (`[data-theme="dark"]`): panel `#221E18`, ink `#E8E2D6`, rule `#4A4338`, muted `#9A917F`
- Accents (both): terracotta `#C2410C`, moss `#4D7C0F`
- Type: serif display (`Georgia, 'Times New Roman', serif`) 26–32px for the lead element; body 16px / line-height 1.75
- Motion: 450ms opacity/transform fades only; nothing bounces
- Signature: 1px hairline rules, an oversized serif quotation mark or drop cap, generous margins
- Kit: button transparent with `1px solid #C2410C; color:#C2410C`, hover fills `#C2410C` with the panel color as text · inner card light `#FFFDF8` / dark `#2A251E` with hairline border · drop cap `float:left; font-size:54px; line-height:.85; padding-right:8px` · divider: centered `· · ·` or 1px rule""",
    ),
    "studio-pop": Direction(
        key="studio-pop",
        menu_line="white + bold geometric color blocks, hard offset shadows — art, design, music, playful or kid-facing topics",
        spec_block="""**`studio-pop` — gallery poster.** Art, design, music, creative showcases, playful or kid-facing topics.
- Light surface: `#FFFFFF`; ink, borders, and hard offset shadow all `#18181B`
- Dark surface (`[data-theme="dark"]`): `#1B1B20`; ink, borders, and hard offset shadow all `#FAFAFA` (the hard shadow flips to light so it still reads)
- Accents (pick 2, vivid in both registers): electric violet `#7C3AED`, lemon `#FDE047`, hot coral `#FB7185`, mint `#5EEAD4`
- Type: sans 700 display, `letter-spacing: -0.02em`, oversized numerals
- Motion: snappy 160ms ease-out; hover lifts the element
- Signature: 2–3px solid borders, hard offset shadows (`box-shadow: 4px 4px 0 <register ink>`), circular badges
- Kit: button 3px border + 3px hard shadow in the register's ink, `font-weight:700`, hover `translate(-2px,-2px)` + bigger shadow, active resets · tile: solid accent block with 3px border · badge: lemon circle, 700 weight""",
    ),
    "terminal-data": Direction(
        key="terminal-data",
        menu_line="mono tabular numerals, green/red deltas, sparklines — finance, metrics, performance dashboards",
        spec_block="""**`terminal-data` — trading desk.** Finance, metrics, performance, engineering dashboards, logs.
- Light surface: panel `#F8F6FB`, metric card `#FFFFFF`, ink `#1A1A2E` / muted `#6B6385`; dotted gridlines `rgba(90,78,128,.18)`
- Dark surface (`[data-theme="dark"]`): panel `#17141F`, metric card `#1F1A2D`, ink `#D6D2DE` / muted `#847CA3`; dotted gridlines `rgba(168,155,190,.25)`
- Deltas: positive light `#15803D` / dark `#34D399`; negative light `#B91C1C` / dark `#F87171`; neutral accent (sparklines, active tab) light `#6D28D9` / dark `#A78BFA`
- Type: mono numerals, `font-variant-numeric: tabular-nums`; 11–12px uppercase labels with `letter-spacing: .08em`
- Motion: numbers count up 400ms; bars grow 400ms ease-out; zero decorative motion
- Signature: 1px dotted gridlines, sparklines (stroke = neutral accent), ▲/▼ deltas in semantic color
- Kit: button 1px hairline (light `rgba(90,78,128,.3)` / dark `rgba(168,155,190,.3)`), mono 12px uppercase, hover border → neutral accent · delta chip `▲ +4.2%` / `▼ -1.8%` mono in semantic color · row dividers 1px dotted · metric card per register above, radius 8""",
    ),
    "soft-organic": Direction(
        key="soft-organic",
        menu_line="cream + sage/clay blob shapes, breathing motion — biology, nature, health, food, emotions",
        spec_block="""**`soft-organic` — field notebook.** Biology, nature, health, food, environment, emotions.
- Light surface: cream `#FBF9F4`, ink `#3A5A50`, hint `#7C8A77`
- Dark surface (`[data-theme="dark"]`): `#1F231F`, ink `#D9E2D6`, hint `#93A38E`
- Shapes (both registers): sage `#84A98C`, clay `#E07A5F`, pine `#3A5A50`
- Type: sans, roomy spacing
- Motion: 500ms ease-in-out; slow breathing loops (`transform: scale(1)↔scale(1.03)`) for living things
- Signature: blob radii (`border-radius: 58% 42% 55% 45% / 48% 55% 45% 52%`), layered translucent circles, leaf/petal accents drawn as SVG paths
- Kit: button pill `border-radius:999px; background:#84A98C; color:#FFF`, hover `scale(1.04)` + deepen to `#6E927A`, active `scale(.98)` · inner card light `#FFFFFF` / dark `#2A2F2A`, radius 20–24 · tag pill clay `#E07A5F` · readout: layered translucent sage circles behind the number""",
    ),
    "blueprint": Direction(
        key="blueprint",
        menu_line="pale grid + indigo ink, dashed construction lines — mechanics, architecture, how-things-work cutaways",
        spec_block="""**`blueprint` — engineer's drawing.** Architecture, mechanics, hardware, how-things-work cutaways.
- Light surface: pale grid `#F4F7FB`, ink `#1E4D8C`, gridlines `rgba(30,77,140,.07)`, border `#C7D6EA`
- Dark surface (`[data-theme="dark"]`): grid `#0C1D33`, ink `#9DC2EB`, gridlines `rgba(157,194,235,.10)`, border `rgba(157,194,235,.20)`
- Accent: one warm highlight for the active part — light `#D97706` / dark `#F59E0B`
- Type: mono labels with `letter-spacing: .05em`; 12px dimension numerals
- Motion: 200ms linear; parts slide along axes (transform only)
- Signature: dashed construction lines (`stroke-dasharray: 6 4`), measurement arrows with end ticks, corner crop marks
- Kit: ink strokes/text use `currentColor` (set `color` per register) so the drawing re-inks itself; the warm accent is a CSS var swapped per register · grid surface = register bg + two `linear-gradient` hairlines at `background-size: 24px 24px` · button `1px solid currentColor`, mono, `border-radius:2px`, hover faint ink tint · callout box: 1px dashed · active part: accent fill/stroke""",
    ),
    "ink-wash": Direction(
        key="ink-wash",
        menu_line="raw paper + layered ink ridgelines, seal-red accent — classical Chinese subjects: poetry, landscape, calligraphy, tea",
        spec_block="""**`ink-wash` — 水墨 scroll.** Classical Chinese subjects: poetry imagery, landscape, calligraphy, tea, traditional culture.
- Surface: raw paper `#F5F1E8` — FIXED. This is a painting; like any painting it does NOT invert with the app theme (the one direction that stays put in both modes). Ink is `#2A2D30` at layered opacities (far `.18` / mid `.30` / near `.52`).
- Accents (tiny doses only): seal vermilion `#9E2B22`, moon gold `#E5C158`
- Type: serif (`Georgia, 'Times New Roman', 'Noto Serif SC', serif`); hanzi tracked out (`letter-spacing: .3em`); short titles may run vertical (`writing-mode: vertical-rl`)
- Motion: slow ink reveals — opacity 600–900ms ease; nothing bounces, nothing glows
- Signature: layered noise ridgelines with atmospheric perspective (farther = paler + smoother), one red seal stamp, generous 留白 — the empty space IS the composition
- Kit: panel radius 6px · button `1px solid #2A2D30`, serif, tracked, hover inverts to ink bg with paper text · seal: `writing-mode:vertical-rl` on `#9E2B22`, slight rotate · mist: translucent paper-colored horizontal bands between ridge layers · scenery is GENERATED, not hand-placed — use the algorithmic scenery recipes""",
    ),
    "host-calm": Direction(
        key="host-calm",
        menu_line="app-native quiet, host CSS variables — data records, forms, business UI mockups",
        spec_block="""**`host-calm` — quiet native.** Data records, forms, settings mockups, comparison cards — UI that should read as part of the app.
- Surface: transparent root; cards `var(--color-background-primary)`, `0.5px solid var(--color-border-tertiary)`, `border-radius: var(--border-radius-lg)`. Built entirely from host variables, so it follows the app theme automatically — no register blocks needed.
- Ink: `var(--color-text-primary)` / `var(--color-text-secondary)` · Accents: host semantic vars + the 9 SVG color ramps
- Type: `var(--font-sans)`, weights 400/500
- Motion: 150ms ease; hover `var(--color-background-secondary)`; active `scale(0.98)`
- Signature: restraint — generous whitespace, hairline dividers, a single 2px accent border on the featured item
- Kit: controls as bare tags (host pre-styles them) · metric card `var(--color-background-secondary)`, no border, radius-md, 13px muted label over 24px/500 number · chip: `0.5px` border pill, active state `var(--color-background-info)` + `var(--color-text-info)`""",
    ),
}


def render_directions_block() -> str:
    """Full library for the guideline bundle: intro + every direction spec."""
    specs = "\n\n".join(d.spec_block for d in DIRECTIONS.values())
    return DIRECTIONS_INTRO + "\n\n" + specs


def render_direction_menu() -> str:
    """One line per direction, for the planning prompt."""
    return "\n".join(f"- {d.key}: {d.menu_line}" for d in DIRECTIONS.values())
