from pathlib import Path

from notale.roles.profiles import BUILDER, PLANNER


def test_only_two_roles_exist_and_have_plain_tool_names():
    assert PLANNER.allowed_tools == ["plan", "pages", "block"]
    assert BUILDER.allowed_tools == [
        "read_page", "edit_page", "submit_page", "block", "run_js", "find_image", "make_image"
    ]


def test_builder_skills_are_assignment_policies_not_runtime_loader():
    assert "skill" not in BUILDER.allowed_tools
    assert PLANNER.skill_policy.shared == ()
    assert BUILDER.skill_policy.shared == ()
    assert BUILDER.skill_policy.page == ("create-sim", "create-code-runtime")


def test_researcher_runtime_files_are_gone():
    root = Path(__file__).resolve().parents[1]
    for relative in (
        "agents/research.py", "roles/research.md", "tools/fetch_web.py",
        "tools/retriever.py", "core/evidence.py", "skills/web-access/SKILL.md",
    ):
        assert not (root / relative).exists()
