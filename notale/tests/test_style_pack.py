"""StylePack registry, schema, compile, materialize, and the token bridge."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from notale.core.models import DesignSkillRef, PageType
from notale.style_studio.compile_style import compile_style, effective_hard_negatives
from notale.style_studio.materialize import materialize_to_run
from notale.style_studio.preview import check_pack
from notale.style_studio.registry import (
    get_pack,
    list_packs,
    pack_exists,
    resolve_alias,
    validate_all_packs,
)
from notale.style_studio.schema import (
    contrast_failures,
    deep_merge,
    validate_notale_tokens,
    validate_pack_dict,
)
from notale.style_studio.tokens_bridge import (
    deckbase_to_notale,
    notale_to_deckbase,
    prefers_dark,
)
from notale.utils.skill_catalog import load_generated_style


def test_every_registered_pack_validates():
    results = validate_all_packs()
    assert results, "expected at least one pack"
    for pack_id, errors in results:
        assert not errors, f"{pack_id}: {errors}"


def test_registry_ships_the_migrated_profile_library():
    ids = {entry["id"] for entry in list_packs()}
    # 12 narrative-keynote + 8 pudding profiles + the neutral default.
    assert len(ids) == 21
    assert {"swiss-modern", "paper-and-ink", "technical-world", "notale-default"} <= ids


def test_default_alias_resolves_to_the_neutral_pack():
    assert resolve_alias("") == "notale-default"
    assert resolve_alias("default") == "notale-default"
    assert resolve_alias("swiss-modern") == "swiss-modern"
    # Unknown names pass through so get_pack can fail with a clear message.
    assert resolve_alias("not-a-pack") == "not-a-pack"
    assert not pack_exists("not-a-pack")


def test_unknown_pack_raises_rather_than_falling_back():
    with pytest.raises(KeyError, match="unknown StylePack"):
        get_pack("not-a-pack")


def test_pack_exposes_both_palettes_and_they_agree():
    pack = get_pack("swiss-modern")
    tokens = pack.notale_tokens()
    assert set(tokens) == {
        "bg", "surface", "ink", "muted", "accent", "accent-2", "accent-3",
        "line", "font-display", "font-body", "font-mono",
    }
    palette = pack.style_tokens()
    assert palette["background"] == tokens["bg"]
    assert palette["text"] == tokens["ink"]
    assert palette["primary"] == tokens["accent"]


def test_deckbase_fields_survive_for_interchange():
    """Fields notale does not render still have to round-trip to deckbase."""
    pack = get_pack("notale-default")
    assert pack.mascot_policy()["mode"] == "none"
    assert pack.or_hints()["aspect_ratio"] == "16:9"
    assert pack.prompt_compile()["style_anchor"].startswith("[style anchor]")
    assert pack.chrome_rules()["dialect"]
    assert pack.layout_policy()["default_family"] == "full_width_material"
    assert pack.density_default == "reference"
    assert pack.audience_hint == "general"


def test_token_bridge_round_trips_the_five_shared_roles():
    original = get_pack("paper-and-ink").notale_tokens()
    palette = notale_to_deckbase(original)
    projected = deckbase_to_notale(palette, include_fonts=False)
    for key in ("bg", "ink", "accent", "accent-2", "accent-3"):
        assert projected[key] == original[key]


def test_bridge_derives_a_renderable_block_from_a_bare_palette():
    projected = deckbase_to_notale({"background": "#0B0E14", "text": "#F3F5F7"})
    assert projected["bg"] == "#0B0E14"
    assert set(projected) >= {"bg", "ink", "surface", "muted", "line"}
    assert not contrast_failures(projected)


def test_bridge_omits_fonts_when_the_source_said_nothing_about_them():
    palette = {"background": "#FFFFFF", "text": "#000000"}
    assert "font-body" in deckbase_to_notale(palette)
    assert "font-body" not in deckbase_to_notale(palette, include_fonts=False)


def test_bridge_only_trusts_window_when_text_is_readable_on_it():
    """A window inherited from a pack of the opposite polarity is not a surface."""
    light = {"background": "#F7FAFC", "text": "#1A202C", "window": "#141923"}
    assert deckbase_to_notale(light, include_fonts=False)["surface"] != "#141923"
    assert not contrast_failures(deckbase_to_notale(light))

    consistent = {"background": "#F7FAFC", "text": "#1A202C", "window": "#FFFFFF"}
    assert deckbase_to_notale(consistent, include_fonts=False)["surface"] == "#FFFFFF"


def test_prefers_dark_reads_the_ground_not_the_ink():
    assert prefers_dark({"bg": "#0B0E14", "ink": "#F3F5F7"})
    assert not prefers_dark({"bg": "#FFFFFF", "ink": "#000000"})


@pytest.mark.parametrize(
    "override,expected",
    [
        ({"bg": "#111111", "ink": "#222222"}, "insufficient contrast"),
        ({"font-body": "smiley-sans"}, "not available for role body"),
        ({"font-mono": "no-such-font"}, "unknown font-mono"),
        ({"accent": "red; }"}, "unsafe values"),
    ],
)
def test_token_validation_rejects_broken_blocks(override, expected):
    tokens = {**get_pack("swiss-modern").notale_tokens(), **override}
    errors = "\n".join(validate_notale_tokens(tokens))
    assert expected in errors


def test_token_validation_rejects_unknown_and_missing_keys():
    tokens = get_pack("swiss-modern").notale_tokens()
    assert "missing" in "\n".join(validate_notale_tokens({k: v for k, v in tokens.items() if k != "bg"}))
    assert "unknown" in "\n".join(validate_notale_tokens({**tokens, "shadow": "none"}))


def test_contrast_is_measured_only_where_it_can_be():
    assert contrast_failures({"bg": "#000000", "ink": "#FFFFFF", "surface": "#111111"}) == []
    assert contrast_failures({"bg": "#111111", "ink": "#222222", "surface": "#111111"})
    # A non-hex value is skipped rather than guessed at: only surface is checked here.
    assert contrast_failures({"bg": "var(--x)", "ink": "#FFFFFF", "surface": "#111111"}) == []
    assert contrast_failures({"bg": "var(--x)", "ink": "#222222", "surface": "#111111"}) == [
        "surface/ink=1.19:1"
    ]


def test_schema_validation_reports_every_problem_at_once():
    data = json.loads((get_pack("swiss-modern").pack_dir / "pack.json").read_text())
    data["status"] = "nonsense"
    data["version"] = "1.0"
    del data["identity"]["notale_tokens"]
    errors = validate_pack_dict(data)
    assert any("status must be one of" in error for error in errors)
    assert any("version must look like" in error for error in errors)
    assert any("notale_tokens" in error for error in errors)


def test_schema_validation_can_skip_contrast_for_the_fallback_path():
    data = json.loads((get_pack("swiss-modern").pack_dir / "pack.json").read_text())
    data["identity"]["notale_tokens"].update({"bg": "#111111", "ink": "#222222"})
    assert any("contrast" in e for e in validate_pack_dict(data))
    assert not any("contrast" in e for e in validate_pack_dict(data, check_contrast=False))


def test_deep_merge_replaces_lists_and_recurses_into_objects():
    merged = deep_merge(
        {"a": {"b": 1, "c": 2}, "list": [1, 2, 3]},
        {"a": {"c": 9}, "list": [4]},
    )
    assert merged == {"a": {"b": 1, "c": 9}, "list": [4]}


def test_compile_unions_hard_negatives_with_forbidden_effects():
    pack = get_pack("technical-world")
    forbidden = effective_hard_negatives(pack)
    assert set(pack.hard_negatives()) <= set(forbidden)
    assert set(pack.chrome_rules()["forbidden_effects"]) <= set(forbidden)
    assert len(forbidden) == len(set(forbidden)), "must dedupe, order-preserving"


def test_compile_appends_the_packs_axes_to_the_skill_body():
    bundle = compile_style("technical-world")
    assert bundle.pack_id == "technical-world"
    assert "## Style axes" in bundle.body
    assert "## Never" in bundle.body
    assert "Corners: square" in bundle.body  # radius_scale=sharp
    assert bundle.body.startswith(get_pack("technical-world").skill_body()[:40])
    assert compile_style("technical-world", include_axes=False).body.count("## Style axes") == 0


def test_compile_carries_unrendered_deckbase_fields_in_meta():
    meta = compile_style("notale-default").meta
    assert meta["mascot_policy"]["mode"] == "none"
    assert meta["or_hints"]["aspect_ratio"] == "16:9"
    assert meta["style_anchor"].startswith("[style anchor]")
    assert meta["pack_id"] == "notale-default"


def test_every_preset_catalog_covers_every_page_type():
    for entry in list_packs():
        report = check_pack(entry["id"])
        assert report["ok"], f"{entry['id']}: {report['failures']}"
        assert set(report["page_types_covered"]) == {item.value for item in PageType}


def test_materialize_produces_a_skill_the_pipeline_can_reload(tmp_path: Path):
    style = materialize_to_run("paper-and-ink", tmp_path)
    reloaded = load_generated_style(
        tmp_path / "skills", DesignSkillRef(name=style.name, sha256=style.sha256)
    )
    assert reloaded.sha256 == style.sha256
    assert reloaded.tokens == get_pack("paper-and-ink").notale_tokens()
    assert [item.id for item in reloaded.compositions] == [
        item.id for item in get_pack("paper-and-ink").compositions()
    ]

    reference = json.loads((tmp_path / "style_pack_ref.json").read_text())
    assert reference["style_pack_id"] == "paper-and-ink"
    assert reference["design_skill"]["sha256"] == style.sha256


def test_materialized_specimens_are_found_as_the_inspection_baseline(tmp_path: Path):
    """The wiring from a pack's specimens to the page inspector, without a browser."""
    from types import SimpleNamespace

    from notale.tools.inspection import style_baseline_path

    materialize_to_run("swiss-modern", tmp_path)
    copied = sorted(p.name for p in (tmp_path / "style_refs").glob("*.png"))
    assert copied == ["specimen_content.png", "specimen_cover.png"]

    content_page = SimpleNamespace(
        run_dir=tmp_path, page_plan=SimpleNamespace(type="worked-example")
    )
    section_page = SimpleNamespace(
        run_dir=tmp_path, page_plan=SimpleNamespace(type="section-break")
    )
    assert style_baseline_path(content_page).name == "specimen_content.png"
    # A section break is composed like a cover, so it gets the cover specimen.
    assert style_baseline_path(section_page).name == "specimen_cover.png"


def test_no_baseline_is_offered_when_the_pack_has_no_specimens(tmp_path: Path):
    from types import SimpleNamespace

    from notale.tools.inspection import style_baseline_path

    (tmp_path / "style_refs").mkdir(parents=True)
    state = SimpleNamespace(run_dir=tmp_path, page_plan=SimpleNamespace(type="worked-example"))
    assert style_baseline_path(state) is None


def test_materialize_is_deterministic(tmp_path: Path):
    first = materialize_to_run("swiss-modern", tmp_path / "a", skills_dirname="skills")
    (tmp_path / "b").mkdir(parents=True)
    second = materialize_to_run("swiss-modern", tmp_path / "b")
    assert first.sha256 == second.sha256


def test_materialize_requires_an_existing_run_dir(tmp_path: Path):
    with pytest.raises(FileNotFoundError):
        materialize_to_run("swiss-modern", tmp_path / "missing")


@pytest.fixture(autouse=True)
def _make_run_dirs(tmp_path: Path):
    (tmp_path / "a").mkdir(parents=True, exist_ok=True)
    yield
