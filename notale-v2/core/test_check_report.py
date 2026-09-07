"""Report compression must preserve measured changes and every failure."""
import contextlib
import copy
import importlib.util
import io
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "selfcheck_report", Path(__file__).resolve().parents[1] / "vendor/chassis/selfcheck.py")
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


def state(label=None):
    return {"label": label, "errs": [], "bad": [], "png": None,
            "probe": {"sizes": [15, 18, 34], "canvases": 1, "escaped": [], "clipped": [],
                      "subject": {"top": .5, "ratio": 3}, "scale": [15, 18, 34],
                      "offScale": 0, "theme": {"padX": "56px", "stagePad": "28px 56px"}}}


def render(states):
    stream = io.StringIO()
    with contextlib.redirect_stdout(stream):
        check.report("page-01.html", states)
    return stream.getvalue()


def test_equal_states_keep_measurement_coverage_without_repeating_statistics():
    states = [state(), state("void 0"), state("void 0")]
    before = copy.deepcopy(states)
    out = render(states)
    assert out.count("canvas 1 个") == 1
    assert out.count("指标同初态") == 2
    assert "after1" in out and "after2" in out
    assert states == before


def test_changed_metrics_errors_and_recovery_are_explicit():
    states = [state(), state("break"), state("reset")]
    states[1]["errs"] = ["JS 报错: broken"]
    states[1]["probe"]["sizes"] = [13, 18, 34]
    states[1]["probe"]["offScale"] = 1
    states[1]["probe"]["rails"] = ["box@12,24"]
    out = render(states)
    assert "✗ JS 报错: broken" in out
    assert "字号最小 13px" in out and "字阶 1/3" in out
    assert out.count("15/18/34px") == 1
    assert "after2" in out and out.rstrip().endswith("指标同初态")


def test_repeated_failures_and_missing_metrics_are_not_hidden():
    states = [state(), state("still broken")]
    for s in states:
        s["errs"] = ["JS 报错: broken"]
    states[1]["probe"]["subject"] = None
    out = render(states)
    assert out.count("✗ JS 报错: broken") == 2
    assert "本状态不再报告的项目：主体" in out


def test_failed_after_never_claims_it_was_measured():
    failed = {"label": "throw Error()", "probe": None, "js_error": "bad"}
    out = render([state(), failed])
    assert "这个状态没测到" in out
    assert "同初态" not in out
