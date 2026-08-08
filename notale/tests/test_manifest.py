"""页状态机 + 断点续跑。"""

import pytest

from notale.core.models import PageStatus
from notale.core.state import Manifest


def test_state_machine_legal_and_illegal(tmp_path):
    m = Manifest.create(tmp_path, "q")
    m.register_pages(["p1", "p2"])
    m.transition("p1", PageStatus.DRAFTED)
    m.transition("p1", PageStatus.VERIFIED)
    with pytest.raises(ValueError):
        m.transition("p1", PageStatus.DRAFTED)  # verified 是终态
    with pytest.raises(ValueError):
        m.transition("p2", PageStatus.VERIFIED)  # 不能跳过 drafted


def test_attempts_counted_on_draft(tmp_path):
    m = Manifest.create(tmp_path, "q")
    m.register_pages(["p1"])
    m.transition("p1", PageStatus.DRAFTED)
    m.transition("p1", PageStatus.RETURNED_FOR_REPAIR)
    m.transition("p1", PageStatus.DRAFTED)
    assert m.data.pages["p1"].attempts == 2


def test_resume_only_redoes_non_terminal(tmp_path):
    m = Manifest.create(tmp_path, "q")
    m.register_pages(["p1", "p2", "p3"])
    m.transition("p1", PageStatus.DRAFTED)
    m.transition("p1", PageStatus.VERIFIED)
    m.transition("p2", PageStatus.DRAFTED)
    m.transition("p2", PageStatus.RETURNED_FOR_REPAIR)
    m.transition("p3", PageStatus.DEGRADED)  # pending → degraded 合法（编排强制降级）
    # 重开（模拟进程重启）
    m2 = Manifest.load(m.run_dir)
    assert m2.todo_pages() == ["p2"]
    assert m2.pages_by_status(PageStatus.VERIFIED) == ["p1"]
    assert m2.pages_by_status(PageStatus.DEGRADED) == ["p3"]


def test_events_append_only(tmp_path):
    m = Manifest.create(tmp_path, "q")
    m.register_pages(["p1"])
    m.transition("p1", PageStatus.DRAFTED, note="first")
    lines = (m.run_dir / "events.jsonl").read_text().strip().split("\n")
    assert len(lines) == 2  # run-created + page-transition
