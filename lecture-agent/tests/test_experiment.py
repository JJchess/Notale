"""实验记录契约测试：profile_deck 能力画像 + ExperimentRecord 合法/非法。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from lecture_agent.domain.telemetry import profile_deck
from lecture_agent.schema import CapabilityProfile, ExperimentRecord
from pydantic import ValidationError

FIXTURE = (
    Path(__file__).resolve().parent.parent / "experiments" / "corpus" / "tree-bst-avl-lecture.lecture.json"
)


def _load_fixture() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_profile_deck_counts_block_types_and_variants() -> None:
    """真实 35 页富 deck（含 diagram×多/chart/stats/quiz/code/compare 嵌套）——golden 断言。"""
    doc = _load_fixture()
    profile = profile_deck(doc)

    assert profile.theme == "lab"
    assert profile.pages == 35
    # compare 块递归进内层 list——14 而非顶层出现的 3，验证容器块递归生效。
    assert profile.block_types["list"] == 14
    assert profile.block_types["diagram"] == 8
    assert profile.block_types["chart"] == 1
    assert profile.block_types["quiz"] == 4
    assert profile.block_types["compare"] == 4

    assert profile.variants["diagram:staircase"] == 3
    assert profile.variants["diagram:arrow-seq"] == 3
    assert profile.variants["diagram:pyramid"] == 1
    assert profile.variants["diagram:connected-circles"] == 1
    assert profile.variants["quiz:objective"] == 4
    assert profile.variants["code:python"] == 1
    assert profile.variants["code:javascript"] == 1
    assert profile.variants["chart:line"] == 1

    assert profile.layouts["full"] == 2
    assert profile.layouts["flow"] == 33  # 隐式默认，未被 assign_layouts 显式指派的页面数


def test_profile_deck_counts_per_item_fragment_not_just_block_level() -> None:
    """per-item(list/agenda) fragment 曾经完全不计数——只查 block.fragment，
    导致真实生成明明用了动效、热力图还是显示 0。"""
    doc = {
        "scenes": [
            {
                "kind": "content",
                "blocks": [
                    {
                        "type": "list",
                        "items": [
                            {"text": "a", "fragment": "fade-up"},
                            {"text": "b", "fragment": True},
                            {"text": "c"},
                        ],
                    },
                    {
                        "type": "agenda",
                        "rows": [{"label": "x", "text": "y", "fragment": "highlight-red"}],
                    },
                ],
            }
        ]
    }
    profile = profile_deck(doc)
    assert profile.fragment_blocks == 3
    assert profile.fragment_names == {"fade-up": 1, "highlight-red": 1}


def test_profile_deck_empty_doc_returns_zeroed_profile() -> None:
    profile = profile_deck({"scenes": []})
    assert profile.pages == 0
    assert profile.blocks_total == 0
    assert profile.block_types == {}
    assert profile.variants == {}


def test_profile_deck_is_pure_function_type() -> None:
    doc = _load_fixture()
    profile = profile_deck(doc)
    assert isinstance(profile, CapabilityProfile)


def test_experiment_record_minimal_valid() -> None:
    rec = ExperimentRecord(run_id="r1", ts="2026-01-01T00:00:00", topic="梯度下降")
    assert rec.source == "generate"
    assert rec.ok is True
    assert rec.cost.total_tokens == 0
    assert rec.profile.pages == 0


def test_experiment_record_rejects_missing_required_fields() -> None:
    with pytest.raises(ValidationError):
        ExperimentRecord(ts="2026-01-01T00:00:00")  # 缺 run_id


def test_experiment_record_memory_snapshot_is_pinned_input() -> None:
    """P1 · 支柱3：记忆快照指纹进账本，与 seed/cassette 共同钉死一次可复现 run。"""
    rec = ExperimentRecord(
        run_id="r2",
        ts="2026-01-01T00:00:00",
        source="shell",
        seed=7,
        memory_snapshot="deadbeefcafe0000",
        held_split="held_in",
    )
    assert rec.memory_snapshot == "deadbeefcafe0000"
    assert rec.held_split == "held_in"
    # 序列化后仍带这两字段（热力图/复现比对读得到）
    assert json.loads(rec.model_dump_json())["memory_snapshot"] == "deadbeefcafe0000"


def test_experiment_record_backward_compat_without_new_fields() -> None:
    """历史账本行没有 memory_snapshot/held_split——仍应合法（默认 None），不破坏回读。"""
    old = '{"run_id": "hist1", "ts": "2026-01-01T00:00:00", "topic": "旧行"}'
    rec = ExperimentRecord.model_validate_json(old)
    assert rec.memory_snapshot is None
    assert rec.held_split is None
