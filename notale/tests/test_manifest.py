"""页状态机 + 断点续跑。"""

import json

import pytest

from notale.core.models import PageStatus
from notale.core.state import Manifest


def test_state_machine_legal_and_illegal(tmp_path):
    m = Manifest.create(tmp_path, "q")
    m.register_pages(["p1", "p2"])
    m.transition("p1", PageStatus.DRAFTED)
    m.transition("p1", PageStatus.COMPLETED)
    with pytest.raises(ValueError):
        m.transition("p1", PageStatus.DRAFTED)  # completed 是终态
    with pytest.raises(ValueError):
        m.transition("p2", PageStatus.COMPLETED)  # 不能跳过 drafted


def test_attempts_counted_on_draft(tmp_path):
    m = Manifest.create(tmp_path, "q")
    m.register_pages(["p1"])
    m.transition("p1", PageStatus.DRAFTED)
    assert m.data.pages["p1"].attempts == 1


def test_resume_only_redoes_non_terminal(tmp_path):
    m = Manifest.create(tmp_path, "q")
    m.register_pages(["p1", "p2", "p3"])
    m.transition("p1", PageStatus.DRAFTED)
    m.transition("p1", PageStatus.COMPLETED)
    m.transition("p2", PageStatus.DRAFTED)
    m.transition("p3", PageStatus.DEGRADED)  # pending → degraded 合法（编排强制降级）
    # 重开（模拟进程重启）
    m2 = Manifest.load(m.run_dir)
    assert m2.todo_pages() == ["p2"]
    assert m2.pages_by_status(PageStatus.COMPLETED) == ["p1"]
    assert m2.pages_by_status(PageStatus.DEGRADED) == ["p3"]


def test_load_normalizes_retired_verifier_statuses(tmp_path):
    m = Manifest.create(tmp_path, "q")
    m.register_pages(["p1", "p2"])
    raw = json.loads((m.run_dir / "manifest.json").read_text())
    raw["pages"]["p1"]["status"] = "verified"
    raw["pages"]["p2"]["status"] = "returned-for-repair"
    (m.run_dir / "manifest.json").write_text(json.dumps(raw))

    loaded = Manifest.load(m.run_dir)
    assert loaded.data.pages["p1"].status == PageStatus.COMPLETED
    assert loaded.data.pages["p2"].status == PageStatus.DRAFTED
    assert loaded.todo_pages() == ["p2"]


def test_events_append_only(tmp_path):
    m = Manifest.create(tmp_path, "q")
    m.register_pages(["p1"])
    m.transition("p1", PageStatus.DRAFTED, note="first")
    lines = (m.run_dir / "events.jsonl").read_text().strip().split("\n")
    assert len(lines) == 2  # run-created + page-transition
