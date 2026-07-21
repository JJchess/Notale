"""主题注册表 → 规划器主题选单的守卫测试(对齐 test_registry.py 的双向断言)。

核心不变量:**每个 Theme 枚举成员都必须在 THEME_DESCS 里有一条非空描述**——描述就是模型"选哪个主题"
的决策面;若加了枚举成员却漏写描述,它会在选单里缺席、模型永远选不中(与 icons 静默归零同类的沉默回归)。
另一条:去偏后的规划器 prompt 不得再出现被删的方向驱动句(点名默认/学科绑定)。对应 harness/ 的 M-009。
"""

from __future__ import annotations

from lecture_agent.domain.planning import _skeleton_spec
from lecture_agent.domain.skills import load_skills, plan_menu
from lecture_agent.domain.themes import THEME_DESCS, theme_menu
from lecture_agent.schema.enums import Theme


def test_theme_descs_biject_enum() -> None:
    # 双向:THEME_DESCS 与 Theme 枚举一一对应,不多不少(加枚举漏描述 → 这里挂)。
    assert set(THEME_DESCS) == set(Theme)


def test_theme_menu_nonempty_and_lists_all() -> None:
    menu = theme_menu()
    assert {v for v, _ in menu} == {t.value for t in Theme}
    for v, line in menu:
        assert line.strip(), f"主题 {v} 描述为空——规划器将看不见它"


def test_skeleton_prompt_lists_all_themes_and_drops_bias_patch() -> None:
    spec = _skeleton_spec(8, plan_menu(load_skills()[0]), "", theme_menu(), "", "AUTH")
    # ① 全部主题名都在 prompt 里(防菜单/骨架示例再次脱节)。
    for t in Theme:
        assert t.value in spec, f"主题 {t.value} 未出现在骨架 prompt 里"
    # ② 不再含被删的方向驱动句(点名默认某主题 / 学科绑定)。
    for banned in ("别总默认", "研究公报", "别选 lab", "理工实验", "密集文本/考据"):
        assert banned not in spec, f"方向驱动/学科偏向措辞未清除: {banned}"


def test_user_theme_hint_overrides_menu() -> None:
    # 用户显式指定主题时仍优先展示"用户指定主题",既有行为不变。
    spec = _skeleton_spec(8, plan_menu(load_skills()[0]), "lab", theme_menu(), "", "AUTH")
    assert "用户指定主题: lab" in spec
