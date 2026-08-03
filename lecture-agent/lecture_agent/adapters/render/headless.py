"""HeadlessVerifier —— 真机无头浏览器渲染验收，实现 ports.RenderVerifier。

驱动仓库根的 `tools/render-check.mjs`（零依赖：Node 内置 fetch/WebSocket + 系统 Edge/Chrome，
不引入 playwright/puppeteer）。它把 doc 喂给 viewer/app.html?doc=，逐页断言：

    A 分页数 >0        B 0 条 console error      C 字体全部 loaded
    D 0 横向溢出       E balanceScene 规则生效    F 0 纵向溢出（内容被裁）
    G 0 公式被裁       H 0 文本损坏标记           I 自定义版式 0 内容裁切

这正是 SPEC §「无头/预览验收：每页 scrollHeight ≤ 720、控制台无错」那条线——
此前 SPEC 写着但**没有任何东西在执行**，生成流水线是一条无视觉反馈的盲管线。

浏览器缺失/Node 缺失时返回 ok=True 并附 warning（**不**把 CI/离线环境判死），
真出了渲染问题会在有浏览器的机器上被拦住。
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any

from ...ports.renderer import RenderReport

# lecture_agent/adapters/render/headless.py → 仓库根
_REPO = Path(__file__).resolve().parents[4]
_SCRIPT = _REPO / "tools" / "render-check.mjs"
_TIMEOUT_S = 300.0


class HeadlessVerifier:
    """真机渲染验收。shot_dir 非空时同时截图落盘（回炉证据 / 人工视觉评审）。"""

    def __init__(self, shot_dir: str | os.PathLike[str] | None = None, timeout_s: float = _TIMEOUT_S) -> None:
        self.shot_dir = Path(shot_dir) if shot_dir else None
        self.timeout_s = timeout_s

    async def verify(self, html: str) -> RenderReport:
        node = shutil.which("node")
        if not node:
            return RenderReport(ok=True, warnings=["未找到 node，跳过真机渲染验收"])
        if not _SCRIPT.exists():
            return RenderReport(ok=True, warnings=[f"未找到 {_SCRIPT}，跳过真机渲染验收"])
        try:
            json.loads(html)
        except json.JSONDecodeError as e:
            return RenderReport(ok=False, errors=[f"JSON 解析失败: {e}"])

        # 写临时 doc：render-check 的 --doc 支持仓库外绝对路径（虚拟挂载），不必拷进仓库
        tmp = Path(tempfile.mkdtemp(prefix="la-verify-")) / "doc.lecture.json"
        tmp.write_text(html, encoding="utf-8")
        argv = [node, str(_SCRIPT), "--doc", str(tmp), "--json"]
        if self.shot_dir:
            self.shot_dir.mkdir(parents=True, exist_ok=True)
            argv += ["--shot", "--shot-dir", str(self.shot_dir)]
        try:
            return await self._run(argv)
        finally:
            shutil.rmtree(tmp.parent, ignore_errors=True)

    async def _run(self, argv: list[str]) -> RenderReport:
        try:
            proc = await asyncio.create_subprocess_exec(
                *argv, cwd=str(_REPO),
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            out, err = await asyncio.wait_for(proc.communicate(), timeout=self.timeout_s)
        except TimeoutError:
            return RenderReport(ok=False, errors=[f"真机渲染验收超时（>{self.timeout_s:.0f}s）"])
        except OSError as e:
            return RenderReport(ok=True, warnings=[f"无法启动渲染验收进程，跳过: {e}"])

        payload = _last_json_line(out.decode("utf-8", "replace"))
        if payload is None:
            tail = err.decode("utf-8", "replace").strip()[-400:]
            # 没有浏览器时脚本自己 exit 0 并打印提示——按「跳过」处理，不阻断生成
            if "找不到 Edge/Chrome" in tail:
                return RenderReport(ok=True, warnings=["本机无 Edge/Chrome，跳过真机渲染验收"])
            return RenderReport(ok=False, errors=[f"渲染验收未产出 JSON：{tail or '(无 stderr)'}"])

        return _to_report(payload)


def _last_json_line(stdout: str) -> dict[str, Any] | None:
    """取最后一行合法 JSON —— 容忍脚本前面夹带的人类日志。"""
    for line in reversed([ln.strip() for ln in stdout.splitlines() if ln.strip()]):
        if line.startswith("{"):
            try:
                value = json.loads(line)
                if isinstance(value, dict):
                    return value
            except json.JSONDecodeError:
                continue
    return None


def _to_report(payload: dict[str, Any]) -> RenderReport:
    errors: list[str] = []
    overflow: list[dict[str, Any]] = []
    corrupt: list[dict[str, Any]] = []
    metrics: list[dict[str, Any]] = []
    for doc in payload.get("docs") or []:
        errors.extend(doc.get("fails") or [])
        overflow.extend(doc.get("overflowPages") or [])
        corrupt.extend(doc.get("corruptPages") or [])
        metrics.extend(doc.get("pageMetrics") or [])
    return RenderReport(
        ok=bool(payload.get("ok")) and not errors,
        errors=errors,
        overflow_pages=overflow,
        corrupt_pages=corrupt,
        page_metrics=metrics,
        shots=list(payload.get("shots") or []),
    )
