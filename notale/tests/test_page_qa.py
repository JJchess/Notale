"""Post-render QA judgement, exercised with hand-written measurements."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from notale.core.stages.page_qa import (
    QaCheck,
    evaluate_page_qa,
    qa_prompt_block,
    summarize,
    write_qa_report,
)

TOKENS = {
    "bg": "#FFFFFF",
    "surface": "#F2F2F2",
    "ink": "#000000",
    "muted": "#555555",
    "accent": "#FF3300",
    "accent-2": "#0057B8",
    "accent-3": "#80455C",
    "line": "#CCCCCC",
    "font-display": "inter",
    "font-body": "noto-sans-sc",
    "font-mono": "jetbrains-mono",
}

TYPE_SCALE = {
    "roles": {
        "title": {"min_px": 48, "max_px": 104, "line_height": 1.15},
        "lede": {"min_px": 17, "max_px": 24, "line_height": 1.45},
        "cell": {"min_px": 12, "max_px": 18, "line_height": 1.3},
    }
}


def element(**overrides):
    base = {
        "id": "e0",
        "tag": "h1",
        "role": "title",
        "role_source": "declared",
        "text": "标题",
        "rect": {"x": 64, "y": 64, "w": 600, "h": 100},
        "font_size_px": 88.0,
        "line_height_px": 101.2,
        "letter_spacing_px": 1.76,
        "font_weight": 700,
        "font_family": "Notale Inter",
        "color": "rgb(0, 0, 0)",
        "background_color": "rgba(0, 0, 0, 0)",
        "clipped": False,
        "ground": None,
    }
    base.update(overrides)
    return base


def measurements(**overrides):
    base = {
        "schema_version": 1,
        "frame": {"width": 1280, "height": 720},
        "elements": [element()],
        "decorations": [],
        "overflow": [],
        "palette": {"rgb(0, 0, 0)": 3, "rgb(255, 255, 255)": 1},
        "text": "标题",
        "backplate": None,
    }
    base.update(overrides)
    return base


def by_id(checks, check_id):
    return [c for c in checks if c.check_id == check_id]


def status_of(checks, check_id):
    found = by_id(checks, check_id)
    assert found, f"no {check_id} check emitted"
    return found[0].status


# ---------------------------------------------------------------- missing input


def test_absent_measurement_is_pending_never_pass():
    """The whole design rests on this: unmeasured must not read as healthy."""
    checks = evaluate_page_qa({}, tokens=TOKENS, type_scale=TYPE_SCALE)
    assert checks
    assert {c.status for c in checks} == {"pending"}


def test_measurement_error_is_pending():
    checks = evaluate_page_qa({"error": "TimeoutError: boom"}, tokens=TOKENS)
    assert {c.status for c in checks} == {"pending"}
    assert "boom" in checks[0].detail


# ---------------------------------------------------------------- overflow


def test_clean_page_passes_overflow():
    assert status_of(evaluate_page_qa(measurements(), tokens=TOKENS), "frame_overflow") == "pass"


@pytest.mark.parametrize("reason", ["escapes-frame", "clipped"])
def test_overflow_is_critical(reason):
    data = measurements(
        overflow=[{"tag": "div", "reason": reason, "text": "spilled", "rect": {"x": 0, "y": 0, "w": 1, "h": 1}}]
    )
    checks = by_id(evaluate_page_qa(data, tokens=TOKENS), "frame_overflow")
    assert checks[0].status == "fail"
    assert checks[0].severity == "critical"


# ---------------------------------------------------------------- type scale


def test_declared_role_out_of_band_fails():
    data = measurements(elements=[element(font_size_px=12.0, line_height_px=13.8)])
    checks = by_id(evaluate_page_qa(data, tokens=TOKENS, type_scale=TYPE_SCALE), "type_scale_conformance")
    assert checks[0].status == "fail"
    assert "12px" in checks[0].detail and "48" in checks[0].detail


def test_inferred_role_out_of_band_is_pending_not_fail():
    """The page never claimed the role, so it cannot be held to it."""
    data = measurements(elements=[element(font_size_px=12.0, role_source="inferred")])
    checks = by_id(evaluate_page_qa(data, tokens=TOKENS, type_scale=TYPE_SCALE), "type_scale_conformance")
    assert checks[0].status == "pending"
    assert "inferred" in checks[0].detail


def test_role_without_a_spec_is_ignored():
    data = measurements(elements=[element(role="banner", font_size_px=9.0)])
    assert status_of(
        evaluate_page_qa(data, tokens=TOKENS, type_scale=TYPE_SCALE), "type_scale_conformance"
    ) == "pass"


def test_line_height_drift_is_minor():
    data = measurements(elements=[element(line_height_px=176.0)])  # ratio 2.0 vs 1.15
    checks = by_id(evaluate_page_qa(data, tokens=TOKENS, type_scale=TYPE_SCALE), "type_scale_conformance")
    assert checks[0].status == "fail"
    assert checks[0].severity == "minor"


def test_subpixel_line_height_rounding_is_tolerated():
    data = measurements(elements=[element(line_height_px=102.0)])  # ratio 1.159
    assert status_of(
        evaluate_page_qa(data, tokens=TOKENS, type_scale=TYPE_SCALE), "type_scale_conformance"
    ) == "pass"


def test_no_type_scale_is_pending():
    assert status_of(evaluate_page_qa(measurements(), tokens=TOKENS), "type_scale_conformance") == "pending"


# ---------------------------------------------------------------- palette


def test_stray_colour_fails_palette():
    data = measurements(palette={"rgb(255, 0, 255)": 2})
    checks = by_id(evaluate_page_qa(data, tokens=TOKENS), "palette_conformance")
    assert checks[0].status == "fail"
    assert "#FF00FF" in checks[0].detail


def test_transparent_is_not_a_stray_colour():
    data = measurements(palette={"rgba(0, 0, 0, 0)": 9, "rgb(0, 0, 0)": 1})
    assert status_of(evaluate_page_qa(data, tokens=TOKENS), "palette_conformance") == "pass"


def test_font_tokens_are_not_treated_as_colours():
    assert status_of(evaluate_page_qa(measurements(), tokens=TOKENS), "palette_conformance") == "pass"


def test_lowercase_pack_hex_matches_computed_rgb():
    """Pack tokens are lowercase hex; the browser reports rgb(). They must meet."""
    lowercase = {**TOKENS, "accent": "#ff3300", "accent-2": "#0057b8"}
    data = measurements(palette={"rgb(255, 51, 0)": 3, "rgb(0, 87, 184)": 1})
    assert status_of(evaluate_page_qa(data, tokens=lowercase), "palette_conformance") == "pass"


def test_short_and_alpha_hex_tokens_normalize():
    tokens = {**TOKENS, "accent": "#f30", "line": "#00000038"}
    data = measurements(palette={"rgb(255, 51, 0)": 1, "rgba(0, 0, 0, 0.22)": 1})
    assert status_of(evaluate_page_qa(data, tokens=tokens), "palette_conformance") == "pass"


# ---------------------------------------------------------------- backplate


def test_no_backplate_is_pending():
    assert status_of(evaluate_page_qa(measurements(), tokens=TOKENS), "backplate_contrast") == "pending"


def test_tainted_backplate_is_pending():
    data = measurements(backplate={"src": "../assets/p.png", "error": "SecurityError"})
    checks = by_id(evaluate_page_qa(data, tokens=TOKENS), "backplate_contrast")
    assert checks[0].status == "pending"
    assert "SecurityError" in checks[0].detail


def test_dark_ink_on_dark_backplate_fails_with_ink_advice():
    data = measurements(
        backplate={"src": "../assets/p.png", "natural": [64, 36]},
        elements=[element(color="rgb(0, 0, 0)", ground={"luminance": 0.01, "fill": "#141820"})],
    )
    checks = by_id(evaluate_page_qa(data, tokens=TOKENS), "backplate_contrast")
    assert checks[0].status == "fail"
    assert checks[0].severity == "critical"
    assert "#FFFFFF" in checks[0].detail  # the advice
    assert ":1" in checks[0].detail


def test_light_ink_on_dark_backplate_passes():
    data = measurements(
        backplate={"src": "../assets/p.png", "natural": [64, 36]},
        elements=[element(color="rgb(255, 255, 255)", ground={"luminance": 0.01, "fill": "#141820"})],
    )
    assert status_of(evaluate_page_qa(data, tokens=TOKENS), "backplate_contrast") == "pass"


def test_large_text_uses_the_relaxed_threshold():
    """88px bold clears 3.0:1; the same colours at body size would not.

    #646464 against black is ~3.5:1 -- deliberately between the two thresholds,
    so the test can only pass if the size/weight rule is actually applied.
    """
    ground = {"luminance": 0.127, "fill": "#646464"}
    large = measurements(
        backplate={"src": "p.png"},
        elements=[element(color="rgb(0, 0, 0)", font_size_px=88.0, font_weight=700, ground=ground)],
    )
    small = measurements(
        backplate={"src": "p.png"},
        elements=[element(color="rgb(0, 0, 0)", font_size_px=14.0, font_weight=400, ground=ground)],
    )
    assert status_of(evaluate_page_qa(large, tokens=TOKENS), "backplate_contrast") == "pass"
    assert status_of(evaluate_page_qa(small, tokens=TOKENS), "backplate_contrast") == "fail"


# ---------------------------------------------------------------- overlap


def test_decoration_covering_text_fails():
    data = measurements(
        decorations=[{"tag": "img", "rect": {"x": 64, "y": 64, "w": 600, "h": 100}, "backplate": False}]
    )
    checks = by_id(evaluate_page_qa(data, tokens=TOKENS), "bbox_overlap")
    assert checks[0].status == "fail"


def test_decoration_beside_text_passes():
    data = measurements(
        decorations=[{"tag": "img", "rect": {"x": 800, "y": 400, "w": 300, "h": 200}, "backplate": False}]
    )
    assert status_of(evaluate_page_qa(data, tokens=TOKENS), "bbox_overlap") == "pass"


# ---------------------------------------------------------------- rendered text


def test_text_matching_source_passes():
    checks = evaluate_page_qa(measurements(), tokens=TOKENS, source_text="标题")
    assert status_of(checks, "rendered_text_matches_source") == "pass"


def test_injected_text_fails():
    data = measurements(text="标题 BUY NOW")
    checks = by_id(
        evaluate_page_qa(data, tokens=TOKENS, source_text="标题"),
        "rendered_text_matches_source",
    )
    assert checks[0].status == "fail"
    assert "BUY" in checks[0].detail


def test_replacement_characters_fail():
    data = measurements(text="���")
    checks = by_id(
        evaluate_page_qa(data, tokens=TOKENS, source_text="���"),
        "rendered_text_matches_source",
    )
    assert checks[0].status == "fail"


def test_empty_render_fails_critically():
    data = measurements(text="")
    checks = by_id(
        evaluate_page_qa(data, tokens=TOKENS, source_text="标题"), "rendered_text_matches_source"
    )
    assert checks[0].status == "fail"
    assert checks[0].severity == "critical"


# ---------------------------------------------------------------- reporting


def test_prompt_block_lists_only_failures():
    checks = [
        QaCheck("frame_overflow", "fail", "spilled", "critical"),
        QaCheck("palette_conformance", "pass", "fine"),
        QaCheck("backplate_contrast", "pending", "no backplate"),
    ]
    block = qa_prompt_block(checks)
    assert "frame_overflow" in block
    assert "palette_conformance" not in block
    assert "backplate_contrast" not in block


def test_prompt_block_is_empty_when_nothing_failed():
    assert qa_prompt_block([QaCheck("frame_overflow", "pass", "fine")]) == ""


def test_summary_and_report(tmp_path: Path):
    checks = evaluate_page_qa(measurements(), tokens=TOKENS, type_scale=TYPE_SCALE, source_text="标题")
    counts = summarize(checks)
    assert counts["pass"] + counts["fail"] + counts["pending"] == len(checks)

    path = write_qa_report(tmp_path, 3, checks)
    payload = json.loads(path.read_text())
    assert payload["page"] == 3
    assert payload["summary"] == counts
    assert len(payload["checks"]) == len(checks)
