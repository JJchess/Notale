"""domain.tools —— 纯工具（无 I/O），实现 ports.Tool。有网络/沙箱的工具住 adapters/tools/。"""

from .calc import CalcTool

__all__ = ["CalcTool"]
