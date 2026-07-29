"""execute_code —— PTC/RPC：模型写 Python、经 tools.<name>(...) 调工具、只把 print 的 stdout 回灌。

价值：把"生成8张图→逐张校验→插入"这类多步链压进**一个 turn**，中间结果不进上下文（观测遮蔽的极致）。
沙箱内只放白名单只读/生成类工具（禁 clarify/remember/propose_skill/delegate/execute_code 自身，防副作用/递归）。
"""

from __future__ import annotations

from typing import Any

from ...domain.context import mask
from ...ports.sandbox import Sandbox
from ...ports.tool import Tool, ToolSpec

SANDBOX_ALLOWED = frozenset(
    {"make_lecture", "view_scene", "view_block", "skill_view", "evaluate", "render", "recall"}
)


class ExecuteCodeTool:
    def __init__(self, sandbox: Sandbox, base_tools: dict[str, Tool]) -> None:
        self._sandbox = sandbox
        self._base = base_tools  # 活引用；调用时过白名单

    @property
    def spec(self) -> ToolSpec:
        allowed = ", ".join(sorted(SANDBOX_ALLOWED))
        return {
            "name": "execute_code",
            "description": (
                "写一段 Python 并执行：用 tools.<名>(参数=...) 调工具，返回值是工具的字符串观察；"
                "只有你 print 出来的内容会回到对话。适合把多步工具链压成一个回合（省上下文）。"
                f"沙箱内可用工具：{allowed}。禁 import、无文件/网络。"
            ),
            "parameters": {
                "type": "object",
                "properties": {"script": {"type": "string", "description": "要执行的 Python 源码"}},
                "required": ["script"],
            },
        }

    async def run(self, args: dict[str, Any]) -> str:
        script = str(args.get("script", ""))
        if not script.strip():
            return "ERROR: 缺 script"
        allowed = {n: t for n, t in self._base.items() if n in SANDBOX_ALLOWED}

        async def dispatch(name: str, kwargs: dict[str, Any]) -> str:
            tool = allowed.get(name)
            if tool is None:
                return f"ERROR: 工具 '{name}' 不可在沙箱内调用"
            return await tool.run(kwargs)

        res = await self._sandbox.run(script, [t.spec for t in allowed.values()], dispatch)
        body = res.stdout or "(无 stdout 输出)"
        if not res.ok:
            body += f"\n[沙箱错误] {res.error}"
        return mask(body, ref="execute_code", limit=1500)
