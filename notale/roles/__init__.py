"""Declarative agent roles, prompts, and capability policies."""

from notale.roles.authoring import LECTURE_AUTHORING, SystemProfile
from notale.roles.base import RoleSpec
from notale.roles.profiles import BUILDER, INTAKE, PLANNER, RESEARCH

__all__ = [
    "BUILDER", "INTAKE", "LECTURE_AUTHORING", "PLANNER", "RESEARCH", "RoleSpec",
    "SystemProfile",
]
