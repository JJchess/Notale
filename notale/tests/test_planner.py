import json
from pathlib import Path

import pytest

from notale.core.observability import EventLog
from notale.core.stages.contract import group_chapters, plan_lecture
from notale.tests.fake_llm import FakeClient
from notale.tools.agent_tools import PlanChapter


def _page(*, claim: str = "一个知识动作", links: list[dict] | None = None) -> dict:
    return {
        "type": "narrative-scene",
        "claim": claim,
        "learning_action": "解释这个动作",
        "narrative_role": "推进主线",
        "links": links or [],
        "skills": [],
        "tools": [],
    }


def _root(chapters: list[dict], chapter_pages: list[dict]) -> dict:
    return {
        "title": "软页数讲义",
        "language": "zh",
        "audience": "学习者",
        "throughline": "同一问题逐章变形",
        "chapters": chapters,
        "chapter_pages": chapter_pages,
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("actual_pages", [18, 22, 81])
async def test_page_request_is_only_a_hint_without_limit(
    tmp_path: Path, actual_pages: int
):
    chapters = [{
        "id": "whole",
        "title": "完整章节",
        "goal": "完成一条知识弧",
        "entry": "从问题进入",
        "payoff": "形成解释",
        "pages": 20,
    }]
    fixture = _root(
        chapters,
        [{"id": "whole", "pages": [_page(claim=f"动作 {i}") for i in range(actual_pages)]}],
    )
    client = FakeClient(by_purpose={"plan": json.dumps(fixture)})
    run_dir = tmp_path / str(actual_pages)
    run_dir.mkdir()

    plan = await plan_lecture(
        client,
        "请做一份20页讲义",
        run_dir=run_dir,
        logger=EventLog(run_dir),
    )

    assert len(plan.pages) == actual_pages
    assert plan.chapters[0].pages == actual_pages
    assert len(client.calls) == 1
    assert (run_dir / "skills" / plan.design.name / "SKILL.md").is_file()
    assert (run_dir / "skills" / plan.design.name / "tokens.json").is_file()
    assert not (run_dir / "llm-requests" / "planner-g1").exists()


def test_chapter_groups_are_greedy_whole_and_minimal():
    hints = [6, 7, 8, 25, 4, 16]
    chapters = [
        PlanChapter(
            id=f"c{index}",
            title=f"章 {index}",
            goal="目标",
            entry="入口",
            payoff="收束",
            pages=hint,
        )
        for index, hint in enumerate(hints, 1)
    ]

    groups = group_chapters(chapters)

    assert [[chapter.id for chapter in group] for group in groups] == [
        ["c1", "c2"], ["c3"], ["c4"], ["c5", "c6"]
    ]
    assert [sum(chapter.pages for chapter in group) for group in groups] == [
        13, 8, 25, 20
    ]


@pytest.mark.asyncio
async def test_hierarchical_groups_run_in_parallel_and_merge_symbolic_links(
    tmp_path: Path,
):
    chapters = [
        {
            "id": "c1", "title": "第一章", "goal": "建立问题",
            "entry": "看到现象", "payoff": "得到基线",
            "pages": 10,
        },
        {
            "id": "c2", "title": "第二章", "goal": "解释机制",
            "entry": "追问原因", "payoff": "获得机制",
            "pages": 10,
        },
        {
            "id": "c3", "title": "第三章", "goal": "检验边界",
            "entry": "制造反例", "payoff": "明确边界",
            "pages": 15,
        },
        {
            "id": "c4", "title": "第四章", "goal": "完成迁移",
            "entry": "换一个情境", "payoff": "形成方法",
            "pages": 8,
        },
    ]
    root = _root(chapters, [])
    back_c1 = [{
        "chapter": "c1", "anchor": "entry", "relation": "builds-on",
        "cue": "回到第一章基线",
    }]
    fixtures = {
        "plan": json.dumps(root, ensure_ascii=False),
        "plan:g1": json.dumps({"chapters": [
            {"id": "c1", "pages": [_page(claim="基线一"), _page(claim="基线二")]},
            {"id": "c2", "pages": [
                _page(claim="机制一", links=back_c1),
                _page(claim="机制二"),
                _page(claim="机制三"),
            ]},
        ]}, ensure_ascii=False),
        "plan:g2": json.dumps({"chapters": [
            {"id": "c3", "pages": [_page(claim="边界", links=[{
                "chapter": "c1", "anchor": "exit", "relation": "contrasts-with",
                "cue": "对照第一章结论",
            }])]},
        ]}, ensure_ascii=False),
        "plan:g3": json.dumps({"chapters": [
            {"id": "c4", "pages": [
                _page(claim="迁移一", links=[{
                    "chapter": "c2", "anchor": "entry", "relation": "returns-to",
                    "cue": "复用第二章机制",
                }]),
                _page(claim="迁移二"),
            ]},
        ]}, ensure_ascii=False),
    }
    client = FakeClient(by_purpose=fixtures, delay=0.03)

    plan = await plan_lecture(
        client,
        "一份很长、适合分级规划的讲义",
        run_dir=tmp_path,
        logger=EventLog(tmp_path),
    )

    assert client.peak_active == 3
    assert [chapter.id for chapter in plan.chapters] == ["c1", "c2", "c3", "c4"]
    assert [chapter.pages for chapter in plan.chapters] == [2, 3, 1, 2]
    assert plan.pages[2].links[0].target == 1
    assert plan.pages[5].links[0].target == 2
    assert plan.pages[6].links[0].target == 3
    assert (tmp_path / "plan.json").is_file()
    for agent in ("planner", "planner-g1", "planner-g2", "planner-g3"):
        assert (tmp_path / "llm-requests" / agent / "turn-0001.json").is_file()
    assert (tmp_path / "llm-requests" / "planner" / "turn-0002.json").is_file()
    group_request = json.loads(
        (tmp_path / "llm-requests" / "planner-g1" / "turn-0001.json").read_text()
    )
    assert "Run design Skill: pathways-field-guide" in (
        group_request["request"]["messages"][0]["content"]
    )

    events = [
        json.loads(line)
        for line in (tmp_path / "events.jsonl").read_text().splitlines()
    ]
    assert sum(event["kind"] == "planner.group.started" for event in events) == 3
    assert sum(event["kind"] == "planner.group.completed" for event in events) == 3
    timing = next(event for event in events if event["kind"] == "planner.plan.completed")
    assert timing["payload"]["slowest_group_ms"] > 0
    assert timing["payload"]["planning_wall_ms"] == (
        timing["payload"]["root_duration_ms"]
        + timing["payload"]["parallel_duration_ms"]
    )
