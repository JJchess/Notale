"""Migrate the dormant profile libraries into StylePack presets.

``skills/narrative-keynote/profiles.yaml`` (12) and
``skills/pudding-playable-visual-essay/profiles.yaml`` (8) hold twenty
hand-authored palettes that no code path ever referenced. They predate the
current token vocabulary: seven colours instead of eight, and system font stacks
instead of offline catalog IDs. This script migrates them into
``styles/packs/presets/<id>/pack.json`` and rewrites the registry.

Three deliberate repairs happen here, each reported on stdout:

* ``accent-3`` did not exist, so it is derived by mixing ``accent`` with
  ``accent-2``. Patch a pack afterwards if the tertiary reads muddy.
* Some profiles pair a light ``surface`` with a light ``ink`` because they
  assumed per-region text colours. notale renders one ``ink``, so a surface that
  fails WCAG against it is pulled back toward the background.
* Legacy ``font``/``mono`` stacks are replaced by hand-chosen catalog IDs.

Run: ``python -m notale.scripts.migrate_style_profiles [--dry-run]``
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

import yaml

from notale.style_studio.paths import preset_packs_root, registry_path
from notale.style_studio.schema import CONTRAST_MINIMUM, validate_pack_dict
from notale.style_studio.tokens_bridge import _blend, _rgb, notale_to_deckbase
from notale.utils.skill_catalog import _contrast_ratio

NOTALE_ROOT = Path(__file__).resolve().parent.parent
SKILLS_ROOT = NOTALE_ROOT / "skills"

# Hand-chosen catalog fonts per profile: display carries the voice, body must
# stay readable at length, mono is editorial vs technical.
FONTS: Dict[str, Tuple[str, str, str]] = {
    # narrative-keynote
    "bold-signal": ("barlow-condensed", "noto-sans-sc", "jetbrains-mono"),
    "electric-studio": ("space-grotesk", "noto-sans-sc", "jetbrains-mono"),
    "creative-voltage": ("unbounded", "noto-sans-sc", "jetbrains-mono"),
    "dark-botanical": ("fraunces", "noto-serif-sc", "ibm-plex-mono"),
    "notebook-tabs": ("zcool-kuaile", "noto-sans-sc", "jetbrains-mono"),
    "pastel-geometry": ("zcool-qingke-huangyou", "noto-sans-sc", "jetbrains-mono"),
    "split-pastel": ("smiley-sans", "noto-sans-sc", "jetbrains-mono"),
    "vintage-editorial": ("zcool-xiaowei", "noto-serif-sc", "ibm-plex-mono"),
    "neon-cyber": ("unbounded", "noto-sans-sc", "jetbrains-mono"),
    "terminal-green": ("space-grotesk", "noto-sans-sc", "jetbrains-mono"),
    "swiss-modern": ("inter", "noto-sans-sc", "jetbrains-mono"),
    "paper-and-ink": ("source-serif-4", "noto-serif-sc", "ibm-plex-mono"),
    # pudding-playable-visual-essay
    "playful-system": ("zcool-kuaile", "noto-sans-sc", "jetbrains-mono"),
    "illustrated-journey": ("lxgw-wenkai", "lxgw-wenkai", "ibm-plex-mono"),
    "scrapbook-pop": ("ma-shan-zheng", "noto-sans-sc", "jetbrains-mono"),
    "archival-object": ("zhuque-fangsong", "zhuque-fangsong", "ibm-plex-mono"),
    "cartographic-field": ("space-grotesk", "noto-sans-sc", "jetbrains-mono"),
    "sonic-timeline": ("unbounded", "noto-sans-sc", "jetbrains-mono"),
    "graphic-editorial": ("fraunces", "noto-serif-sc", "ibm-plex-mono"),
    "technical-world": ("space-grotesk", "noto-sans-sc", "jetbrains-mono"),
}

RADIUS: Dict[str, str] = {
    "bold-signal": "sharp",
    "electric-studio": "sharp",
    "creative-voltage": "round",
    "dark-botanical": "soft",
    "notebook-tabs": "round",
    "pastel-geometry": "round",
    "split-pastel": "round",
    "vintage-editorial": "sharp",
    "neon-cyber": "sharp",
    "terminal-green": "sharp",
    "swiss-modern": "sharp",
    "paper-and-ink": "soft",
    "playful-system": "round",
    "illustrated-journey": "soft",
    "scrapbook-pop": "round",
    "archival-object": "sharp",
    "cartographic-field": "soft",
    "sonic-timeline": "soft",
    "graphic-editorial": "sharp",
    "technical-world": "sharp",
}

# The canvas contract is a fact about the 1280x720 slide, not about any one
# style, so every pack carries the same block.
CANVAS_CONTRACT = """
## Scale and spacing recipe (1280x720)

- Display/hero type 64-104px; page title 40-56px; section heading 24-32px.
- Body copy 17-21px with 1.5-1.65 line height; captions and annotations 13-15px.
- Outer margins 48-72px. Major gaps 24-40px; related items 12-16px.
- Treat these as the working range for this canvas, not as acceptance rules.
  Depart from them when the composition earns it.

## Component grammar

- Build structure from the assigned composition's spatial logic, not from a
  generic header/content/footer stack.
- One dominant carrier per page. Supporting elements attach to it rather than
  forming a second competing region.
- Borders, dividers, and shadows are structural. Use `--notale-line` for
  separation and reserve accents for meaning.

## Page contract

- Emit exactly one root element carrying `data-notale-page`.
- Use the injected `--notale-*` tokens. Never redefine them, never invent new
  token names, and never approximate a token with a literal hex value.
- Headings use `--notale-font-display`, body copy `--notale-font-body`, code
  `--notale-font-mono`.
- Everything is offline: no CDN, no remote fonts, images, scripts, or fetches.
- Interaction must run a real algorithm, never a scripted fake.
- The `text_role` counts in the assigned composition are hard caps. Fix overflow
  by cutting content, never by shrinking type or spacing.
"""

KEYNOTE_COMPOSITIONS: List[Dict[str, Any]] = [
    {
        "id": "keynote-statement",
        "name": "Keynote Statement",
        "primary": "typographic-statement",
        "secondary": "focal-object",
        "page_types": ["section-break", "narrative-scene"],
        "use_when": "A chapter turns, or one proposition must land before any evidence arrives.",
        "spatial_logic": "One large typographic block anchored off-centre, with generous void carrying the pause. A single small object or mark answers the type across the diagonal.",
        "dominant_carrier": "Type at display scale.",
        "text_role": "One statement of 8-18 words, at most one supporting line of 20 words.",
        "variation": "Move the anchor between upper-left, lower-left, and centre-left across the deck; vary whether the answering mark is present.",
        "avoid": "Centred title-and-subtitle lockups, bullet lists, decorative rules under the heading.",
    },
    {
        "id": "evidence-field",
        "name": "Evidence Field",
        "primary": "full-bleed-evidence",
        "secondary": "focal-object",
        "page_types": ["narrative-scene", "worked-example"],
        "use_when": "A single artifact, scene, or figure is itself the argument and must be seen at size.",
        "spatial_logic": "Evidence runs edge to edge. Text sits in a reserved quiet corner or a narrow band that never floats over the subject.",
        "dominant_carrier": "The evidence surface.",
        "text_role": "A 6-12 word claim plus at most three annotations of 12 words each.",
        "variation": "Alternate the quiet band between bottom, left, and top; vary the crop from wide to tight.",
        "avoid": "Framing the evidence in a card, tiling several images, dropping text on top of the focal region.",
    },
    {
        "id": "argument-split",
        "name": "Argument Split",
        "primary": "asymmetric-split",
        "secondary": "comparison",
        "page_types": ["narrative-scene", "worked-example", "quiz-check"],
        "use_when": "A claim and its demonstration must be read together but stay distinguishable.",
        "spatial_logic": "Roughly 38/62 split. The narrow side states, the wide side shows. The divide is real alignment, not a drawn box.",
        "dominant_carrier": "The wide demonstration side.",
        "text_role": "Narrow side 25-45 words; wide side labels only, at most six of 8 words.",
        "variation": "Swap which side is narrow; occasionally let the wide side bleed off one edge.",
        "avoid": "A 50/50 split, mirrored card pairs, repeating the narrow side's words as labels.",
    },
    {
        "id": "derivation-path",
        "name": "Derivation Path",
        "primary": "process-path",
        "secondary": "document-led",
        "page_types": ["formula-derivation", "worked-example"],
        "use_when": "A result is reached through ordered steps whose direction carries meaning.",
        "spatial_logic": "Steps advance along one clear axis. Each step is a station on the path, and the transformation between stations is visible.",
        "dominant_carrier": "The step sequence.",
        "text_role": "Three to six steps, each a heading of 3-8 words plus one line of at most 18 words.",
        "variation": "Run the path horizontally, vertically, or as a single fold; vary whether the final step is enlarged.",
        "avoid": "Numbered bullets pretending to be a path, uniform step cards, arrows added as decoration.",
    },
    {
        "id": "contrast-pair",
        "name": "Contrast Pair",
        "primary": "comparison",
        "secondary": "data-led",
        "page_types": ["narrative-scene", "quiz-check", "worked-example"],
        "use_when": "Meaning lives in the difference between two cases rather than in either alone.",
        "spatial_logic": "Two aligned fields sharing one baseline grid so differences register positionally. The shared axis is drawn once.",
        "dominant_carrier": "The paired fields.",
        "text_role": "One framing line of 12-20 words, then at most four labels of 6 words per side.",
        "variation": "Stack vertically instead of side by side; vary whether the difference is called out explicitly.",
        "avoid": "Two identical cards, a versus badge between them, different scales on the two sides.",
    },
    {
        "id": "explorable-stage",
        "name": "Explorable Stage",
        "primary": "interactive-workbench",
        "secondary": "spatial-map",
        "page_types": ["sim-explorable", "code-runnable"],
        "use_when": "The reader's action produces the evidence the page is about.",
        "spatial_logic": "One large stage holds the live model. Controls gather along a single edge and never surround the stage.",
        "dominant_carrier": "The interactive stage.",
        "text_role": "One instruction of at most 14 words plus at most four control labels of 4 words.",
        "variation": "Move the control edge; vary whether a readout sits beside the stage or inside it.",
        "avoid": "Controls on multiple edges, a dashboard of readouts, decorative chrome around the stage.",
    },
]

PUDDING_COMPOSITIONS: List[Dict[str, Any]] = [
    {
        "id": "world-model",
        "name": "World Model",
        "primary": "spatial-map",
        "secondary": "focal-object",
        "page_types": ["narrative-scene", "sim-explorable"],
        "use_when": "The subject is a place, network, or field whose geometry carries the argument.",
        "spatial_logic": "One continuous coordinate space fills the canvas. Labels attach directly to positions in it; nothing is relocated into a legend.",
        "dominant_carrier": "The world surface.",
        "text_role": "One orienting line of at most 16 words plus 2-6 attached labels of 6 words.",
        "variation": "Change the crop and zoom between pages while keeping object identities and orientation stable.",
        "avoid": "A separate legend box, floating cards over the map, resetting the coordinate frame between pages.",
    },
    {
        "id": "hero-mechanism",
        "name": "Hero Mechanism",
        "primary": "focal-object",
        "secondary": "layered-reveal",
        "page_types": ["narrative-scene", "formula-derivation", "section-break"],
        "use_when": "One object or mechanism must be understood before anything built on it.",
        "spatial_logic": "The object sits large and near-centre with real breathing room. Detail is revealed in layers over the same silhouette rather than in separate panels.",
        "dominant_carrier": "The object itself.",
        "text_role": "One naming line of 4-10 words plus at most five callouts of 8 words.",
        "variation": "Vary which layer is foregrounded and the viewing angle; keep proportions constant.",
        "avoid": "Exploded views by default, the object shrunk to make room for prose, callout boxes with borders.",
    },
    {
        "id": "state-sequence",
        "name": "State Sequence",
        "primary": "process-path",
        "secondary": "layered-reveal",
        "page_types": ["formula-derivation", "worked-example", "narrative-scene"],
        "use_when": "The same system must be read at several moments and the change between them is the point.",
        "spatial_logic": "Repeated instances of one persistent object across an ordered axis. Position and identity stay fixed so only the changing property moves.",
        "dominant_carrier": "The repeated object.",
        "text_role": "Three to five states, each labelled in at most 6 words, plus one summary line of 18 words.",
        "variation": "Vary the number of states and whether the axis is time or magnitude.",
        "avoid": "Redrawing the object differently per state, unequal spacing without meaning, arrows substituting for visible change.",
    },
    {
        "id": "data-field",
        "name": "Data Field",
        "primary": "data-led",
        "secondary": "matrix",
        "page_types": ["narrative-scene", "quiz-check", "worked-example"],
        "use_when": "A distribution or population is the evidence and individual cases still matter.",
        "spatial_logic": "Every record is a mark in one shared field. Encoding is stated once at the edge and never repeated per mark.",
        "dominant_carrier": "The field of marks.",
        "text_role": "One reading line of at most 18 words plus at most four annotations of 8 words.",
        "variation": "Vary the encoding channel and whether outliers are named; keep the field shape stable.",
        "avoid": "Chart junk, a legend that repeats the axis, aggregating away the individual marks.",
    },
    {
        "id": "annotated-workbench",
        "name": "Annotated Workbench",
        "primary": "interactive-workbench",
        "secondary": "document-led",
        "page_types": ["sim-explorable", "code-runnable"],
        "use_when": "The reader runs or tunes something and the result must be read against its source.",
        "spatial_logic": "A working surface paired with the artifact that drives it, sharing one alignment. Output appears next to its cause, not in a console far away.",
        "dominant_carrier": "The working surface.",
        "text_role": "One instruction of at most 14 words plus at most six inline annotations of 5 words.",
        "variation": "Vary the ratio of source to result and whether output is inline or adjacent.",
        "avoid": "A detached console strip, controls scattered around all edges, hiding the driving artifact.",
    },
    {
        "id": "essay-statement",
        "name": "Essay Statement",
        "primary": "typographic-statement",
        "secondary": "full-bleed-evidence",
        "page_types": ["section-break", "narrative-scene", "quiz-check"],
        "use_when": "The essay pauses to assert, ask, or turn before the next movement.",
        "spatial_logic": "Type dominates over a quiet ground, with one fragment of the visual world bleeding in at an edge to keep continuity.",
        "dominant_carrier": "Type at display scale.",
        "text_role": "One statement of 8-20 words plus at most one attribution or prompt of 12 words.",
        "variation": "Vary which edge the world fragment enters from and how much of it shows.",
        "avoid": "A blank slide with a centred sentence, quote marks as ornament, losing the visual world entirely.",
    },
]

FAMILIES = {
    "narrative-keynote": {
        "audience_hint": "general",
        "density_default": "reference",
        "compositions": KEYNOTE_COMPOSITIONS,
        "layout_family": "full_width_material",
        "info_form_bias": {
            "prefer": ["short_bullets", "observe_figure"],
            "avoid": ["dashboard", "dense_kpi_strip"],
        },
    },
    "pudding-playable-visual-essay": {
        "audience_hint": "general",
        "density_default": "reference",
        "compositions": PUDDING_COMPOSITIONS,
        "layout_family": "observe_split",
        "info_form_bias": {
            "prefer": ["observe_figure", "short_bullets"],
            "avoid": ["dashboard", "bento"],
        },
    },
}


def _parse_skill_body(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    parts = text.split("---", 2)
    body = parts[2] if len(parts) == 3 else text
    # Drop pointers to reference files the Builder cannot open.
    kept = [line for line in body.splitlines() if "references/" not in line]
    return "\n".join(kept).strip()


def _profile_essay(family: str, profile: str) -> str:
    path = SKILLS_ROOT / family / "references" / f"profile-{profile}.md"
    if not path.is_file():
        return ""
    lines = path.read_text(encoding="utf-8").strip().splitlines()
    # Drop the leading title; the pack states the direction itself.
    if lines and lines[0].startswith("#"):
        lines = lines[1:]
    return "\n".join(lines).strip()


def _derive_accent_3(accent: str, accent_2: str) -> str:
    blended = _blend(accent, accent_2, 0.5)
    return blended or accent


def _repair_surface(surface: str, background: str, ink: str) -> Tuple[str, bool]:
    ratio = _contrast_ratio(surface, ink)
    if ratio is None or ratio >= CONTRAST_MINIMUM:
        return surface, False
    for step in (0.06, 0.10, 0.14, 0.20, 0.28):
        candidate = _blend(background, ink, step)
        if candidate is None:
            break
        if (_contrast_ratio(candidate, ink) or 0) >= CONTRAST_MINIMUM:
            return candidate, True
    return background, True


def _repair_background(background: str, surface: str, ink: str) -> Tuple[str, bool]:
    """Some profiles read ink against a light card floating on a dark ground.

    notale paints one ``ink`` over one ``bg``, so a background that fails against
    ink is replaced by the reading ground the profile actually intended: the
    surface, nudged slightly toward ink so the two stay distinguishable.
    """
    ratio = _contrast_ratio(background, ink)
    if ratio is None or ratio >= CONTRAST_MINIMUM:
        return background, False
    if (_contrast_ratio(surface, ink) or 0) >= CONTRAST_MINIMUM:
        candidate = _blend(surface, ink, 0.05)
        if candidate and (_contrast_ratio(candidate, ink) or 0) >= CONTRAST_MINIMUM:
            return candidate, True
        return surface, True
    rgb = _rgb(ink)
    return ("#0B0B0B" if rgb and sum(rgb) > 382 else "#FFFFFF"), True


def _repair_accent(accent: str, background: str, ink: str, minimum: float = 2.5) -> str:
    """Re-tune an accent after the ground it was designed against was replaced.

    Only used when the background polarity flipped: pastels chosen to glow on a
    dark desk disappear on paper, so they are walked toward the ink until they
    read again.
    """
    if (_contrast_ratio(accent, background) or 0) >= minimum:
        return accent
    for step in (0.15, 0.3, 0.45, 0.6, 0.75):
        candidate = _blend(accent, ink, step)
        if candidate is None:
            break
        if (_contrast_ratio(candidate, background) or 0) >= minimum:
            return candidate
    return accent


def build_pack(
    family: str,
    profile_id: str,
    profile: Dict[str, Any],
    family_body: str,
) -> Tuple[Dict[str, Any], List[str]]:
    notes: List[str] = []
    raw = dict(profile.get("tokens") or {})
    description = str(profile.get("description") or "").strip()

    background = str(raw.get("bg") or "").strip()
    ink = str(raw.get("ink") or "").strip()
    accent = str(raw.get("accent") or "").strip()
    accent_2 = str(raw.get("accent-2") or "").strip()

    accent_3 = _derive_accent_3(accent, accent_2)
    notes.append("accent-3 derived from accent x accent-2")

    raw_surface = str(raw.get("surface") or "").strip()
    background, bg_repaired = _repair_background(background, raw_surface, ink)
    if bg_repaired:
        notes.append(f"bg repaired to {background} for WCAG against ink")

    surface, repaired = _repair_surface(raw_surface, background, ink)
    if repaired:
        notes.append(f"surface repaired to {surface} for WCAG against ink")

    if bg_repaired:
        tuned = [_repair_accent(value, background, ink) for value in (accent, accent_2, accent_3)]
        if tuned != [accent, accent_2, accent_3]:
            notes.append("accents re-tuned for the replaced background")
        accent, accent_2, accent_3 = tuned

    display, body_font, mono = FONTS[profile_id]
    notale_tokens = {
        "bg": background,
        "surface": surface,
        "ink": ink,
        "muted": str(raw.get("muted") or "").strip(),
        "accent": accent,
        "accent-2": accent_2,
        "accent-3": accent_3,
        "line": str(raw.get("line") or "").strip(),
        "font-display": display,
        "font-body": body_font,
        "font-mono": mono,
    }

    meta = FAMILIES[family]
    essay = _profile_essay(family, profile_id)
    label = profile_id.replace("-", " ").title()
    skill_body = (
        f"{family_body}\n\n## Assigned direction: {label}\n\n"
        f"{essay or description}\n{CANVAS_CONTRACT}"
    ).strip()

    pack: Dict[str, Any] = {
        "id": profile_id,
        "label": label,
        "version": "0.1.0",
        "status": "published",
        "provenance": "preset",
        "audience_hint": meta["audience_hint"],
        "identity": {
            "style_tokens": notale_to_deckbase(notale_tokens),
            "notale_tokens": notale_tokens,
            "radius_scale": RADIUS[profile_id],
            "type_hints": f"display={display}; body={body_font}; mono={mono}",
        },
        "skill_body": skill_body,
        "compositions": meta["compositions"],
        "chrome_rules": {
            "dialect": description or label,
            "forbidden_effects": [
                "glassmorphism",
                "generic_card_grid",
                "decorative_gradient_blobs",
            ],
            "notes": f"Migrated from skills/{family}/profiles.yaml.",
        },
        "role_exemplars": {"cover": [], "section": [], "content": [], "closing": []},
        "density_default": meta["density_default"],
        "prompt_compile": {
            "style_prose": description or label,
            "style_anchor": f"[style anchor] {label}: {description or label}",
        },
        "hard_negatives": [
            "dashboard chrome",
            "equal feature grid",
            "decoration without narrative purpose",
        ],
        "acceptance_hooks": ["identity_palette", "composition_respected", "token_only_colors"],
        "confidence": 1.0,
        "notes": "; ".join(notes),
        "lineage": {"parent_preset_id": "", "legacy_profile_key": f"{family}/{profile_id}"},
        "extractors": {},
        "or_hints": {"aspect_ratio": "16:9", "exemplars_optional": True},
        "layout_policy": {"default_family": meta["layout_family"], "by_page_role": {}},
        "mascot_policy": {
            "mode": "none",
            "assets": [],
            "max_area_ratio": 0.12,
            "roles_allowed": ["cover", "content"],
        },
        "info_form_bias": meta["info_form_bias"],
    }
    return pack, notes


def build_default_pack() -> Dict[str, Any]:
    """A neutral pack matching web/runtime/global.css, used as the registry default."""
    notale_tokens = {
        "bg": "#0B0E14",
        "surface": "#141923",
        "ink": "#F3F5F7",
        "muted": "#9BA6B5",
        "accent": "#69A8FF",
        "accent-2": "#F0B429",
        "accent-3": "#5FBF9A",
        "line": "#2A303C",
        "font-display": "inter",
        "font-body": "noto-sans-sc",
        "font-mono": "jetbrains-mono",
    }
    body = (
        "# Notale Default\n\n"
        "A neutral, information-first direction with no strong house voice. Use it as a "
        "safe parent when forking a new pack, or when a run must not assert a style of "
        "its own.\n\n"
        "- Keep the palette quiet: one accent carries meaning, the other two stay rare.\n"
        "- Build hierarchy from scale and alignment rather than from borders and fills.\n"
        "- Prefer one dominant carrier per page over a grid of equal panels."
        f"\n{CANVAS_CONTRACT}"
    ).strip()
    return {
        "id": "notale-default",
        "label": "Notale Default",
        "version": "0.1.0",
        "status": "published",
        "provenance": "preset",
        "audience_hint": "general",
        "identity": {
            "style_tokens": notale_to_deckbase(notale_tokens),
            "notale_tokens": notale_tokens,
            "radius_scale": "soft",
            "type_hints": "display=inter; body=noto-sans-sc; mono=jetbrains-mono",
        },
        "skill_body": body,
        "compositions": KEYNOTE_COMPOSITIONS,
        "chrome_rules": {
            "dialect": "Neutral information-first surfaces with restrained separation.",
            "forbidden_effects": ["glassmorphism", "decorative_gradient_blobs"],
            "notes": "Registry default and safe fork parent.",
        },
        "role_exemplars": {"cover": [], "section": [], "content": [], "closing": []},
        "density_default": "reference",
        "prompt_compile": {
            "style_prose": "Neutral information-first direction with a quiet palette and structural hierarchy.",
            "style_anchor": "[style anchor] Notale Default: quiet neutral surfaces, one meaningful accent, structure over ornament.",
        },
        "hard_negatives": ["dashboard chrome", "decoration without purpose"],
        "acceptance_hooks": ["identity_palette", "composition_respected", "token_only_colors"],
        "confidence": 1.0,
        "notes": "Neutral baseline matching web/runtime/global.css defaults.",
        "lineage": {"parent_preset_id": "", "legacy_profile_key": ""},
        "extractors": {},
        "or_hints": {"aspect_ratio": "16:9", "exemplars_optional": True},
        "layout_policy": {"default_family": "full_width_material", "by_page_role": {}},
        "mascot_policy": {
            "mode": "none",
            "assets": [],
            "max_area_ratio": 0.12,
            "roles_allowed": ["cover", "content"],
        },
        "info_form_bias": {"prefer": ["short_bullets"], "avoid": ["dashboard"]},
    }


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    packs: List[Dict[str, Any]] = [build_default_pack()]
    for family in FAMILIES:
        profiles_path = SKILLS_ROOT / family / "profiles.yaml"
        if not profiles_path.is_file():
            print(f"skip missing {profiles_path}", file=sys.stderr)
            continue
        family_body = _parse_skill_body(SKILLS_ROOT / family / "SKILL.md")
        profiles = (yaml.safe_load(profiles_path.read_text(encoding="utf-8")) or {}).get(
            "profiles"
        ) or {}
        for profile_id, profile in profiles.items():
            if profile_id not in FONTS:
                print(f"skip unmapped profile {profile_id}", file=sys.stderr)
                continue
            pack, notes = build_pack(family, profile_id, profile, family_body)
            packs.append(pack)
            print(f"{profile_id:24} {'; '.join(notes)}")

    failed = 0
    for pack in packs:
        errors = validate_pack_dict(pack, pack_dir=None)
        if errors:
            failed += 1
            print(f"FAIL {pack['id']}", file=sys.stderr)
            for error in errors:
                print(f"     - {error}", file=sys.stderr)
    if failed:
        print(f"\n{failed} pack(s) invalid; nothing written", file=sys.stderr)
        return 1

    if args.dry_run:
        print(f"\ndry run: {len(packs)} pack(s) valid")
        return 0

    root = preset_packs_root()
    for pack in packs:
        directory = root / pack["id"]
        (directory / "exemplars").mkdir(parents=True, exist_ok=True)
        # Rendered specimens are expensive and are not derived from profiles.yaml,
        # so a re-run keeps whatever is already on disk instead of wiping it.
        existing = json.loads((directory / "pack.json").read_text(encoding="utf-8")) if (
            directory / "pack.json"
        ).is_file() else {}
        for role, relatives in (existing.get("role_exemplars") or {}).items():
            kept = [rel for rel in relatives if (directory / rel).is_file()]
            if kept:
                pack["role_exemplars"][role] = kept
        (directory / "pack.json").write_text(
            json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    registry = {
        "_note": "Official StylePack registry. User packs live under styles/packs/user/.",
        "schema": "schema/style_pack.schema.json",
        "default_pack_id": "notale-default",
        "packs": [
            {
                "id": pack["id"],
                "path": f"presets/{pack['id']}/pack.json",
                "status": pack["status"],
                "aliases": ["default"] if pack["id"] == "notale-default" else [],
            }
            for pack in packs
        ],
    }
    registry_path().parent.mkdir(parents=True, exist_ok=True)
    registry_path().write_text(
        json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"\nwrote {len(packs)} pack(s) -> {root}")
    print(f"wrote registry -> {registry_path()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
