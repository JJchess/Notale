"""P8 · PTC/execute_code：多步链一个 turn、只回 stdout；FakeSandbox 确定且禁 import；
SubprocessSandbox 真进程 + 文件 RPC 回调 host。"""

from __future__ import annotations

import json
from typing import Any

from lecture_agent.adapters.sandbox import FakeSandbox, SubprocessSandbox
from lecture_agent.shell.tools import ExecuteCodeTool

_SPEC = [{"name": "recall", "description": "", "parameters": {"type": "object", "properties": {}}}]


async def _echo_dispatch(name: str, args: dict[str, Any]) -> str:
    return f"R:{name}:{args.get('x')}"


class _EchoTool:
    def __init__(self, name: str) -> None:
        self._n = name

    @property
    def spec(self) -> dict[str, Any]:
        return {"name": self._n, "description": "echo", "parameters": {"type": "object", "properties": {}}}

    async def run(self, args: dict[str, Any]) -> str:
        return f"[{self._n}] " + json.dumps(args, ensure_ascii=False)


# ---- FakeSandbox（确定核心）----

async def test_fake_sandbox_multistep_only_stdout() -> None:
    sb = FakeSandbox()
    script = "a = tools.recall(x='1')\nb = tools.recall(x='2')\nprint('final', a, b)"
    res = await sb.run(script, _SPEC, _echo_dispatch)
    assert res.ok
    assert res.stdout.strip() == "final R:recall:1 R:recall:2"  # 只有 print 的回来


async def test_fake_sandbox_blocks_import_and_is_deterministic() -> None:
    sb = FakeSandbox()
    bad = await sb.run("import os\nprint(os.getpid())", _SPEC, _echo_dispatch)
    assert not bad.ok and "import" in bad.error.lower()  # 无 __import__ → 无时间/随机/文件 → 确定
    s = "print(sum(range(5)))"
    r1 = await sb.run(s, _SPEC, _echo_dispatch)
    r2 = await sb.run(s, _SPEC, _echo_dispatch)
    assert r1.stdout == r2.stdout == "10\n"


# ---- execute_code 工具白名单 ----

async def test_execute_code_whitelist_blocks_side_effect_tools() -> None:
    base = {"recall": _EchoTool("recall"), "remember": _EchoTool("remember")}
    tool = ExecuteCodeTool(FakeSandbox(), base)
    ok = await tool.run({"script": "print(tools.recall(x='hi'))"})
    assert "[recall]" in ok
    # remember 不在 SANDBOX_ALLOWED → 沙箱里根本没有该句柄 → 报错
    blocked = await tool.run({"script": "print(tools.remember(x='hi'))"})
    assert "沙箱错误" in blocked


# ---- SubprocessSandbox（真进程 + 文件 RPC）----

async def test_subprocess_sandbox_smoke() -> None:
    res = await SubprocessSandbox(timeout_s=30).run("print('hi-subproc')", [], _echo_dispatch)
    assert res.ok, res.error
    assert "hi-subproc" in res.stdout


async def test_subprocess_sandbox_tool_rpc_roundtrip() -> None:
    async def served(name: str, args: dict[str, Any]) -> str:
        return f"served:{name}:{args.get('x')}"

    res = await SubprocessSandbox(timeout_s=30).run("print(tools.recall(x='7'))", _SPEC, served)
    assert res.ok, res.error
    assert "served:recall:7" in res.stdout
