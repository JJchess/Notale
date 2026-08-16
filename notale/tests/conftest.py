from __future__ import annotations

import pytest

from notale.style_studio.paths import USER_ROOT_ENV
from notale.style_studio.registry import reload_registry


@pytest.fixture(autouse=True)
def isolated_style_packs(tmp_path_factory, monkeypatch):
    """Point user StylePacks at a scratch root for every test.

    Building a pack writes a directory and a registry entry. Without this the
    suite would mutate the packaged registry and leak packs between tests.
    Presets stay readable throughout; only the writable half moves.
    """
    root = tmp_path_factory.mktemp("style-packs")
    monkeypatch.setenv(USER_ROOT_ENV, str(root))
    reload_registry()
    yield root
    monkeypatch.delenv(USER_ROOT_ENV, raising=False)
    reload_registry()


@pytest.fixture
def plan_data() -> dict:
    return {
        "title": "排序与路径",
        "language": "zh",
        "audience": "本科生",
        "throughline": "从局部选择走向全局路径",
        "chapters": [
            {
                "id": "local", "title": "局部", "pages": 2,
                "goal": "理解局部动作", "entry": "从一次交换进入",
                "payoff": "看清局部选择",
            },
            {
                "id": "global", "title": "全局", "pages": 2,
                "goal": "连接全局策略", "entry": "放大到整条路径",
                "payoff": "形成全局策略",
            },
        ],
        "design": {
            "name": "pathways-field-guide",
            "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        "pages": [
            {
                "type": "section-break",
                "composition": "route-field",
                "claim": "局部动作构成路径",
                "learning_action": "识别状态与动作",
                "narrative_role": "提出问题",
                "links": [], "tools": [],
            },
            {
                "type": "worked-example",
                "composition": "evidence-sheet",
                "claim": "排序暴露局部决策",
                "learning_action": "跟踪一次交换",
                "narrative_role": "建立局部模型",
                "links": [{"target": 1, "relation": "builds-on", "cue": "沿用动作定义"}],
                "tools": [],
            },
            {
                "type": "worked-example",
                "composition": "decision-bench",
                "claim": "路径质量取决于全局顺序",
                "learning_action": "比较两条路径",
                "narrative_role": "跨章提升",
                "links": [{"target": 1, "relation": "returns-to", "cue": "回看最初路径"}],
                "tools": ["run_js"],
            },
            {
                "type": "narrative-scene",
                "composition": "system-map",
                "claim": "规划把局部动作组织为策略",
                "learning_action": "解释策略差异",
                "narrative_role": "综合全书",
                "links": [{"target": 2, "relation": "synthesizes", "cue": "综合局部决策"}],
                "tools": [],
            },
        ],
    }
