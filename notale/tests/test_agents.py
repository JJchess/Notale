"""Role contracts and externally supplied Research tools stay narrow and deterministic."""

import json

from openharness.tools.base import ToolResult

from notale.roles.authoring import LECTURE_AUTHORING
from notale.roles.profiles import BUILDER, PLANNER, RESEARCH
from notale.tools.fetch_web import (
    FetchWebInput,
    FetchWebTool,
    SearchWebInput,
    SearchWebTool,
)
from notale.tools.retriever import FakeRetriever
from notale.utils.config import get_config


async def test_search_and_fetch_budgets_count_failed_attempts(tmp_path):
    class FakeSearch:
        async def execute(self, arguments, context):
            del context
            return ToolResult(output=f"URL: https://ref/{arguments.query}")

    state = tmp_path / "tool-state.json"
    search = SearchWebTool(state_path=state, max_requests=1, inner=FakeSearch())
    first = await search.execute(SearchWebInput(query="sorting"), None)  # type: ignore[arg-type]
    second = await search.execute(SearchWebInput(query="retry"), None)  # type: ignore[arg-type]
    assert not first.is_error and "searchAttemptsRemaining=0" in first.output
    assert second.is_error and "额度已用完" in second.output

    fetch = FetchWebTool(FakeRetriever(), state_path=state, max_requests=2)
    failed1 = await fetch.execute(FetchWebInput(url="https://missing/1"), None)  # type: ignore[arg-type]
    failed2 = await fetch.execute(FetchWebInput(url="https://missing/2"), None)  # type: ignore[arg-type]
    blocked = await fetch.execute(FetchWebInput(url="https://missing/3"), None)  # type: ignore[arg-type]
    assert failed1.is_error and failed2.is_error and blocked.is_error
    saved = json.loads(state.read_text())
    assert saved["webSearchAttempts"] == 1 and saved["fetchAttempts"] == 2


def test_authoring_profile_is_system_level_and_auditable():
    assert PLANNER.skills == ["curriculum-planning", "frontend-slides"]
    assert PLANNER.system_profiles == ()
    assert PLANNER.system_profile_metadata() == []
    rendered_planner = PLANNER.rendered_system_prompt()
    assert "课程学习架构与证据路由" in rendered_planner
    assert "正式讲义" not in rendered_planner

    assert BUILDER.system_profiles == (LECTURE_AUTHORING,)
    rendered_builder = BUILDER.rendered_system_prompt()
    assert "正式讲义" in rendered_builder and "静默出版编辑" in rendered_builder
    assert "唯一状态源" in rendered_builder and "不得手工伪造教学状态" in rendered_builder
    assert BUILDER.system_profile_metadata() == [{
        "name": "lecture-authoring",
        "version": "3",
        "sha256": LECTURE_AUTHORING.sha256,
    }]


def test_roles_share_emergency_ceilings_and_protocol():
    for role in (PLANNER, BUILDER):
        assert role.max_tokens == 128000
        assert role.request_timeout_sec == 600
        assert role.max_provider_attempts == 2
        assert role.version == "8"


def test_role_skill_and_tool_surfaces_come_from_config():
    config = get_config()
    assert BUILDER.skills == config.agents.builder_skills
    assert len(BUILDER.skills) == 10
    assert "frontend-slides" in BUILDER.skills
    assert "frontend-design" not in BUILDER.skills
    assert "design-taste-frontend" not in BUILDER.skills
    assert RESEARCH.skills == ["research-evidence", "web-access"]
    assert {"web_search", "fetch_web"}.issubset(RESEARCH.allowed_tools)
    assert not any(name.startswith("scratch_") for name in BUILDER.allowed_tools)
