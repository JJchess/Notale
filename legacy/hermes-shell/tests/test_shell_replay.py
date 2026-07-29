"""P4 · 支柱3：外壳逐轮可复现。

固定 cassette（FakeClient 脚本化 turns + by_purpose）+ InMemoryMemoryStore 固定快照 +
脚本化 UserPort ⇒ 两次运行**同一工具序列、同一 deck、同一终结文本**。
这是"agentic 外壳照样能复现"的机器证明（记忆快照冻结 + deck 在 store + 决策走录制盒）。
"""

from __future__ import annotations

import json

from lecture_agent.adapters.io import ScriptedUserPort
from lecture_agent.adapters.llm.fake import FakeClient
from lecture_agent.adapters.memory import InMemoryMemoryStore
from lecture_agent.adapters.store import FilesystemStore
from lecture_agent.engine import GeneratorOptions
from lecture_agent.shell.shell import run_shell
from lecture_agent.shell.tools import (
    ClarifyTool,
    EvaluateTool,
    MakeLectureTool,
    SkillViewTool,
    ViewSceneTool,
)
from lecture_agent.domain.context import LoopBudget
from lecture_agent.domain.skills import load_skills
from lecture_agent.ports.llm import ToolInvocation, Turn

_SKELETON = json.dumps({
    "id": "demo", "title": "示例讲义", "language": "zh-CN", "theme": "cartesian",
    "scenes": [
        {"id": "cover", "kind": "hero", "notes": "开场。",
         "blocks": [{"id": "b0", "type": "hero", "intent": "封面"}]},
        {"id": "p1", "kind": "statement", "notes": "主旨。",
         "blocks": [{"id": "b1", "type": "statement", "intent": "一句话主旨"}]},
    ],
})
_BY_PURPOSE = {
    "plan:skeleton": _SKELETON,
    "block:hero": json.dumps({"type": "hero", "title": ["梯度下降", "副标题"]}),
    "block:statement": json.dumps({"type": "statement", "statement": "梯度下降沿负梯度方向迭代。"}),
    "notes": json.dumps({"note": "本页备注，讲清主线与常见误区。"}),
}


def _turns() -> list[Turn]:
    return [
        Turn(tool_calls=[ToolInvocation("c1", "clarify", {"question": "目标受众是谁？"})]),
        Turn(tool_calls=[ToolInvocation(
            "m1", "make_lecture",
            {"topic": "梯度下降", "pages": 2, "theme": "cartesian", "deck_id": "demo"},
        )]),
        Turn(tool_calls=[ToolInvocation(
            "e1", "evaluate", {"deck_id": "demo", "topic": "梯度下降", "target_pages": 2}
        )]),
        Turn(content="讲义已生成并通过体检。"),
    ]


async def _one_run(tmp_path):
    llm = FakeClient(by_purpose=_BY_PURPOSE, tool_turns=_turns())
    store = FilesystemStore(tmp_path)
    memory = InMemoryMemoryStore(user_md="偏好 cartesian 主题", memory_md="")
    reg, _ = load_skills()
    user = ScriptedUserPort(queue=["研究生"])
    tools = {
        "make_lecture": MakeLectureTool(llm, store, options=GeneratorOptions(plan_perspectives=1)),
        "view_scene": ViewSceneTool(store),
        "skill_view": SkillViewTool(reg),
        "evaluate": EvaluateTool(store),
        "clarify": ClarifyTool(user),
    }
    res = await run_shell(
        llm, user_request="给我做一份关于梯度下降的讲义", tools=tools, registry=reg,
        memory=memory, budget=LoopBudget(max_rounds=8),
    )
    return res, store, user


async def test_shell_runs_expected_tool_sequence(tmp_path) -> None:
    res, store, user = await _one_run(tmp_path)
    assert res.tool_sequence == ["clarify", "make_lecture", "evaluate"]
    assert res.final == "讲义已生成并通过体检。"
    assert user.asked == ["目标受众是谁？"]
    # deck 在库里、正文不在外壳终结文本里（观测遮蔽端到端）
    assert "梯度下降沿负梯度方向迭代" not in res.final
    assert len(store.load_deck("demo")["scenes"]) == 2


async def test_shell_is_replay_deterministic(tmp_path) -> None:
    p1, p2 = tmp_path / "a", tmp_path / "b"
    r1, s1, _ = await _one_run(p1)
    r2, s2, _ = await _one_run(p2)
    assert r1.tool_sequence == r2.tool_sequence
    assert r1.final == r2.final
    assert r1.memory_snapshot == r2.memory_snapshot  # 同快照指纹
    assert s1.load_deck("demo") == s2.load_deck("demo")  # 同 deck，逐字段一致
