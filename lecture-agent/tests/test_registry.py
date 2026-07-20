"""技能注册表 → 规划器路由菜单的守卫测试。

核心不变量（描述驱动路由的地基）：**每个能被规划器自动选中的组件家族，都必须有一条非空描述**——
描述就是「何时调用」的决策面；若新增一个 block 家族却没写好 description，它会对规划器不可见、
永远选不中（与 icons 静默归零同类的沉默回归）。这条断言就是那个防线（对应 harness/ 的 M-008）。
"""

from __future__ import annotations

from lecture_agent.domain.skills import AUTO_EXCLUDE, load_skills, plan_menu


def test_plan_menu_covers_every_auto_type_with_nonempty_desc() -> None:
    registry, auto_types = load_skills()
    menu = plan_menu(registry)

    # 每条菜单项都有非空描述（守卫：加了组件不写描述 → 这里挂）。
    for skill, desc, types in menu:
        assert desc.strip(), f"skill {skill} 的描述为空——规划器将看不见 {types}"
        assert types, f"skill {skill} 在菜单里没有任何类型"

    # 菜单铺开后恰好等于 auto_types（不多不少），排除项确实没进来。
    flat = [t for _s, _d, types in menu for t in types]
    assert sorted(flat) == sorted(auto_types)
    assert not (set(flat) & AUTO_EXCLUDE)


def test_plan_menu_groups_types_under_their_skill() -> None:
    registry, _ = load_skills()
    menu = plan_menu(registry)
    by_skill = {skill: types for skill, _d, types in menu}
    # create-content 是家族级：多个类型共用一条描述，应归在同一项下。
    assert "create-content" in by_skill
    assert {"list", "flow", "table"} <= set(by_skill["create-content"])
    # 每个 skill 只出现一次（真的分组了，没重复行）。
    skills = [skill for skill, _d, _t in menu]
    assert len(skills) == len(set(skills))


def test_desc_tail_boilerplate_trimmed() -> None:
    registry, _ = load_skills()
    menu = plan_menu(registry)
    for _skill, desc, _types in menu:
        assert "Produces schema-valid" not in desc
