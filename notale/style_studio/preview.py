"""Render a pack, check it, and promote it on success.

deckbase gates this behind a spend confirmation because previewing costs image
generations. notale renders locally in a headless browser, so preview is free
and can be run on every build.

The checks are deliberately mechanical — contrast, token coverage, font
resolution, exemplars on disk. Whether a style is *good* is not decidable here;
whether it is *broken* is.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Union

from notale.core.models import TypeRole
from notale.style_studio.build.service import mark_preview_ok, pack_exists
from notale.style_studio.compile_style import compile_style
from notale.style_studio.models import StylePack
from notale.style_studio.registry import get_pack
from notale.style_studio.schema import CONTRAST_MINIMUM, contrast_failures
from notale.utils.skill_catalog import _contrast_ratio

# Accents mark meaning, so an accent that vanishes into the ground is a defect
# even though nothing renders text in it. Warned rather than failed: a deliberate
# near-ground accent is a legitimate choice.
_ACCENT_MINIMUM = 1.6


def _accent_warnings(tokens: Dict[str, str]) -> List[str]:
    warnings: List[str] = []
    background = tokens.get("bg", "")
    for key in ("accent", "accent-2", "accent-3"):
        ratio = _contrast_ratio(tokens.get(key, ""), background)
        if ratio is not None and ratio < _ACCENT_MINIMUM:
            warnings.append(f"{key} is nearly invisible against bg ({ratio:.2f}:1)")
    return warnings


def check_pack(pack: Union[StylePack, str]) -> Dict[str, Any]:
    """Run every non-rendering check. Returns a report dict."""
    if isinstance(pack, str):
        pack = get_pack(pack)
    tokens = pack.notale_tokens()
    bundle = compile_style(pack)

    failures: List[str] = [
        f"insufficient text contrast: {failure} (needs {CONTRAST_MINIMUM}:1)"
        for failure in contrast_failures(tokens)
    ]
    if not bundle.body.strip():
        failures.append("skill_body is empty")
    if not bundle.compositions:
        failures.append("composition catalog is empty")

    scale = pack.type_scale()
    if scale is not None:
        title = scale.roles.get(TypeRole.TITLE)
        cell = scale.roles.get(TypeRole.CELL)
        if title and cell and title.min_px <= cell.max_px:
            failures.append(
                f"type hierarchy is not visible: title starts at {title.min_px:g}px "
                f"but cell reaches {cell.max_px:g}px"
            )

    covered = {
        page_type
        for composition in bundle.compositions
        for page_type in composition.page_types
    }
    from notale.core.models import PageType

    uncovered = sorted(item.value for item in PageType if item not in covered)
    if uncovered:
        failures.append(f"no composition accepts page types: {uncovered}")

    exemplars = {
        role: pack.role_exemplar_relpaths(role)
        for role in ("cover", "section", "content", "closing")
    }
    missing = [
        f"{role}:{rel}"
        for role, rels in exemplars.items()
        for rel in rels
        if not (pack.pack_dir / rel).is_file()
    ]
    if missing:
        failures.append(f"exemplar files missing: {missing}")

    return {
        "pack_id": pack.id,
        "version": pack.version,
        "status": pack.status,
        "ok": not failures,
        "failures": failures,
        "warnings": _accent_warnings(tokens),
        "has_exemplars": pack.has_exemplars(),
        "compositions": [item.id for item in bundle.compositions],
        "page_types_covered": sorted(covered),
        "tokens": tokens,
    }


def run_preview(
    pack_id: str,
    *,
    promote: bool = True,
    render: bool = True,
) -> Dict[str, Any]:
    """Check a pack, render its specimens, and promote a passing draft."""
    pack = get_pack(pack_id)
    report = check_pack(pack)

    if render and report["ok"]:
        try:
            from notale.style_studio.exemplars import render_pack_exemplars

            report["rendered"] = render_pack_exemplars(pack)
        except Exception as exc:  # noqa: BLE001 — a missing browser must not fail QA
            report["render_error"] = f"{type(exc).__name__}: {exc}"

    if promote and report["ok"] and pack.status == "draft" and pack_exists(pack_id):
        mark_preview_ok(pack_id)
        report["status"] = "preview_ok"
        report["promoted"] = True

    directory = pack.pack_dir
    (directory / "preview_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return report
