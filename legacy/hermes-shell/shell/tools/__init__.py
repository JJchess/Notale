"""agent.tools —— 外壳可调用的阶段级工具（均实现 ports.Tool，构造注入 port）。

铁律：每个工具只回**摘要/引用**字符串，deck 本体常驻 CorpusStore、不进上下文窗口；
需要具体内容时模型显式调 view_scene/view_block 按需拉片（观测遮蔽，见 domain.context.mask）。
纯工具 CalcTool 仍住 domain/tools/（无 I/O）。
"""

from .clarify import ClarifyTool
from .code_exec import ExecuteCodeTool
from .evaluate import EvaluateTool
from .make import MakeLectureTool
from .propose import ProposeSkillTool
from .recall import RecallTool
from .remember import RememberTool
from .render import RenderTool
from .revise import ReviseBlockTool, ReviseSceneTool
from .skill_view import SkillViewTool
from .view import ViewBlockTool, ViewSceneTool

__all__ = [
    "MakeLectureTool",
    "ViewSceneTool",
    "ViewBlockTool",
    "SkillViewTool",
    "EvaluateTool",
    "ClarifyTool",
    "ReviseBlockTool",
    "ReviseSceneTool",
    "RenderTool",
    "RememberTool",
    "RecallTool",
    "ExecuteCodeTool",
    "ProposeSkillTool",
]
