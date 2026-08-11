"""The two agent profiles in the Notale runtime."""

from pathlib import Path

from notale.roles.loader import load_role


_ROOT = Path(__file__).resolve().parent

PLANNER = load_role(_ROOT / "planner.md")
BUILDER = load_role(_ROOT / "builder.md")
