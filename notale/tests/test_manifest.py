from pathlib import Path

import pytest

from notale.core.models import PageRunStatus
from notale.core.state import RunStore


def test_current_run_state_and_resume_reset(tmp_path: Path):
    store = RunStore.create(tmp_path, "topic", "hash")
    store.register_plan(2)
    store.start_page(1)
    loaded = RunStore.load(store.run_dir)
    assert loaded.reset_running() == [1]
    assert loaded.pending_pages() == [1, 2]
    loaded.start_page(1)
    loaded.finish_page(1, PageRunStatus.COMPLETED)
    assert loaded.pages_with(PageRunStatus.COMPLETED) == ["p1"]


def test_old_manifest_is_not_resumable(tmp_path: Path):
    (tmp_path / "manifest.json").write_text("{}")
    with pytest.raises(ValueError, match="run.json"):
        RunStore.load(tmp_path)
