"""SubprocessSandbox —— 真进程隔离 + **文件 RPC**，实现 ports.Sandbox（跨平台，含 Windows）。

脚本在独立 Python 进程里跑（不碰父内存），只经落盘的 req/resp 文件回调 host 工具（父侧异步轮询分发）。
只有子进程 stdout 回到对话。env 清洗掉 *KEY*/*TOKEN*/*SECRET*；有调用数/超时上限。
注：子进程能跑任意 Python（时间/随机/文件），故**非确定**——实验/replay 请改注入 FakeSandbox。
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path

from ...ports.sandbox import Dispatch, SandboxResult
from ...ports.tool import ToolSpec

_STUB = '''
import json, os, time
class _Tools:
    def __getattr__(self, name):
        def _call(**kwargs):
            rid = "%s_%d" % (name, time.time_ns())
            with open(rid + ".req", "w", encoding="utf-8") as f:
                json.dump({"name": name, "args": kwargs}, f, ensure_ascii=False)
            for _ in range(12000):
                if os.path.exists(rid + ".resp"):
                    with open(rid + ".resp", encoding="utf-8") as f:
                        return json.load(f)["result"]
                time.sleep(0.01)
            raise TimeoutError("rpc timeout: " + name)
        return _call
tools = _Tools()
'''


def _scrub_env() -> dict[str, str]:
    bad = ("KEY", "TOKEN", "SECRET", "PASSWORD", "CREDENTIAL")
    return {k: v for k, v in os.environ.items() if not any(b in k.upper() for b in bad)}


async def _serve_rpc(rpcdir: Path, dispatch: Dispatch, proc: asyncio.subprocess.Process, max_calls: int) -> None:
    seen: set[str] = set()
    calls = 0
    while proc.returncode is None and calls < max_calls:
        for req in sorted(rpcdir.glob("*.req")):
            if req.name in seen:
                continue
            seen.add(req.name)
            calls += 1
            try:
                data = json.loads(req.read_text(encoding="utf-8"))
                result = await dispatch(str(data["name"]), dict(data.get("args", {})))
            except Exception as e:  # noqa: BLE001
                result = f"ERROR: {type(e).__name__}: {e}"
            (rpcdir / (req.stem + ".resp")).write_text(
                json.dumps({"result": result}, ensure_ascii=False), encoding="utf-8"
            )
        await asyncio.sleep(0.01)


class SubprocessSandbox:
    def __init__(self, *, timeout_s: float = 90.0, max_calls: int = 64) -> None:
        self._timeout_s = timeout_s
        self._max_calls = max_calls

    async def run(self, script: str, tools: list[ToolSpec], dispatch: Dispatch) -> SandboxResult:
        with tempfile.TemporaryDirectory(prefix="hermes_rpc_") as d:
            rpcdir = Path(d)
            main = rpcdir / "_main.py"
            main.write_text(_STUB + "\n" + script, encoding="utf-8")
            proc = await asyncio.create_subprocess_exec(
                sys.executable, "-I", str(main),
                cwd=str(rpcdir), env=_scrub_env(),
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            server = asyncio.create_task(_serve_rpc(rpcdir, dispatch, proc, self._max_calls))
            try:
                out_b, err_b = await asyncio.wait_for(proc.communicate(), timeout=self._timeout_s)
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
                server.cancel()
                return SandboxResult(stdout="", ok=False, error=f"沙箱超时（>{self._timeout_s}s）")
            server.cancel()
            out = out_b.decode("utf-8", "replace")
            err = err_b.decode("utf-8", "replace")
            ok = proc.returncode == 0
            return SandboxResult(stdout=out, ok=ok, error="" if ok else err.strip()[-800:])
