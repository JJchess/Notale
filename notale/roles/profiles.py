"""Loaded role contracts. Markdown files are the only static prompt source."""

from __future__ import annotations

from pathlib import Path

from notale.roles.loader import load_role
from notale.utils.config import get_config


_ROOT = Path(__file__).resolve().parent

INTAKE = load_role(_ROOT / "intake.md")
RESEARCH = load_role(_ROOT / "research.md")
PLANNER = load_role(_ROOT / "planner.md")
BUILDER = load_role(_ROOT / "builder.md")

_CONFIG = get_config()
for _branch in _CONFIG.research.branches:
    _unknown = sorted(set(_branch.skills) - set(RESEARCH.skill_policy.assignable))
    if _unknown:
        raise ValueError(
            f"research branch {_branch.id} requests skills not authorized by "
            f"roles/research.md: {_unknown}"
        )
