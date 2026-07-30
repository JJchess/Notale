"""后端 SSE 桥接契约:POST 起 job → GET /api/events 流式吐进度 → done。

用替身 run_one(不碰真 LLM)喂一串 canned 进度事件,验证:job 生命周期、SSE 广播、
t 盖戳、done 收尾、/api/doc 出最终 doc。scripts/ 非包,按路径 importlib 载入 serve_app。
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from typing import Any

from aiohttp.test_utils import TestClient, TestServer
from omegaconf import DictConfig, OmegaConf

_SERVE = Path(__file__).resolve().parent.parent / "scripts" / "serve_app.py"
_spec = importlib.util.spec_from_file_location("serve_app", _SERVE)
assert _spec and _spec.loader
serve_app = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(serve_app)

_DOC = {"id": "stub", "title": "T", "scenes": [{"id": "s0", "blocks": [{"id": "s0b0", "type": "hero"}]}]}


async def _stub_run_one(cfg: DictConfig, out_root: Path, progress: Any) -> dict:
    assert cfg.topic == "树（数据结构）"  # 确认 query 已进 cfg.topic
    progress({"type": "stage", "stage": "plan", "status": "start"})
    progress({"type": "skeleton", "doc": _DOC})
    progress({"type": "stage", "stage": "plan", "status": "done"})
    progress({"type": "block", "blockId": "s0b0", "sceneId": "s0", "status": "active"})
    progress({"type": "docUpdated", "blockId": "s0b0", "sceneId": "s0", "status": "done"})
    progress({"type": "done", "doc": _DOC, "errors": 0, "dropped": 0})
    return _DOC


def _parse_sse(text: str) -> list[dict]:
    return [
        json.loads(line[len("data: ") :])
        for chunk in text.strip().split("\n\n")
        for line in [chunk.strip()]
        if line.startswith("data: ")
    ]


async def test_generate_then_sse_streams_events() -> None:
    base = OmegaConf.create({"topic": None, "pages": 8, "seed": 0})
    app = serve_app.build_app(base, run_one=_stub_run_one)
    async with TestClient(TestServer(app)) as client:
        r = await client.post("/api/generate", json={"query": "树（数据结构）"})
        assert r.status == 200
        job = (await r.json())["job"]

        r2 = await client.get(f"/api/events?job={job}")
        assert r2.status == 200
        events = _parse_sse(await r2.text())

        types = [e["type"] for e in events]
        assert types[0] == "stage" and types[-1] == "done"
        assert any(e["type"] == "skeleton" for e in events)
        assert all("t" in e for e in events)  # 后端盖了 t 时间戳
        assert {"s0b0"} <= {e.get("blockId") for e in events if e["type"] == "block"}

        r3 = await client.get(f"/api/doc?job={job}")
        assert (await r3.json())["id"] == "stub"


async def test_empty_query_rejected() -> None:
    base = OmegaConf.create({"topic": None, "pages": 8, "seed": 0})
    app = serve_app.build_app(base, run_one=_stub_run_one)
    async with TestClient(TestServer(app)) as client:
        r = await client.post("/api/generate", json={"query": "  "})
        assert r.status == 400


def test_preflight_skips_replay_without_network() -> None:
    # replay(inner=None)与无 llm 键都应直接返回,不涉网、不退出（strict 也不触发）。
    serve_app._preflight_model(OmegaConf.create({"llm": {"inner": None}}), strict=True)
    serve_app._preflight_model(OmegaConf.create({"seed": 0}), strict=True)


async def test_generation_failure_becomes_error_event() -> None:
    async def _boom(cfg: DictConfig, out_root: Path, progress: Any) -> dict:
        progress({"type": "stage", "stage": "plan", "status": "start"})
        raise RuntimeError("boom")

    base = OmegaConf.create({"topic": None, "pages": 8, "seed": 0})
    app = serve_app.build_app(base, run_one=_boom)
    async with TestClient(TestServer(app)) as client:
        job = (await (await client.post("/api/generate", json={"query": "x"})).json())["job"]
        events = _parse_sse(await (await client.get(f"/api/events?job={job}")).text())
        assert events[-1]["type"] == "error" and "boom" in events[-1]["message"]
