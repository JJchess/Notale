"""P3 · 上下文工程纯函数 + 前缀缓存稳定系统提示。

支柱3 的地基：同输入 → 同系统提示**字节串**（KV-cache / cassette replay 命中）。
"""

from __future__ import annotations

from lecture_agent.shell.prompt import build_system_prompt
from lecture_agent.domain.context import (
    LoopBudget,
    build_skill_index,
    compact_plan,
    estimate_tokens,
    mask,
)
from lecture_agent.domain.skills import load_skills
from lecture_agent.ports.memory import MemorySnapshot


def test_build_skill_index_is_deterministic_and_ordered() -> None:
    reg, _ = load_skills()
    a = build_skill_index(reg)
    b = build_skill_index(reg)
    assert a == b  # 顺序稳定、无时间戳
    assert a.startswith("- ") and "：" in a


def test_system_prompt_byte_stable_and_ordered() -> None:
    snap = MemorySnapshot.of("偏好深色主题", "sim 留白")
    idx = "- create-sim（sim）：可交互模拟"
    tools = ["make_lecture", "view_scene", "evaluate"]
    p1 = build_system_prompt(snapshot=snap, skill_index=idx, tool_names=tools)
    p2 = build_system_prompt(snapshot=snap, skill_index=idx, tool_names=tools)
    assert p1 == p2  # 同输入同字节
    # 固定顺序：角色 → 工具 → 组件索引 → USER → MEMORY
    assert p1.index("可用工具") < p1.index("内容组件索引") < p1.index("讲者画像") < p1.index("制作笔记")
    assert "偏好深色主题" in p1 and "sim 留白" in p1


def test_empty_memory_snapshot_still_stable() -> None:
    snap = MemorySnapshot.of("", "")
    p = build_system_prompt(snapshot=snap, skill_index="", tool_names=["make_lecture"])
    assert "（暂无）" in p  # 空记忆占位，不塞入易变内容


def test_loop_budget_stop_reasons() -> None:
    b = LoopBudget(max_rounds=8, max_tool_calls=12, max_build_calls=2)
    assert b.stop_reason(rounds=0, tool_calls=0, build_calls=0) is None
    assert "轮次" in b.stop_reason(rounds=8, tool_calls=0, build_calls=0)
    assert "make_lecture" in b.stop_reason(rounds=0, tool_calls=0, build_calls=2)


def test_compact_plan_folds_only_when_over_budget() -> None:
    small = [{"role": "user", "content": "hi"}] * 3
    assert compact_plan(small, window=1000, threshold=0.7)["compact"] is False
    big = [{"role": "user", "content": "x" * 4000}] * 40
    plan = compact_plan(big, window=1000, threshold=0.7, keep_last=6)
    assert plan["compact"] is True
    assert len(plan["keep"]) == 6 and len(plan["fold"]) == 34
    assert estimate_tokens("x" * 400) == 100


def test_mask_short_passthrough_long_fold() -> None:
    assert mask("short") == "short"
    assert "已折叠" in mask("y" * 900, ref="r")
