from __future__ import annotations

import argparse
import importlib.util
import json
import tempfile
from pathlib import Path

import pytest


HERE = Path(__file__).resolve().parent


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


lab = load_module("workflow_next_lab", HERE / "lab.py")
loader = load_module("workflow_context_loader", HERE / "context_loader.py")


def loader_args(skill: str, reference: str, *, mode="full", main=None, aux=None):
    return argparse.Namespace(
        reference=reference,
        main=main,
        aux=aux or [],
        skill_root=str(lab.SKILLS_ROOT / skill),
        mode=mode,
        log=None,
    )


def test_validate_has_exact_matrix_and_52_runs():
    report = lab.validate()
    assert report["ok"], report["errors"]
    assert report["skills"] == 3
    assert report["fixtures"] == 3
    assert report["cases"] == 9
    assert report["planned_runs"] == 52


def test_target_specs_keep_planner_level_abstraction():
    expected = {
        "cover-generative-epidemic": "传染病在接触网络中的传播。",
        "page-chart-epidemic-threshold": "比较不同传染病的基本再生数与群体免疫阈值。",
        "interaction-general-immunity": "交互理解群体免疫。",
        "cover-motion-orbit": "从近地轨道到月球轨道。",
        "page-3d-lunar-orbit": "讲解月球轨道的空间结构。",
        "interaction-3d-orbit-transfer": "交互理解轨道转移。",
        "cover-composition-adaboost": "AdaBoosting算法。",
        "page-general-adaboost": "AdaBoosting算法讲解。",
        "interaction-code-adaboost": "代码实操AdaBoosting算法。",
    }
    for case in lab.cases():
        fixture = lab.FIXTURES / case["deck"]
        lines = lab.page_spec(fixture, case["pid"]).splitlines()
        assert len(lines) == 2
        assert lines[1] == expected[case["id"]]
        assert not any(word in lines[1] for word in ("按钮", "拖动", "滑块", "左侧", "右侧", "Canvas", "SVG", "Three.js"))


def test_planner_inputs_are_provenance_not_builder_prompt():
    for deck in ("adaboost", "epidemic-dynamics", "orbital-mechanics"):
        data = lab.planner_input(deck)
        assert set(data) == {"query", "minutes", "audience", "scenario", "label", "canvas"}
        assert data["minutes"] == 60
        assert data["canvas"] == "1600x900"
    assert lab.planner_input("adaboost")["query"] == "AdaBoosting算法"


def test_adaboost_theme_is_a_clean_algorithm_workspace():
    css = (lab.FIXTURES / "adaboost" / "pages" / "assets" / "theme.css").read_text(encoding="utf-8")
    assert "#EEF1F5" in css
    assert "#F4F0E6" not in css
    assert "Georgia" not in css
    assert "radial-gradient" not in css
    assert "box-shadow" not in css


def test_context_loader_wraps_one_reference_and_bounded_samples():
    result = loader.load(
        loader_args(
            "build-page",
            "chart",
            main="solar-storage",
            aux=["swarm-spectrum", "climate-zone-shift-map"],
        )
    )
    record = result["record"]
    assert record["skill"] == "build-page"
    assert record["reference"] == "chart"
    assert [row["role"] for row in record["samples"]] == ["main", "aux", "aux"]
    assert [row["variant"] for row in record["samples"]] == ["full", "mini", "mini"]
    assert record["aux_chars"] <= 30_000
    assert record["bundle_chars"] <= 110_000
    assert result["output"].count("<sample ") == 3
    assert '<file path="samples/chart/solar-storage/pages/index.html"' in result["output"]


def test_context_loader_uses_under_10k_full_as_auxiliary():
    result = loader.load(
        loader_args(
            "build-cover",
            "generative",
            main="magnetic-field",
            aux=["lenna-pixel-field"],
        )
    )
    assert result["record"]["samples"][1]["variant"] == "full"


def test_context_loader_enforces_reference_arm_and_category():
    reference = loader.load(loader_args("build-interaction", "3d", mode="reference"))
    assert reference["record"]["samples"] == []
    with pytest.raises(ValueError, match="reference arm"):
        loader.load(loader_args("build-page", "chart", mode="reference", main="solar-storage"))
    with pytest.raises(ValueError, match="invalid main"):
        loader.load(loader_args("build-page", "chart", main="gimbal"))
    with pytest.raises(ValueError, match="main-only|invalid auxiliary"):
        loader.load(
            loader_args(
                "build-interaction",
                "general",
                main="lawn-path",
                aux=["future-climate-analogy"],
            )
        )


def test_code_bundle_is_loaded_as_one_sample():
    result = loader.load(
        loader_args("build-interaction", "code", main="code-core-bundle")
    )
    record = result["record"]
    assert len(record["samples"]) == 1
    assert record["samples"][0]["chars"] == 66_087
    assert "grid-bfs/lesson/trace.py" in result["output"]
    assert record["bundle_chars"] <= 110_000


def test_reference_projection_removes_sample_catalog_and_rules(tmp_path):
    source = lab.skill_root("build-cover")
    projected = tmp_path / "build-cover"
    lab.reference_projection(source, projected)
    text = (projected / "SKILL.md").read_text(encoding="utf-8")
    assert "Sample catalog" not in text
    assert "Choose one full main sample" not in text
    assert "No sample material is available" in text
    assert "workflow-context --reference <category>" in text
    assert (projected / "references" / "generative.md").is_file()
    assert not (projected / "samples").exists()


def test_prepared_arms_are_builder_shaped_and_payload_matched(tmp_path):
    case = lab.case_map()["page-general-adaboost"]
    prepared = []
    roots = []
    for arm in lab.ARMS:
        root = tmp_path / case["id"] / "arms" / arm
        roots.append(root)
        prepared.append(lab.prepare_arm(case, arm, root))
    assert len({item["base_payload_hash"] for item in prepared}) == 1
    for root in roots:
        assert not (root / "TASK.md").exists()
        assert (root / "pages" / "page-08.html").is_file()
        assert len(list((root / "pages").glob("page-*.html"))) == 16
        agents = (root / "AGENTS.md").read_text(encoding="utf-8")
        for tag in ("<chassis>", "<tech>", "<theme_css>", "<deck_map>"):
            assert tag in agents
        assert "workflow-check <target>" in agents
        assert "host-side check broker" in agents
        prompt = lab.brief_for(root, case)
        assert "AdaBoosting算法讲解。" in prompt
        assert "学过概率" not in prompt
        assert "<page_spec>" in prompt
        assert "TASK.md" not in prompt
    assert not (roots[0] / ".agents" / "skills" / case["skill"]).exists()
    assert (roots[1] / ".agents" / "skills" / case["skill"] / "references" / "general.md").is_file()
    assert (roots[2] / ".agents" / "skills" / case["skill"]).is_symlink()


def test_every_full_skill_names_the_single_context_reader_call():
    for skill in lab.LABEL_SKILLS.values():
        text = (lab.skill_root(skill) / "SKILL.md").read_text(encoding="utf-8")
        assert "WorkflowContext" in text
        assert "exactly once" in text
        assert "workflow-context --reference" not in text
        assert "Do not open `references/`, `samples/`, or `samples/catalog.json` directly" in text


def test_review_matrix_uses_two_arms_only_for_interaction_3d():
    rows = lab.cases()
    assert lab.arms_for(lab.case_map()["interaction-3d-orbit-transfer"]) == ("baseline", "reference")
    assert sum(len(lab.arms_for(row)) for row in rows) * 2 == 52


def test_audit_rejects_direct_reference_or_sample_browsing(tmp_path):
    case = lab.case_map()["page-general-adaboost"]
    root = tmp_path / "arm"
    prepared = lab.prepare_arm(case, "reference", root)
    context = root / ".codex-lab" / "context-reads.jsonl"
    context.parent.mkdir(parents=True, exist_ok=True)
    context.write_text(
        json.dumps(
            {
                "skill": case["skill"],
                "reference": case["reference"],
                "samples": [],
                "aux_chars": 0,
                "bundle_chars": 10_000,
            }
        )
        + "\n",
        encoding="utf-8",
    )
    target = root / "pages" / f"{case['pid']}.html"
    target.write_text(lab.skeleton(8) + "<!-- " + ("x" * 1000) + " -->", encoding="utf-8")
    audit = lab.audit_arm(
        case,
        "reference",
        root,
        prepared,
        {"commands": ["sed -n '1,200p' .agents/skills/build-page/references/general.md"], "events": 1, "usage": {}},
        None,
    )
    assert not audit["ok"]
    assert any("bypassed workflow-context" in error for error in audit["errors"])


def test_selfcheck_parser_ignores_hidden_a11y_copy_but_flags_visible_escape():
    payload = [
        {
            "page": "page-01.html",
            "states": [
                {
                    "js_error": None,
                    "errors": [],
                    "failed": [],
                    "probe": {
                        "fatal": None,
                        "escaped": [{"el": "p#live"}],
                        "clipped": [{"el": "p.sr-only"}],
                    },
                }
            ],
        }
    ]
    assert lab.selfcheck_payload_issues(payload) == ["page-01.html state 0: escaped p#live"]
