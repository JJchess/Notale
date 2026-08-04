"""技能注册表 → 规划器路由菜单的守卫测试。

核心不变量（描述驱动路由的地基）：**每个能被规划器自动选中的组件家族，都必须有一条非空描述**——
描述就是「何时调用」的决策面；若新增一个 block 家族却没写好 description，它会对规划器不可见、
永远选不中（与 icons 静默归零同类的沉默回归）。这条断言就是那个防线（对应 harness/ 的 M-008）。
"""

from __future__ import annotations

from lecture_agent.domain.skills import (
    AUTO_EXCLUDE,
    load_skill_catalog,
    load_skills,
    lower_planning_placeholder,
    plan_menu,
)


def test_plan_menu_covers_every_auto_type_with_nonempty_desc() -> None:
    registry, planning = load_skill_catalog()
    menu = plan_menu(registry, planning)

    # 每条菜单项都有非空描述（守卫：加了组件不写描述 → 这里挂）。
    for skill, desc, types in menu:
        assert desc.strip(), f"skill {skill} 的描述为空——规划器将看不见 {types}"
        assert types, f"skill {skill} 在菜单里没有任何类型"

    # 菜单铺开后恰好等于 auto_types（不多不少），排除项确实没进来。
    flat = [t for _s, _d, types in menu for t in types]
    assert sorted(flat) == sorted(planning)
    assert not (set(flat) & AUTO_EXCLUDE)


def test_plan_menu_groups_types_under_their_skill() -> None:
    registry, planning = load_skill_catalog()
    menu = plan_menu(registry, planning)
    by_skill = {skill: types for skill, _d, types in menu}
    # create-content 是家族级：多个类型共用一条描述，应归在同一项下。
    assert "create-content" in by_skill
    assert {"list", "table"} <= set(by_skill["create-content"])
    assert "flow" not in by_skill["create-content"]
    assert {"diagram", "graph", "flow", "timeline"} == set(by_skill["create-diagram"])
    # 每个 skill 只出现一次（真的分组了，没重复行）。
    skills = [skill for skill, _d, _t in menu]
    assert len(skills) == len(set(skills))


def test_desc_tail_boilerplate_trimmed() -> None:
    registry, planning = load_skill_catalog()
    menu = plan_menu(registry, planning)
    for _skill, desc, _types in menu:
        assert "Produces schema-valid" not in desc


def test_skill_manifest_affordances_are_exposed_to_planner() -> None:
    registry, planning = load_skill_catalog()
    assert "state-transition" in registry["sim"].affordances
    assert "trace" in registry["sim"].learner_actions
    assert "intermediate-state" in registry["sim"].evidence_outputs
    assert "implement" in registry["runnable"].learner_actions
    by_type = {
        block_type: desc
        for _skill, desc, types in plan_menu(registry, planning)
        for block_type in types
    }
    assert "sim" not in by_type
    assert "Evidence outputs:" in by_type["state-sim"]
    assert "intermediate states" in by_type["state-sim"]
    assert {"state-sim", "model-sim", "geometry-sim"} <= set(by_type)
    assert "code-execution" in by_type["runnable"]


def test_planning_sim_capabilities_lower_to_one_final_owner() -> None:
    registry, planning = load_skill_catalog()
    assert registry["sim"].skill == "create-sim"
    assert {
        planning[name].target_type for name in ("state-sim", "model-sim", "geometry-sim")
    } == {"sim"}
    assert planning["state-sim"].defaults == {"engine": "widget"}
    assert planning["geometry-sim"].defaults == {"engine": "widget"}
    lowered = lower_planning_placeholder(
        {"id": "avl", "type": "state-sim", "interactionBrief": {"stateModel": []}},
        planning,
    )
    assert lowered["type"] == "sim" and lowered["engine"] == "widget"
    assert lowered["_planningType"] == "state-sim" and lowered["_simProfile"] == "state"


def test_runnable_contract_has_no_quantity_cap() -> None:
    """runnable 的 contract(reg.contract,fan-out 时逐块注入,见 blocks.py:78)不得再带
    "deck 里最多几个/别过量"这类数量压制——这条抑制语句曾同时活在 planning.py(已被 D-008 删)
    和 skills/create-code-runtime/{SKILL.md,contracts.json}(D-008 漏删的第二处，S-014)。
    """
    registry, _ = load_skills()
    contract = str(registry["runnable"].contract)
    for banned in ("0-2", "别过量"):
        assert banned not in contract, f"runnable 契约仍带数量压制词: {banned}"
