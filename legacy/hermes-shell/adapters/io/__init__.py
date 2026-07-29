"""adapters.io —— UserPort 的两实现：交互式 CLI / 脚本化 fixture（replay·测试）。"""

from .cli import CliUserPort
from .scripted import ScriptedUserPort

__all__ = ["CliUserPort", "ScriptedUserPort"]
