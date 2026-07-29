"""FakeSandbox —— 受限 in-process 执行，实现 ports.Sandbox。供 replay/测试的确定实现。

安全 & 确定的关键：只给一小撮安全 builtins、**不放 __import__**（脚本无法 import time/random/os
→ 无时间/随机/文件/网络 → 确定、无副作用）。工具句柄经 dispatch 回调 host（在事件循环上执行）。
脚本在线程里跑，工具调用用 run_coroutine_threadsafe 回主 loop——主 loop 不被阻塞。
"""

from __future__ import annotations

import asyncio
import builtins
import io
from typing import Any

from ...ports.sandbox import Dispatch, SandboxResult
from ...ports.tool import ToolSpec

_ALLOWED = [
    "len", "range", "str", "int", "float", "bool", "list", "dict", "tuple", "set",
    "enumerate", "zip", "sum", "min", "max", "sorted", "abs", "round", "map", "filter",
    "any", "all", "reversed", "repr", "isinstance", "getattr", "hasattr",
]
_SAFE_BUILTINS = {n: getattr(builtins, n) for n in _ALLOWED}


class _API:
    """脚本里的 `tools` 对象：tools.<name>(**kwargs) → host 工具的返回串。"""


class FakeSandbox:
    async def run(self, script: str, tools: list[ToolSpec], dispatch: Dispatch) -> SandboxResult:
        loop = asyncio.get_running_loop()
        buf = io.StringIO()

        def _call(name: str, kwargs: dict[str, Any]) -> str:
            fut = asyncio.run_coroutine_threadsafe(dispatch(name, kwargs), loop)
            return fut.result(timeout=120)

        api = _API()
        for spec in tools:
            nm = spec["name"]
            setattr(api, nm, (lambda n: (lambda **kw: _call(n, kw)))(nm))

        safe = dict(_SAFE_BUILTINS)
        safe["print"] = lambda *a, **k: builtins.print(*a, **{**k, "file": buf})
        g: dict[str, Any] = {"__builtins__": safe, "tools": api}

        def _run() -> None:
            exec(compile(script, "<execute_code>", "exec"), g)  # noqa: S102 - 受限命名空间，无 import

        try:
            await asyncio.to_thread(_run)
        except Exception as e:  # noqa: BLE001 - 脚本错误当观察回给模型
            return SandboxResult(stdout=buf.getvalue(), ok=False, error=f"{type(e).__name__}: {e}")
        return SandboxResult(stdout=buf.getvalue())
