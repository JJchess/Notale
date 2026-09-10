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
                      "subject": {"top": .5, "ratio": 3},
                      "theme": {"invalidTokens": []}}}


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
    states[1]["probe"]["theme"]["invalidTokens"] = ['--text']
    states[1]["probe"]["rails"] = ["box@12,24"]
    out = render(states)
    assert "✗ JS 报错: broken" in out
    assert "字号最小 13px" in out and "--text" in out
    assert "字阶" not in out and "--pad-x" not in out
    assert "after2" in out and out.rstrip().endswith("指标同初态")


def test_repeated_failures_and_missing_metrics_are_not_hidden():
    states = [state(), state("still broken")]
    for s in states:
        s["errs"] = ["JS 报错: broken"]
    states[1]["probe"]["sizes"] = []
    out = render(states)
    assert out.count("✗ JS 报错: broken") == 2
    assert "本状态不再报告的项目：canvas" in out


def test_aesthetic_statistics_are_not_returned_but_evidence_is_preserved():
    s = state()
    s['probe'].update(rails=['box@12,24'], tiny=4, overlap=1,
                      fills=[{'tag':'div','at':[12,24],'fill':.2,'gap':.5}])
    s['result'] = {'computed':100,'displayed':74}
    before = copy.deepcopy(s)
    out = render([s])
    for phrase in ('主体 最大', '侧边条', '区块', '小容器'):
        assert phrase not in out
    assert '文字叠压 1 处' in out
    assert '返回值' in out and '字号最小' in out
    assert s == before


def test_failed_after_never_claims_it_was_measured():
    failed = {"label": "throw Error()", "probe": None, "js_error": "bad"}
    out = render([state(), failed])
    assert "这个状态没测到" in out
    assert "同初态" not in out


def test_contract_failures_stay_explicit_without_layout_diagnosis():
    broken = state()
    broken['probe'] = {'contract':['缺少基础样式 base.css 引用']}
    repeated = copy.deepcopy(broken)
    repeated['label'] = 'still missing'
    out = render([broken, repeated])
    assert out.count('✗ 底盘契约: 缺少基础样式 base.css 引用') == 2
    assert '渲染无报错' not in out
    assert 'canvas' not in out
    assert '指标同初态' not in out


def test_small_viewport_failure_is_not_reported_as_success():
    initial = state()
    initial['viewport_issues'] = ['舞台未居中等比适配 800×450 视口']
    out = render([initial])
    assert '✗ 底盘契约: 舞台未居中等比适配 800×450 视口' in out
    assert '渲染无报错' not in out


def test_return_values_are_not_hidden_as_repeated_layout_metrics():
    states = [state(), state('return object'), state('return object again')]
    states[1]['result'] = states[2]['result'] = {'computed':100, 'displayed':74}
    out = render(states)
    assert out.count('返回值 {"computed": 100, "displayed": 74}') == 2
    assert '✗' not in out  # Evidence, not a new automatic semantic gate.


def test_false_and_zero_return_values_remain_visible():
    states = [state(), state('return false'), state('return 0')]
    states[1]['result'], states[2]['result'] = False, 0
    out = render(states)
    assert '返回值 false' in out
    assert '返回值 0' in out
