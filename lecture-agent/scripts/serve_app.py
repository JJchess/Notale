"""端到端 Web App 服务端(L5 composition 脚本)。

把 viewer(静态)+ workflow(run_generation)接成一条链:
  浏览器 app.html → POST /api/generate{query} → 后台跑生成,progress 事件经 SSE /api/events 推出
  → 前端进度视图实时渲染 → done 事件带最终 doc → 前端亮出成片。

依赖可选组 `app`(aiohttp):`uv sync --extra app`。启动:
  uv run python scripts/serve_app.py            # 默认 llm=kimi_k2_7_code generator=full(真 live,需 key)
  #   （K3 待你在 SiliconFlow 给这把 key 开通后:--llm kimi_k3 即可,或把上面默认改回 kimi_k3）
  uv run python scripts/serve_app.py --llm replay  # 离线(仅命中已录制课题)

设计要点:
- 每 job 独立事件日志(history)+ 广播订阅(subscribers),SSE 连接原子地"先拷 history 再订阅",无丢无重。
- 生成调用经 app["run_one"] 注入,便于测试替身(见 tests)不碰真 LLM。
- 每 job 存到 experiments/app/<job>/,deck id 隔离,互不覆盖。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import uuid
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx
from aiohttp import web
from hydra import compose, initialize_config_dir
from lecture_agent.app.generate import run_generation
from lecture_agent.utils.env import load_env
from omegaconf import DictConfig, OmegaConf

ROOT = Path(__file__).resolve().parent.parent
CONFIGS = ROOT / "configs"
VIEWER = ROOT.parent / "viewer"


# ── job 模型:append-only 事件日志 + 广播 ─────────────────────────────────────────
class Job:
    def __init__(self) -> None:
        self.history: list[dict[str, Any]] = []
        self.subscribers: list[asyncio.Queue[dict[str, Any]]] = []
        self.doc: dict[str, Any] | None = None
        self.t0: float = 0.0

    def emit(self, evt: dict[str, Any]) -> None:
        """同步推事件:盖 t(自 job 起 ms)、入 history、广播给所有订阅者。progress 回调即调它。"""
        loop = asyncio.get_event_loop()
        evt = {**evt, "t": int((loop.time() - self.t0) * 1000)}
        self.history.append(evt)
        for q in self.subscribers:
            q.put_nowait(evt)


async def _default_run_one(
    cfg: DictConfig, out_root: Path, progress: Callable[[dict[str, Any]], None]
) -> dict[str, Any]:
    res = await run_generation(cfg, out_root=out_root, progress=progress)
    return res.doc


def _job_cfg(base: DictConfig, query: str, pages: int | None) -> DictConfig:
    """从基线 cfg 深拷一份,按 query 设 topic(照 cli.py:绕开 Hydra 中文 override 解析)。"""
    cfg: DictConfig = OmegaConf.create(OmegaConf.to_container(base, resolve=True))  # type: ignore[assignment]
    cfg.topic = query
    if pages:
        cfg.pages = int(pages)
    return cfg


async def _run_job(app: web.Application, job_id: str, query: str, pages: int | None) -> None:
    job: Job = app["jobs"][job_id]
    job.t0 = asyncio.get_event_loop().time()
    cfg = _job_cfg(app["base_cfg"], query, pages)
    out_root = ROOT / "experiments" / "app" / job_id
    try:
        doc = await app["run_one"](cfg, out_root, job.emit)
        job.doc = doc
        # engine 已发过 done(带 doc);但若替身/引擎没发,补一个兜底 done。
        if not any(e["type"] == "done" for e in job.history):
            job.emit({"type": "done", "doc": doc, "errors": 0, "dropped": 0})
    except Exception as e:  # noqa: BLE001 —— 生成失败要变成前端可读的 error 事件,绝不白屏
        job.emit({"type": "error", "message": f"{type(e).__name__}: {e}"})


# ── 路由 ─────────────────────────────────────────────────────────────────────
async def api_generate(request: web.Request) -> web.Response:
    body = await request.json()
    query = str(body.get("query", "")).strip()
    if not query:
        return web.json_response({"error": "query 不能为空"}, status=400)
    pages = body.get("pages")
    job_id = uuid.uuid4().hex[:12]
    request.app["jobs"][job_id] = Job()
    request.app["tasks"][job_id] = asyncio.create_task(
        _run_job(request.app, job_id, query, pages)
    )
    return web.json_response({"job": job_id})


async def api_events(request: web.Request) -> web.StreamResponse:
    job_id = request.query.get("job", "")
    job: Job | None = request.app["jobs"].get(job_id)
    if job is None:
        return web.json_response({"error": "unknown job"}, status=404)

    resp = web.StreamResponse(
        headers={
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )
    await resp.prepare(request)

    # 原子快照+订阅:此块无 await,单线程事件循环下不会有事件插进来 → 无丢无重。
    q: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    backlog = list(job.history)
    job.subscribers.append(q)
    try:
        for evt in backlog:
            await resp.write(_sse(evt))
            if evt["type"] in ("done", "error"):
                return resp
        while True:
            evt = await q.get()
            await resp.write(_sse(evt))
            if evt["type"] in ("done", "error"):
                return resp
    except (ConnectionResetError, asyncio.CancelledError):
        return resp
    finally:
        if q in job.subscribers:
            job.subscribers.remove(q)


async def api_doc(request: web.Request) -> web.Response:
    job: Job | None = request.app["jobs"].get(request.query.get("job", ""))
    if job is None or job.doc is None:
        return web.json_response({"error": "not ready"}, status=404)
    return web.json_response(job.doc)


async def index(_request: web.Request) -> web.Response:
    return web.HTTPFound("/app.html")


def _sse(evt: dict[str, Any]) -> bytes:
    return f"data: {json.dumps(evt, ensure_ascii=False)}\n\n".encode()


# ── 组装 app ─────────────────────────────────────────────────────────────────
def build_app(base_cfg: DictConfig, run_one: Any = _default_run_one) -> web.Application:
    app = web.Application()
    app["base_cfg"] = base_cfg
    app["run_one"] = run_one
    app["jobs"] = {}
    app["tasks"] = {}
    app.router.add_get("/", index)
    app.router.add_post("/api/generate", api_generate)
    app.router.add_get("/api/events", api_events)
    app.router.add_get("/api/doc", api_doc)
    app.router.add_static("/", VIEWER, show_index=False)  # viewer 静态(最后,兜底)
    return app


def _preflight_model(base_cfg: DictConfig, *, strict: bool) -> None:
    """启动期体检:该 key 能不能调 cfg 里的模型。不能 → 醒目告警 + 列可用(strict 则退出)。

    live 才校验(replay/inner=None 跳过);取列表失败(网络/代理/无 key)也跳过,绝不阻断起服务。
    """
    inner = base_cfg.llm.get("inner") if "llm" in base_cfg else None
    if not inner:  # replay 或无真实客户端 → 无需体检
        return
    model = str(inner.get("model") or "")
    base_url = str(inner.get("base_url") or "").rstrip("/")
    key_env = str(inner.get("api_key_env") or "SILICONFLOW_API_KEY")
    if not model or not base_url:
        return
    load_env()
    key = os.environ.get(key_env) or os.environ.get("OPENAI_API_KEY")
    if not key:
        print(f"[serve_app] ⚠ 未设 {key_env},跳过模型体检(真跑会报缺 key)。")
        return
    try:
        resp = httpx.get(
            f"{base_url}/models",
            headers={"Authorization": f"Bearer {key}"},
            timeout=15.0,
            trust_env=False,  # 国内端点不走本地翻墙代理
        )
        if resp.status_code != 200:
            print(f"[serve_app] (体检跳过:GET /models → HTTP {resp.status_code})")
            return
        ids = [m.get("id", "") for m in resp.json().get("data", [])]
    except Exception as e:  # noqa: BLE001 - 体检失败绝不阻断
        print(f"[serve_app] (体检跳过:{type(e).__name__})")
        return

    if model in ids:
        print(f"[serve_app] ✓ 模型可用:{model}")
        return
    fam = model.split("/")[-1].split("-")[0].lower()  # 如 'kimi'
    alts = [i for i in ids if fam and fam in i.lower()] or sorted(ids)[:8]
    msg = (
        f"⚠ 模型 {model} 不在你这把 key 的可用列表({len(ids)} 个)——"
        f"生成会 400 'Model does not exist'。\n"
        f"    同类可用:{', '.join(alts) or '(无)'}\n"
        f"    换模型:--llm kimi_k2_7_code / kimi_k2_6 …(见 configs/llm);"
        f"或去 SiliconFlow 给这把 key 开通该模型(实名/申请)。"
    )
    if strict:
        sys.exit(f"[serve_app] {msg}")
    print(f"[serve_app] {msg}\n    (--strict 可让此情形直接退出;当前继续起服务。)")


def main() -> None:
    ap = argparse.ArgumentParser(prog="serve_app")
    ap.add_argument("--llm", default="kimi_k2_7_code", help="configs/llm 名(任意 query 需 live 模型;K3 未对本 key 开通,默认回落 K2.7-Code)")
    ap.add_argument("--generator", default="full", help="configs/generator:full | fast | single_pass")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8778)
    ap.add_argument("--strict", action="store_true", help="模型不可用时直接退出(而非仅告警)")
    args = ap.parse_args()
    os.chdir(ROOT)  # 让 experiments/{corpus,results} 等相对路径无论从哪启动都落在包根

    with initialize_config_dir(version_base=None, config_dir=str(CONFIGS)):
        base = compose(config_name="config", overrides=[f"llm={args.llm}", f"generator={args.generator}"])

    _preflight_model(base, strict=args.strict)
    print(f"[serve_app] http://{args.host}:{args.port}/app.html  (llm={args.llm} generator={args.generator})")
    web.run_app(build_app(base), host=args.host, port=args.port, print=None)


if __name__ == "__main__":
    main()
