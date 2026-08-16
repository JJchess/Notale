"""StyleBuild: fork, priority fill, extractors, lifecycle, and reporting."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from notale.core.models import StyleOutput
from notale.style_studio.build.defaults_fill import fill_defaults
from notale.style_studio.build.fork import fork_pack
from notale.style_studio.build.from_text import extract_from_text
from notale.style_studio.build.from_topic import extract_from_topic, resolve_pack_id
from notale.style_studio.build.models import MergeReport
from notale.style_studio.build.registry_user import (
    list_user_pack_ids,
    remove_user_pack,
    user_pack_dir,
)
from notale.style_studio.build.service import (
    apply_patch,
    ensure_user_draft,
    from_text,
    mark_preview_ok,
    merge_json,
    pack_exists,
    publish_pack,
)
from notale.style_studio.registry import get_pack, list_packs
from notale.tests.fake_llm import _default_style


def _report(pack_id: str) -> dict:
    return json.loads((user_pack_dir(pack_id) / "merge_report.json").read_text())


def _field(pack_id: str, path: str) -> dict:
    entry = next(f for f in _report(pack_id)["fields"] if f["path"] == path)
    return entry


# ---------------------------------------------------------------- fork


def test_fork_deep_copies_the_parent_and_records_lineage():
    fork_pack("swiss-modern", "forked-pack")
    forked = get_pack("forked-pack")
    parent = get_pack("swiss-modern")

    assert forked.parent_id == "swiss-modern"
    assert forked.status == "draft"
    assert forked.provenance == "hybrid"
    assert forked.notale_tokens() == parent.notale_tokens()
    assert forked.skill_body() == parent.skill_body()
    assert [c.id for c in forked.compositions()] == [c.id for c in parent.compositions()]
    assert "forked from swiss-modern" in " ".join(_report("forked-pack")["notes"])


def test_fork_drops_the_parents_rendered_specimens():
    """A specimen is only true of the palette that rendered it.

    Inheriting one means a repaletted fork ships a baseline that contradicts its
    own tokens, and page inspection is then measured against the wrong style.
    """
    parent = get_pack("swiss-modern")
    assert parent.has_exemplars(), "preset should ship specimens for this to be meaningful"

    fork_pack("swiss-modern", "no-inherit")
    forked = get_pack("no-inherit")
    assert not forked.has_exemplars()
    assert forked.as_dict()["role_exemplars"] == {
        "cover": [], "section": [], "content": [], "closing": []
    }
    assert not list((forked.pack_dir / "exemplars").glob("specimen_*"))


def test_fork_keeps_authored_reference_images():
    """Only derived specimens are dropped; user-supplied references carry over."""
    ensure_user_draft("authored", parent_id="swiss-modern")
    exemplars = user_pack_dir("authored") / "exemplars"
    exemplars.mkdir(parents=True, exist_ok=True)
    (exemplars / "user_ref_01.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    apply_patch("authored", {"role_exemplars": {"content": ["exemplars/user_ref_01.png"]}})

    fork_pack("authored", "authored-fork")
    forked = get_pack("authored-fork")
    assert forked.role_exemplar_relpaths("content") == ["exemplars/user_ref_01.png"]
    assert (forked.pack_dir / "exemplars" / "user_ref_01.png").is_file()


def test_fork_copies_mascot_assets_referenced_by_the_policy():
    ensure_user_draft("decorated", parent_id="swiss-modern")
    source = user_pack_dir("decorated") / "art" / "guide.svg"
    source.parent.mkdir(parents=True)
    source.write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
        encoding="utf-8",
    )
    apply_patch(
        "decorated",
        {
            "mascot_policy": {
                "mode": "corner_accent",
                "assets": [{"id": "guide", "path": "art/guide.svg"}],
                "selection": "all",
                "max_area_ratio": 0.08,
                "roles_allowed": ["content"],
            }
        },
    )

    fork_pack("decorated", "decorated-fork")
    assert (user_pack_dir("decorated-fork") / "art" / "guide.svg").read_text() == source.read_text()


def test_fork_does_not_touch_the_parent():
    fork_pack("swiss-modern", "forked-pack")
    apply_patch("forked-pack", {"label": "Changed"})
    assert get_pack("swiss-modern").label == "Swiss Modern"
    assert get_pack("forked-pack").label == "Changed"


def test_a_user_pack_shadows_a_preset_of_the_same_id():
    fork_pack("swiss-modern", "shadow-me")
    assert next(e for e in list_packs(include_draft=True) if e["id"] == "shadow-me")["root"] == "user"
    assert next(e for e in list_packs() if e["id"] == "swiss-modern")["root"] == "preset"


def test_ensure_user_draft_is_idempotent():
    ensure_user_draft("draft-once", parent_id="swiss-modern")
    apply_patch("draft-once", {"label": "Mine"})
    ensure_user_draft("draft-once", parent_id="swiss-modern")
    assert get_pack("draft-once").label == "Mine"


# ---------------------------------------------------------------- priority chain


def test_explicit_beats_adapter_beats_parent():
    filled, report = fill_defaults(
        {"id": "chain", "label": "Explicit label", "density_default": "academic_high"},
        parent_id="swiss-modern",
        explicit_paths={"label"},
        adapter_paths={"density_default"},
    )
    by_path = {f.path: f for f in report.fields}
    assert by_path["label"].source == "explicit"
    assert by_path["density_default"].source == "adapter"
    # Untouched fields are inherited, and say so.
    assert by_path["skill_body"].status == "inferred"
    assert by_path["skill_body"].source == "parent"
    assert filled["skill_body"] == get_pack("swiss-modern").skill_body()


def test_fields_copied_by_the_fork_are_credited_to_the_parent_not_the_user():
    """Otherwise the report cannot tell you what a build actually changed."""
    from_text("credit-check", "just prose, no colours here at all")
    assert _field("credit-check", "skill_body")["source"] == "parent"
    assert _field("credit-check", "prompt_compile.style_prose")["source"] == "adapter"


def test_missing_parent_falls_through_to_the_safe_default():
    filled, report = fill_defaults({"id": "orphan"}, parent_id="does-not-exist")
    assert "unavailable" in " ".join(report.notes)
    assert filled["identity"]["notale_tokens"]["bg"]
    assert filled["density_default"]


def test_a_bare_palette_is_projected_into_renderable_tokens():
    filled, report = fill_defaults(
        {
            "id": "bridged",
            "identity": {"style_tokens": {"background": "#101418", "text": "#F0F0F0"}},
        },
        parent_id="swiss-modern",
    )
    tokens = filled["identity"]["notale_tokens"]
    # The parent's block wins here because it is already complete and valid;
    # what matters is that the result renders.
    assert set(tokens) >= {"bg", "ink", "surface", "muted", "line"}
    assert isinstance(report, MergeReport)


# ---------------------------------------------------------------- contrast fallback


def test_unreadable_tokens_fall_back_to_the_parent_and_are_reported():
    fork_pack("swiss-modern", "bad-contrast")
    apply_patch(
        "bad-contrast",
        {"identity": {"notale_tokens": {"bg": "#FFFFFF", "ink": "#FAFAFA"}}},
    )
    assert get_pack("bad-contrast").notale_tokens() == get_pack("swiss-modern").notale_tokens()
    entry = _field("bad-contrast", "identity.notale_tokens")
    assert entry["source"] == "parent"
    assert "rejected" in entry["note"] and "contrast" in entry["note"]


def test_fallback_keeps_everything_else_the_patch_asked_for():
    fork_pack("swiss-modern", "partial-bad")
    apply_patch(
        "partial-bad",
        {
            "label": "Kept",
            "density_default": "academic_high",
            "identity": {"notale_tokens": {"bg": "#FFFFFF", "ink": "#FAFAFA"}},
        },
    )
    pack = get_pack("partial-bad")
    assert pack.label == "Kept"
    assert pack.density_default == "academic_high"
    assert pack.notale_tokens()["ink"] != "#FAFAFA"


def test_a_readable_patch_is_applied_untouched():
    fork_pack("swiss-modern", "good-contrast")
    apply_patch(
        "good-contrast",
        {"identity": {"notale_tokens": {"bg": "#101010", "ink": "#FAFAFA", "surface": "#1E1E1E"}}},
    )
    tokens = get_pack("good-contrast").notale_tokens()
    assert (tokens["bg"], tokens["ink"], tokens["surface"]) == ("#101010", "#FAFAFA", "#1E1E1E")


# ---------------------------------------------------------------- extractors


def test_from_text_reads_colours_audience_radius_and_negatives():
    patch, paths = extract_from_text(
        "学术信息图，主色 #0A2540，强调 #F2994A，柔和圆角，禁止 仪表盘"
    )
    assert patch["audience_hint"] == "academic"
    assert patch["identity"]["radius_scale"] == "soft"
    assert patch["identity"]["style_tokens"]["primary"] == "#0A2540"
    assert patch["identity"]["style_tokens"]["accent"] == "#F2994A"
    assert "仪表盘" in patch["hard_negatives"]
    assert patch["provenance"] == "from_text"
    assert "identity.style_tokens" in paths


def test_from_text_puts_named_colours_where_they_actually_render():
    """A colour the user named must reach notale_tokens, not just the palette."""
    from_text("colour-check", "主色 #0A2540，强调 #F2994A")
    tokens = get_pack("colour-check").notale_tokens()
    assert tokens["accent"] == "#0A2540"
    assert tokens["accent-3"] == "#F2994A"


def test_from_text_does_not_displace_parent_fonts():
    parent_fonts = {
        k: v for k, v in get_pack("paper-and-ink").notale_tokens().items() if k.startswith("font-")
    }
    from_text("font-check", "主色 #0A2540", parent_id="paper-and-ink")
    tokens = get_pack("font-check").notale_tokens()
    assert {k: v for k, v in tokens.items() if k.startswith("font-")} == parent_fonts


def test_empty_text_yields_an_empty_patch():
    assert extract_from_text("") == ({}, set())
    assert extract_from_text("   ") == ({}, set())


def test_short_hex_is_expanded():
    patch, _ = extract_from_text("用 #abc 作主色")
    assert patch["identity"]["style_tokens"]["primary"] == "#AABBCC"


def test_merge_json_marks_every_supplied_key_explicit():
    ensure_user_draft("merged", parent_id="swiss-modern")
    merge_json("merged", {"label": "Merged", "density_default": "academic_high"})
    assert _field("merged", "label")["source"] == "explicit"
    assert get_pack("merged").label == "Merged"


def test_changing_only_the_abstract_palette_re_derives_the_executable_one():
    """The shape of importing a deckbase pack, which has no notale_tokens.

    Without this the pack would describe one palette and render another.
    """
    ensure_user_draft("repalette", parent_id="notale-default")  # dark parent
    apply_patch(
        "repalette",
        {
            "identity": {
                "style_tokens": {
                    "background": "#F7FAFC",
                    "text": "#1A202C",
                    "primary": "#1A365D",
                    "secondary": "#2B6CB0",
                    "accent": "#C05621",
                }
            }
        },
    )
    tokens = get_pack("repalette").notale_tokens()
    assert tokens["bg"] == "#F7FAFC"
    assert tokens["ink"] == "#1A202C"
    assert tokens["accent"] == "#1A365D"
    # Typography is not implied by a palette, so it stays inherited.
    assert tokens["font-body"] == get_pack("notale-default").notale_tokens()["font-body"]
    assert _field("repalette", "identity.notale_tokens")["source"] == "bridge"


def test_a_full_deckbase_pack_imports_without_losing_a_field():
    source = json.loads(
        Path(
            "/data1/home/zhuyifan/ws2/deckbase/config/style_packs/presets/academic_blue/pack.json"
        ).read_text()
    )
    overlay = {
        key: value
        for key, value in source.items()
        if key not in {"id", "lineage", "status", "provenance", "version"}
    }
    ensure_user_draft("imported", parent_id="notale-default")
    merge_json("imported", overlay)
    pack = get_pack("imported")

    # deckbase's own fields survive verbatim.
    assert pack.style_tokens()["primary"] == source["identity"]["style_tokens"]["primary"]
    assert pack.density_default == source["density_default"]
    assert pack.hard_negatives() == source["hard_negatives"]
    assert pack.mascot_policy()["mode"] == source["mascot_policy"]["mode"]
    assert pack.or_hints()["aspect_ratio"] == source["or_hints"]["aspect_ratio"]
    assert pack.prompt_compile()["style_anchor"] == source["prompt_compile"]["style_anchor"]
    assert pack.info_form_bias() == source["info_form_bias"]

    # And it renders as the light academic style it describes.
    tokens = pack.notale_tokens()
    assert tokens["bg"] == "#F7FAFC"
    assert tokens["ink"] == "#1A202C"
    assert not __import__(
        "notale.style_studio.schema", fromlist=["contrast_failures"]
    ).contrast_failures(tokens)


@pytest.mark.skipif(
    not Path("/data1/home/zhuyifan/ws2/deckbase/config/style_packs/presets").is_dir(),
    reason="deckbase checkout not present",
)
def test_every_deckbase_preset_imports_and_renders():
    root = Path("/data1/home/zhuyifan/ws2/deckbase/config/style_packs/presets")
    from notale.style_studio.preview import check_pack

    for index, path in enumerate(sorted(root.glob("*/pack.json"))):
        source = json.loads(path.read_text())
        overlay = {
            key: value
            for key, value in source.items()
            if key
            not in {"id", "lineage", "status", "provenance", "version", "role_exemplars"}
        }
        # Asset *paths* validate against the pack directory, so a real importer
        # has to copy the referenced binaries. This test covers the field
        # mapping, not asset transfer, so it carries the policy without them.
        if "mascot_policy" in overlay:
            overlay["mascot_policy"] = {**overlay["mascot_policy"], "assets": []}
        pack_id = f"db-import-{index}"
        ensure_user_draft(pack_id, parent_id="notale-default")
        merge_json(pack_id, overlay)
        report = check_pack(pack_id)
        assert report["ok"], f"{source['id']}: {report['failures']}"


# ---------------------------------------------------------------- from_topic


def test_extract_from_topic_is_pure_and_marks_the_model_authored_fields():
    output = StyleOutput.model_validate(_default_style())
    patch, paths = extract_from_topic(output)

    assert patch["provenance"] == "from_topic"
    assert patch["skill_body"] == output.body
    assert patch["identity"]["notale_tokens"]["bg"] == output.tokens.bg
    # The deckbase palette is kept in step so the pack stays exportable.
    assert patch["identity"]["style_tokens"]["background"] == output.tokens.bg
    assert {"skill_body", "compositions", "identity.notale_tokens"} <= paths


def test_generated_pack_ids_never_collide():
    assert resolve_pack_id("swiss-modern") == "swiss-modern-2"
    fork_pack("swiss-modern", "swiss-modern-2")
    assert resolve_pack_id("swiss-modern") == "swiss-modern-3"
    assert resolve_pack_id("swiss-modern", discriminator="ab12") == "swiss-modern-ab12"
    assert resolve_pack_id("Totally New Style!") == "totally-new-style"


# ---------------------------------------------------------------- lifecycle


def test_lifecycle_runs_draft_to_preview_ok_to_published():
    ensure_user_draft("lifecycle", parent_id="swiss-modern")
    assert get_pack("lifecycle").status == "draft"
    # Drafts are hidden from the default listing but still resolvable.
    assert "lifecycle" not in {e["id"] for e in list_packs()}
    assert "lifecycle" in {e["id"] for e in list_packs(include_draft=True)}

    mark_preview_ok("lifecycle")
    assert get_pack("lifecycle").status == "preview_ok"
    assert "lifecycle" in {e["id"] for e in list_packs()}

    publish_pack("lifecycle")
    assert get_pack("lifecycle").status == "published"


def test_patching_a_pack_that_was_never_forked_fails_loudly():
    with pytest.raises(FileNotFoundError, match="fork first"):
        apply_patch("never-forked", {"label": "x"})


def test_publishing_an_unknown_pack_fails_loudly():
    with pytest.raises(FileNotFoundError):
        publish_pack("never-forked")


def test_remove_deletes_the_directory_and_the_registry_entry():
    ensure_user_draft("temporary", parent_id="swiss-modern")
    assert "temporary" in list_user_pack_ids()
    remove_user_pack("temporary")
    assert "temporary" not in list_user_pack_ids()
    assert not pack_exists("temporary")
    assert not user_pack_dir("temporary").exists()


def test_build_writes_a_human_readable_report(tmp_path: Path):
    from_text("reported", "主色 #0A2540，学术信息图")
    report = (user_pack_dir("reported") / "BUILD_REPORT.md").read_text()
    assert "# BUILD_REPORT — `reported`" in report
    assert "| path | status | source | note |" in report
    assert "from-text" in report
    brief = json.loads((user_pack_dir("reported") / "BUILD_BRIEF.json").read_text())
    assert brief["pack_id"] == "reported"
    assert brief["provenance"] == "from_text"


def test_user_packs_stay_out_of_the_packaged_registry(isolated_style_packs):
    from notale.style_studio.paths import registry_path

    from_text("scratch", "主色 #0A2540")
    packaged = json.loads(registry_path().read_text())
    assert "scratch" not in {entry["id"] for entry in packaged["packs"]}
    assert (isolated_style_packs / "scratch" / "pack.json").is_file()
