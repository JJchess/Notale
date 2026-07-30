"""分层规划:大页数 → 大纲 + 逐章并发 → 拼接;小页数仍走单次骨架(阈值回归)。

确定性(FakeClient by_purpose),零成本。钉死:分层触发条件、页数可达、封面唯一、分隔页、id 已清。
"""

from __future__ import annotations

import json

from lecture_agent.adapters.llm.fake import FakeClient
from lecture_agent.domain.planning import _HIER_THRESHOLD, plan_lecture

_TYPE_MENU = [("core", "常规讲解", ["list", "statement", "callout", "quiz", "hero"])]
_THEME_MENU = [("slate", "冷静"), ("cartesian", "朴素")]

_OUTLINE = json.dumps(
    {
        "title": "数据结构大纲",
        "subtitle": "线性与半线性",
        "theme": "slate",
        "tutor": {"suggestions": ["什么是栈？"], "kb": [{"pattern": "栈|stack", "answer": "LIFO"}]},
        "sections": [
            {"title": f"章{i}", "thesis": "本章主旨", "pageBudget": 6, "mustCover": ["要点"]}
            for i in range(6)
        ],
    }
)
_SECTION = json.dumps(
    {
        "scenes": [
            {"kind": "content", "headline": f"页{i}", "blocks": [{"type": "list", "intent": "x"}]}
            for i in range(6)
        ]
    }
)
# 单次骨架路径用（pages 小）：一份 4 页合法骨架
_SKELETON = json.dumps(
    {
        "id": "demo",
        "title": "演示",
        "theme": "cartesian",
        "scenes": [
            {"kind": "hero", "blocks": [{"type": "hero", "intent": "封面"}]},
            {"kind": "content", "headline": "一", "blocks": [{"type": "list", "intent": "x"}]},
            {"kind": "content", "headline": "二", "blocks": [{"type": "statement", "intent": "y"}]},
            {"kind": "quiz", "headline": "测", "blocks": [{"type": "quiz", "intent": "z"}]},
        ],
    }
)


async def test_hierarchical_triggers_and_reaches_target_pages() -> None:
    llm = FakeClient(by_purpose={"plan:outline": _OUTLINE, "plan:section": _SECTION})
    res = await plan_lecture(
        llm,
        topic="数据结构",
        pages=40,
        type_menu=_TYPE_MENU,
        theme_menu=_THEME_MENU,
        authoring_rules="",
        concurrency=4,
    )
    purposes = [p for p, _ in llm.calls]
    assert "plan:outline" in purposes  # 分层路径确实触发
    assert purposes.count("plan:section") == 6  # 6 章各一次（并发）
    assert "plan:skeleton" not in purposes  # 没走单次骨架

    scenes = res.doc["scenes"]
    # 远超单次的 ~15 页天花板、且接近目标（6 章 × (分隔+6) + 封面）
    assert len(scenes) >= 30
    assert sum(1 for s in scenes if s.get("kind") == "hero") == 1  # 封面唯一
    assert sum(1 for s in scenes if s.get("kind") == "section") == 6  # 每章一分隔页
    # id 已清（交给 engine 统一重编号，避免跨章撞 id）
    assert all("id" not in s for s in scenes)
    assert all("id" not in b for s in scenes for b in (s.get("blocks") or []))
    # 主题/tutor 从大纲带出
    assert res.doc["theme"] == "slate"
    assert "tutor" in res.doc


async def test_small_pages_stay_single_shot() -> None:
    assert 12 <= _HIER_THRESHOLD  # 12 页应在阈值内
    llm = FakeClient(by_purpose={"plan:skeleton": _SKELETON})
    res = await plan_lecture(
        llm,
        topic="演示",
        pages=12,
        type_menu=_TYPE_MENU,
        theme_menu=_THEME_MENU,
        authoring_rules="",
    )
    purposes = [p for p, _ in llm.calls]
    assert "plan:skeleton" in purposes  # 单次骨架路径
    assert "plan:outline" not in purposes  # 不触发分层
    assert len(res.doc["scenes"]) == 4
