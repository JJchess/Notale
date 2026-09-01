"""Workflow routing and deterministic shared guidance injection."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEGACY = ROOT / "vendor" / "skills"
WORKFLOWS = ROOT / "workflows"
PROMPTS = ROOT / "prompts"
DEFAULT = LEGACY  # Planner-only media acquisition resources.

PAGE_WORKFLOWS = (
    "build-cover",
    "build-page",
    "build-interaction",
    "build-code",
)
ALL_WORKFLOWS = PAGE_WORKFLOWS + ("check-page",)

FONT_FLOOR = (
    "正文与成句说明 ≥16px，控件标签、图例、图注和提示 ≥14px，"
    "纯数字刻度 ≥12px，多行文字行高 ≥1.35。"
)


def available(root: Path = WORKFLOWS) -> tuple[str, ...]:
    if not root.is_dir():
        return ()
    return tuple(sorted(
        item.name for item in root.iterdir() if (item / "SKILL.md").is_file()
    ))


def _aux_sample_catalog(name: str, root: Path) -> str:
    """Build the opt-in mini-sample registry; it is absent from default context."""
    skill_dir = root / name
    catalog_path = skill_dir / "samples" / "catalog.json"
    if not catalog_path.is_file():
        return ""
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    rows = []
    for sample in catalog.get("samples", []):
        if sample.get("aux") is False or not isinstance(sample.get("mini"), dict):
            continue
        path = (
            skill_dir / "samples" / "bundles" / sample["category"]
            / f"{sample['id']}.mini.md"
        ).resolve()
        if not path.is_file():
            raise FileNotFoundError(f"registered auxiliary sample is missing: {path}")
        rows.append((sample["category"], sample["id"], path))
    if not rows:
        return ""
    lines = [
        f'<aux_sample_catalog workflow="{name}">',
        "Auxiliary mode is enabled for this run. In the same first response, after "
        "choosing Main, read zero to three paths below from different sample rows in "
        "the selected category. Never choose the Main sample's id again.",
    ]
    lines.extend(f"- {category}/{sample_id}: `{path}`" for category, sample_id, path in rows)
    lines.append("</aux_sample_catalog>")
    return "\n".join(lines)


def routed_workflow(
    name: str,
    root: Path = WORKFLOWS,
    *,
    include_aux: bool = False,
) -> str:
    """Inline the one Planner-routed SKILL; references and samples stay deferred."""
    if name not in PAGE_WORKFLOWS:
        raise ValueError(f"unknown routed workflow {name!r}; expected {PAGE_WORKFLOWS}")
    path = root / name / "SKILL.md"
    if not path.is_file():
        raise FileNotFoundError(f"routed workflow is not installed: {path}")
    body = path.read_text(encoding="utf-8", errors="replace").strip()
    aux = _aux_sample_catalog(name, root) if include_aux else ""
    if aux:
        marker = "Do not read any other sample."
        if marker not in body:
            raise ValueError(f"{path} is missing the main-only sample policy")
        body = body.replace(
            marker,
            "Follow the appended `<aux_sample_catalog>` in the same first response.",
            1,
        )
    body = body.replace("<skill-dir>", str(path.parent.resolve()))
    block = (
        f'<workflow_skill name="{name}" path="{path.resolve()}">\n'
        f"{body}\n</workflow_skill>"
    )
    return block + ("\n\n" + aux if aux else "")


DIRECTION_FILE = "direction.md"
DIRECTION_MENUS_FILE = "direction-menus.md"
_MENUS_START = "## Direction families"


def direction_block(root: Path = PROMPTS, menus: bool = False) -> str:
    """Load the Planner's visual-direction source verbatim."""
    parts = []
    for name in [DIRECTION_FILE] + ([DIRECTION_MENUS_FILE] if menus else []):
        path = root / name
        if not path.is_file():
            raise FileNotFoundError(f"direction_block requires {path}")
        text = path.read_text(encoding="utf-8")
        if name == DIRECTION_MENUS_FILE:
            if _MENUS_START not in text:
                raise ValueError(f"{path} is missing {_MENUS_START!r}")
            text = _MENUS_START + text.split(_MENUS_START, 1)[1]
        parts.append(f'<direction src="{name}">\n{text.strip()}\n</direction>')
    return "\n\n".join(parts)


ANTI_SLOP_FILES = (
    ("anti_ai_slop_copy", "scrub-copy-slop.md"),
    ("anti_ai_slop_visual", "scrub-visual-slop.md"),
)
THEME_SLOP_FILE = ("anti_ai_slop_theme", "scrub-theme-slop.md")


def _source_block(root: Path, sources: tuple[tuple[str, str], ...]) -> str:
    parts = []
    for tag, name in sources:
        path = root / name
        if not path.is_file():
            raise FileNotFoundError(f"guidance source is missing: {path}")
        text = path.read_text(encoding="utf-8", errors="replace").strip()
        parts.append(f"<{tag}>\n{text}\n</{tag}>")
    return "\n\n".join(parts)


def anti_slop_block(root: Path = WORKFLOWS) -> str:
    """Copy and visual guidance belongs to every Builder page."""
    return _source_block(root, ANTI_SLOP_FILES)


def theme_slop_block(root: Path = WORKFLOWS) -> str:
    """Theme guidance belongs only to the Planner's shared-theme decision."""
    return _source_block(root, (THEME_SLOP_FILE,))
