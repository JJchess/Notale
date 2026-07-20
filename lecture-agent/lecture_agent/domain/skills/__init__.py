"""domain.skills —— 技能/契约注册表（加一个文件夹=加一个 block 家族）。对应旧 src/skills.mjs。"""

from .authoring import AUTHORING_RULES
from .registry import AUTO_EXCLUDE, SkillEntry, default_skills_dir, load_skills, plan_menu

__all__ = [
    "AUTHORING_RULES",
    "AUTO_EXCLUDE",
    "SkillEntry",
    "default_skills_dir",
    "load_skills",
    "plan_menu",
]
