from pathlib import Path

from notale.roles.profiles import BUILDER, PLANNER


def test_only_two_roles_exist_and_have_plain_tool_names():
    assert PLANNER.allowed_tools == ["plan", "pages", "block"]
    assert BUILDER.allowed_tools == [
        "read_page", "edit_page", "inspect_page", "submit_page", "block", "run_js",
        "find_image", "make_image", "make_backplate", "create_widget",
        "create_code_runtime",
    ]


def test_builder_has_no_page_skill_injection_surface():
    assert "skill" not in BUILDER.allowed_tools
    assert PLANNER.skill_policy.shared == ()
    assert BUILDER.skill_policy.shared == ()
    assert BUILDER.skill_policy.page == ()


def test_natural_capability_selection_is_part_of_role_contracts():
    assert "不是待覆盖清单" in PLANNER.system_prompt
    assert "学习目标本身要求编写、运行或调试代码" in PLANNER.system_prompt
    assert "整书视觉证据检查" in PLANNER.system_prompt
    assert "这不是图片数量配额" in PLANNER.system_prompt
    assert "返回的准确本地 `htmlSrc` 实际用于页面" in BUILDER.system_prompt


def test_researcher_runtime_files_are_gone():
    root = Path(__file__).resolve().parents[1]
    for relative in (
        "agents/research.py", "roles/research.md", "tools/fetch_web.py",
        "tools/retriever.py", "core/evidence.py", "skills/web-access/SKILL.md",
    ):
        assert not (root / relative).exists()
