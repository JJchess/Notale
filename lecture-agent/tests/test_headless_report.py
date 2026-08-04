"""HeadlessVerifier 的机读桥必须保留逐页浏览器指标。"""

from pathlib import Path

from lecture_agent.adapters.render.headless import HeadlessVerifier, _to_report
from pytest import MonkeyPatch


def test_to_report_keeps_page_metrics() -> None:
    metric = {
        "i": 2,
        "overflowX": 0,
        "overflowY": 0,
        "dynamicBlank": [],
        "chartMinWidthUse": 0.96,
        "widgetMinHeight": 340,
        "minTextPx": 14,
    }
    report = _to_report(
        {
            "ok": True,
            "docs": [
                {
                    "fails": [],
                    "overflowPages": [],
                    "corruptPages": [],
                    "pageMetrics": [metric],
                }
            ],
            "shots": [],
        }
    )
    assert report.ok
    assert report.page_metrics == [metric]


def test_shot_dir_is_resolved_before_subprocess_changes_cwd(
    monkeypatch: MonkeyPatch, tmp_path: Path
) -> None:
    # The adapter launches render-check from the repository root, not the caller's cwd.
    # Keeping this absolute is what makes run-local screenshot directories deterministic.
    monkeypatch.chdir(tmp_path)
    verifier = HeadlessVerifier(shot_dir="experiments/run/screenshots")
    assert verifier.shot_dir == (tmp_path / "experiments/run/screenshots").resolve()
    assert verifier.shot_dir.is_absolute()
