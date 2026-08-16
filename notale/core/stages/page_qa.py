"""Judge a rendered page from its measurements. No browser, no model.

deckbase's `sandbox_imagegen/soft_style_qa.py` had five checks that could only be
a human checkbox — "is the chrome family recognizable", "did text leak in from
the reference image", "is the mascot covering the title" — because its artifact
was a raster it had to eyeball. Its own roadmap files that automation as an
unfinished phase.

With a DOM those become decidable, so this module is the automated successor.
The report shape is kept: a flat list of `(check_id, status, detail)` with a
`pending` status, because the honest answer is often "I could not measure this",
and conflating that with "passed" is how a QA layer starts lying.

Two rules keep it honest:

* A check whose input is missing reports `pending`, never `pass`.
* A check that depends on an *inferred* type role reports `pending`, never
  `fail` — the page never claimed that role, so it cannot be held to it.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Literal, Mapping, Sequence

from notale.utils.skill_catalog import _contrast_ratio

CheckStatus = Literal["pass", "fail", "pending"]
Severity = Literal["critical", "major", "minor"]

# WCAG AA: 4.5:1 for body text, 3.0:1 for large text (>=24px, or >=18.66px bold).
CONTRAST_MINIMUM = 4.5
CONTRAST_MINIMUM_LARGE = 3.0
LARGE_TEXT_PX = 24.0
LARGE_BOLD_PX = 18.66
# Two decorations overlapping a text rect by more than this read as a collision.
OVERLAP_MAX_IOU = 0.15
# A computed line-height may drift this far from the declared ratio before it
# counts as ignoring the scale (sub-pixel rounding alone moves it ~1%).
LINE_HEIGHT_TOLERANCE = 0.10

_RGB = re.compile(r"rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)(?:[,\s/]+([0-9.]+))?\s*\)")


@dataclass(frozen=True)
class QaCheck:
    check_id: str
    status: CheckStatus
    detail: str
    severity: Severity = "major"
    element: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _rgb(value: str) -> tuple[int, int, int, float] | None:
    match = _RGB.fullmatch(str(value).strip())
    if match is None:
        return None
    r, g, b = (int(round(float(match.group(i)))) for i in (1, 2, 3))
    alpha = float(match.group(4)) if match.group(4) is not None else 1.0
    return r, g, b, alpha


def _hex(value: str) -> str | None:
    """Normalize any colour notation to #RRGGBB uppercase.

    Both sides of the palette comparison must land in the same notation: pack
    tokens are authored as lowercase hex while the browser reports computed
    colours as rgb(), so without normalizing here every accent in every pack
    reads as a stray colour.
    """
    rgb = _rgb(value)
    if rgb is not None:
        return "#{:02X}{:02X}{:02X}".format(*rgb[:3])
    text = str(value).strip()
    if not text.startswith("#"):
        return None
    digits = text[1:]
    if len(digits) == 3:
        digits = "".join(char * 2 for char in digits)
    if len(digits) == 8:  # #RRGGBBAA -> drop alpha, as the rgba() branch does
        digits = digits[:6]
    if len(digits) != 6:
        return None
    try:
        int(digits, 16)
    except ValueError:
        return None
    return "#" + digits.upper()


def _luminance_to_hex(luminance: float) -> str:
    """A grey of equivalent relative luminance, for contrast maths on a ground."""
    channel = luminance ** (1 / 2.4) if luminance > 0.0031308 else luminance * 12.92
    value = max(0, min(255, round((channel * 1.055 - 0.055 if luminance > 0.0031308 else channel) * 255)))
    return "#{0:02X}{0:02X}{0:02X}".format(value)


def _required_ratio(font_size_px: float, weight: float) -> float:
    if font_size_px >= LARGE_TEXT_PX or (weight >= 700 and font_size_px >= LARGE_BOLD_PX):
        return CONTRAST_MINIMUM_LARGE
    return CONTRAST_MINIMUM


def _iou(a: Mapping[str, float], b: Mapping[str, float]) -> float:
    ax2, ay2 = a["x"] + a["w"], a["y"] + a["h"]
    bx2, by2 = b["x"] + b["w"], b["y"] + b["h"]
    ix = max(0.0, min(ax2, bx2) - max(a["x"], b["x"]))
    iy = max(0.0, min(ay2, by2) - max(a["y"], b["y"]))
    intersection = ix * iy
    if intersection <= 0:
        return 0.0
    union = a["w"] * a["h"] + b["w"] * b["h"] - intersection
    return intersection / union if union > 0 else 0.0


def _pick_ink(ground_hex: str, wanted: str, palette: Mapping[str, str]) -> tuple[str, float]:
    """Port of deckbase `plate/pack.py:_pick_ink`, scored by WCAG ratio.

    deckbase compared max-channel delta against a fixed 60, which passes pure red
    on pure green (delta 255, actual ratio 1.0:1). Same decision structure —
    keep the wanted ink if it reads, else take the best alternative — but scored
    with the contrast ratio the rest of notale already uses.
    """
    candidates = [wanted, palette.get("ink", ""), "#FFFFFF", "#000000"]
    best, best_ratio = wanted, _contrast_ratio(ground_hex, wanted) or 0.0
    for candidate in candidates:
        if not candidate:
            continue
        ratio = _contrast_ratio(ground_hex, candidate) or 0.0
        if ratio > best_ratio:
            best, best_ratio = candidate, ratio
    return best, best_ratio


def evaluate_page_qa(
    measurements: Mapping[str, Any],
    *,
    tokens: Mapping[str, str] | None = None,
    type_scale: Mapping[str, Any] | None = None,
    source_text: str = "",
) -> list[QaCheck]:
    """Turn one page's measurements into a flat list of checks."""
    if not measurements or measurements.get("error"):
        detail = str(measurements.get("error") or "no measurement available")
        return [
            QaCheck(check_id, "pending", detail)
            for check_id in (
                "frame_overflow",
                "type_scale_conformance",
                "palette_conformance",
                "backplate_contrast",
                "bbox_overlap",
                "rendered_text_matches_source",
            )
        ]

    tokens = dict(tokens or {})
    elements = list(measurements.get("elements") or [])
    checks: list[QaCheck] = []

    checks.extend(_check_overflow(measurements))
    checks.extend(_check_type_scale(elements, type_scale or {}))
    checks.extend(_check_palette(measurements, tokens))
    checks.extend(_check_backplate_contrast(measurements, elements, tokens))
    checks.extend(_check_overlap(measurements, elements))
    checks.extend(_check_text(measurements, source_text))
    return checks


def _check_overflow(measurements: Mapping[str, Any]) -> list[QaCheck]:
    """Split text overflow from decoration overflow.

    Text outside the frame or cut by its container is unreadable, full stop —
    that is `frame_overflow`, and it is the one check hard enough to gate on. A
    purely decorative element bleeding past the edge is a normal idiom, so it is
    reported separately and left to judgement.
    """
    overflow = list(measurements.get("overflow") or [])
    if not overflow:
        return [
            QaCheck("frame_overflow", "pass", "no text escapes or is clipped", "critical"),
            QaCheck("decoration_overflow", "pass", "nothing bleeds unexpectedly", "minor"),
        ]

    out: list[QaCheck] = []
    text_items = [item for item in overflow if str(item.get("text") or "").strip()]
    decoration_items = [item for item in overflow if not str(item.get("text") or "").strip()]

    for item in text_items[:8]:
        reason = (
            "escapes the 1280x720 frame"
            if item.get("reason") == "escapes-frame"
            else "is clipped by its container"
        )
        out.append(
            QaCheck(
                "frame_overflow",
                "fail",
                f"text in <{item.get('tag')}> {reason}: {str(item.get('text') or '')[:60]!r}",
                "critical",
                str(item.get("tag") or ""),
            )
        )
    if not text_items:
        out.append(QaCheck("frame_overflow", "pass", "no text escapes or is clipped", "critical"))

    for item in decoration_items[:4]:
        out.append(
            QaCheck(
                "decoration_overflow",
                "fail",
                f"<{item.get('tag')}> extends past the frame; intentional bleed is fine, "
                "an accident is not",
                "minor",
                str(item.get("tag") or ""),
            )
        )
    if not decoration_items:
        out.append(QaCheck("decoration_overflow", "pass", "nothing bleeds unexpectedly", "minor"))
    return out


def _check_type_scale(
    elements: Sequence[Mapping[str, Any]], scale: Mapping[str, Any]
) -> list[QaCheck]:
    roles = dict((scale or {}).get("roles") or {})
    if not roles:
        return [QaCheck("type_scale_conformance", "pending", "pack declares no type scale")]

    out: list[QaCheck] = []
    for element in elements:
        role = str(element.get("role") or "")
        spec = roles.get(role)
        if not role or not spec:
            continue
        # An inferred role was never claimed by the page, so a mismatch is not
        # evidence of a defect -- only of our guess.
        inferred = element.get("role_source") != "declared"
        size = float(element.get("font_size_px") or 0)
        minimum, maximum = float(spec.get("min_px", 0)), float(spec.get("max_px", 0))
        label = f"<{element.get('tag')}> {str(element.get('text') or '')[:40]!r}"
        if minimum and maximum and not (minimum - 0.5 <= size <= maximum + 0.5):
            out.append(
                QaCheck(
                    "type_scale_conformance",
                    "pending" if inferred else "fail",
                    f"{label} is {size:.0f}px; role {role!r} allows {minimum:.0f}-{maximum:.0f}px"
                    + (" (role inferred, not declared)" if inferred else ""),
                    "major",
                    str(element.get("id") or ""),
                )
            )
            continue
        declared_lh = float(spec.get("line_height", 0) or 0)
        actual_lh = float(element.get("line_height_px") or 0)
        if declared_lh and size and actual_lh:
            ratio = actual_lh / size
            if abs(ratio - declared_lh) / declared_lh > LINE_HEIGHT_TOLERANCE:
                out.append(
                    QaCheck(
                        "type_scale_conformance",
                        "pending" if inferred else "fail",
                        f"{label} line-height {ratio:.2f} differs from {declared_lh:.2f} for {role!r}"
                        + (" (role inferred, not declared)" if inferred else ""),
                        "minor",
                        str(element.get("id") or ""),
                    )
                )
    if not out:
        return [QaCheck("type_scale_conformance", "pass", "every declared role is in band")]
    return out


def _check_palette(
    measurements: Mapping[str, Any], tokens: Mapping[str, str]
) -> list[QaCheck]:
    allowed = {
        _hex(value)
        for key, value in tokens.items()
        if not key.startswith("font-") and _hex(value)
    }
    if not allowed:
        return [QaCheck("palette_conformance", "pending", "no palette supplied")]
    strays: list[str] = []
    for raw, count in (measurements.get("palette") or {}).items():
        rgb = _rgb(raw)
        if rgb is None or rgb[3] == 0:
            continue
        value = _hex(raw)
        if value and value not in allowed:
            strays.append(f"{value}x{count}")
    if not strays:
        return [QaCheck("palette_conformance", "pass", "every computed colour is a pack token")]
    return [
        QaCheck(
            "palette_conformance",
            "fail",
            "colours outside the pack palette: " + ", ".join(sorted(strays)[:8]),
            "major",
        )
    ]


def _check_backplate_contrast(
    measurements: Mapping[str, Any],
    elements: Sequence[Mapping[str, Any]],
    tokens: Mapping[str, str],
) -> list[QaCheck]:
    backplate = measurements.get("backplate")
    if not backplate:
        return [QaCheck("backplate_contrast", "pending", "page has no backplate")]
    if backplate.get("error"):
        return [
            QaCheck(
                "backplate_contrast",
                "pending",
                f"backplate pixels unreadable: {backplate['error']}",
            )
        ]

    out: list[QaCheck] = []
    for element in elements:
        ground = element.get("ground") or {}
        if not ground:
            continue
        ground_hex = str(ground.get("fill") or "") or _luminance_to_hex(
            float(ground.get("luminance") or 0)
        )
        ink = _hex(str(element.get("color") or "")) or ""
        if not ink:
            continue
        ratio = _contrast_ratio(ground_hex, ink)
        if ratio is None:
            continue
        needed = _required_ratio(
            float(element.get("font_size_px") or 0), float(element.get("font_weight") or 400)
        )
        if ratio >= needed:
            continue
        best, best_ratio = _pick_ink(ground_hex, ink, tokens)
        advice = (
            f"; {best} would read at {best_ratio:.1f}:1"
            if best.upper() != ink.upper() and best_ratio > ratio
            else ""
        )
        out.append(
            QaCheck(
                "backplate_contrast",
                "fail",
                f"<{element.get('tag')}> {ink} on backplate {ground_hex} is {ratio:.2f}:1, "
                f"needs {needed:.1f}:1{advice}",
                "critical",
                str(element.get("id") or ""),
            )
        )
    if not out:
        return [QaCheck("backplate_contrast", "pass", "all text reads against the backplate")]
    return out


def _check_overlap(
    measurements: Mapping[str, Any], elements: Sequence[Mapping[str, Any]]
) -> list[QaCheck]:
    decorations = list(measurements.get("decorations") or [])
    if not decorations or not elements:
        return [QaCheck("bbox_overlap", "pending", "no decoration/text pair to compare")]
    out: list[QaCheck] = []
    for decoration in decorations:
        for element in elements:
            rect_a, rect_b = decoration.get("rect"), element.get("rect")
            if not rect_a or not rect_b:
                continue
            overlap = _iou(rect_a, rect_b)
            if overlap > OVERLAP_MAX_IOU:
                out.append(
                    QaCheck(
                        "bbox_overlap",
                        "fail",
                        f"<{decoration.get('tag')}> covers <{element.get('tag')}> "
                        f"({overlap:.0%} of their union)",
                        "major",
                        str(element.get("id") or ""),
                    )
                )
    if not out:
        return [QaCheck("bbox_overlap", "pass", "no decoration covers text")]
    return out[:6]


def _check_text(measurements: Mapping[str, Any], source_text: str) -> list[QaCheck]:
    """Does what rendered match what the source said? Not a contract check.

    deckbase's `page_text_only` asked whether the copy came only from the page
    contract, which is a semantic judgement. This is the automatable subset:
    it catches script-injected copy and missing-glyph tofu. Contract adherence
    stays with the inspector, which is the right instrument for it.
    """
    if not source_text.strip():
        return [QaCheck("rendered_text_matches_source", "pending", "no source text supplied")]
    rendered = " ".join(str(measurements.get("text") or "").split())
    expected = " ".join(source_text.split())
    if not rendered:
        return [
            QaCheck("rendered_text_matches_source", "fail", "page rendered no text at all", "critical")
        ]
    if "�" in rendered:
        return [
            QaCheck("rendered_text_matches_source", "fail", "rendered text contains replacement characters", "major")
        ]
    extra = set(rendered.split()) - set(expected.split())
    if extra:
        return [
            QaCheck(
                "rendered_text_matches_source",
                "fail",
                "rendered text not present in the source fragment: "
                + ", ".join(sorted(extra)[:8]),
                "minor",
            )
        ]
    return [QaCheck("rendered_text_matches_source", "pass", "rendered text comes from the source")]


def summarize(checks: Sequence[QaCheck]) -> dict[str, int]:
    out = {"pass": 0, "fail": 0, "pending": 0}
    for check in checks:
        out[check.status] += 1
    return out


# The only measurement decisive enough to stop a page before the inspector sees
# it. Everything else advises: the inspector can see the composited render and is
# the better judge of a deliberate choice that merely looks wrong to a threshold.
GATING_CHECKS = frozenset({"frame_overflow"})


def gating_failures(checks: Sequence[QaCheck]) -> list[QaCheck]:
    return [
        check
        for check in checks
        if check.status == "fail" and check.check_id in GATING_CHECKS
    ]


def qa_prompt_block(checks: Sequence[QaCheck]) -> str:
    """Render failures for the inspector. Passes and pendings are not its problem."""
    failures = [check for check in checks if check.status == "fail"]
    if not failures:
        return ""
    lines = [
        "Measured defects from the rendered page (these are facts from the DOM, "
        "not opinions -- fix them unless the measurement is clearly wrong):"
    ]
    for check in failures[:12]:
        lines.append(f"- [{check.severity}] {check.check_id}: {check.detail}")
    return "\n".join(lines)


def write_qa_report(run_dir: Path, page: int, checks: Sequence[QaCheck]) -> Path:
    path = Path(run_dir) / "inspections" / f"p{page}-qa.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {"page": page, "summary": summarize(checks), "checks": [c.to_dict() for c in checks]},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return path
