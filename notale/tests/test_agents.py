"""Role documents and externally supplied Research tools stay narrow."""

import json
from pathlib import Path

import pytest
from openharness.tools.base import ToolResult

from notale.roles.loader import load_role
from notale.roles.profiles import BUILDER, INTAKE, PLANNER, RESEARCH
from notale.tools.fetch_web import (
    FetchWebInput,
    FetchWebTool,
    SearchWebInput,
    SearchWebTool,
)
from notale.tools.retriever import FakeRetriever


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


def test_permanent_policies_are_markdown_role_contracts():
    assert PLANNER.authorized_skills == []
    rendered_planner = PLANNER.rendered_system_prompt()
    assert "课程学习架构" in rendered_planner
    assert "Builder skill routing" in rendered_planner
    assert "正式讲义" not in rendered_planner

    rendered_builder = BUILDER.rendered_system_prompt()
    assert "正式讲义" in rendered_builder and "静默做一次出版编辑" in rendered_builder
    assert "交互状态必须由真实领域模型计算产生" in rendered_builder
    for role in (INTAKE, RESEARCH, PLANNER, BUILDER):
        metadata = role.document_metadata()
        assert Path(metadata["path"]).name == f"{role.name}.md"
        assert len(metadata["sha256"]) == 64


def test_roles_share_emergency_ceilings_and_hashed_protocol():
    for role in (PLANNER, BUILDER):
        assert role.max_tokens == 128000
        assert role.request_timeout_sec == 600
        assert role.max_provider_attempts == 2
        assert role.version.startswith("12:")


def test_role_skill_and_tool_surfaces_come_from_role_documents():
    assert BUILDER.skill_policy.shared == ("narrative-keynote",)
    assert BUILDER.skill_policy.page == ("create-sim", "create-code-runtime")
    assert BUILDER.authorized_skills == [
        "narrative-keynote", "create-sim", "create-code-runtime",
    ]
    assert BUILDER.allowed_tools[:5] == [
        "skill_read", "context_read", "acquire_media", "generate_media", "submit_page",
    ]
    assert "page_write" not in BUILDER.allowed_tools
    assert "check_page" not in BUILDER.allowed_tools
    assert RESEARCH.skill_policy.assignable == ("web-access",)
    assert INTAKE.authorized_skills == [] and PLANNER.authorized_skills == []
    assert "skill_read" not in INTAKE.allowed_tools
    assert "skill_read" not in PLANNER.allowed_tools
    assert {"web_search", "fetch_web"}.issubset(RESEARCH.allowed_tools)
    assert not any(name.startswith("scratch_") for name in BUILDER.allowed_tools)


@pytest.mark.parametrize(
    ("frontmatter", "message"),
    [
        ("name: test\ntools: []\nunknown: true", "Extra inputs"),
        (
            "name: test\ntools: [skill_read]\nskills:\n  shared: [web-access]\n  page: [web-access]",
            "groups overlap",
        ),
        (
            "name: test\ntools: []\nskills:\n  assignable: [web-access]",
            "skill_read must be present",
        ),
    ],
)
def test_role_loader_fails_closed(tmp_path: Path, frontmatter: str, message: str):
    path = tmp_path / "test.md"
    path.write_text(f"---\n{frontmatter}\n---\n\nRole body", encoding="utf-8")
    with pytest.raises(ValueError, match=message):
        load_role(path)


def test_role_body_hash_is_part_of_checkpoint_version(tmp_path: Path):
    path = tmp_path / "test.md"
    path.write_text("---\nname: test\ntools: []\n---\n\nFirst body", encoding="utf-8")
    first = load_role(path)
    path.write_text("---\nname: test\ntools: []\n---\n\nSecond body", encoding="utf-8")
    second = load_role(path)

    assert first.document_sha256 != second.document_sha256
    assert first.version != second.version
