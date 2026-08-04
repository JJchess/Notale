from __future__ import annotations

import asyncio
import json
import time
from collections import Counter
from pathlib import Path
from typing import Any

from hydra import compose, initialize_config_dir
from lecture_agent.adapters.render import HeadlessVerifier
from lecture_agent.app.build import build_llm, build_options, model_of, usage_of
from lecture_agent.engine import generate_lecture
from lecture_agent.ports.llm import LLMClient, Message
from lecture_agent.utils.env import load_env
from lecture_agent.utils.seed import seed_everything
from omegaconf import open_dict


ROOT = Path(__file__).resolve().parents[3]
RUN = Path(__file__).resolve().parent


class CountingClient:
    def __init__(self, inner: LLMClient) -> None:
        self.inner = inner
        self.purposes: Counter[str] = Counter()

    async def complete(
        self, messages: list[Message], *, json_mode: bool = True, purpose: str = "chat"
    ) -> str:
        self.purposes[purpose] += 1
        return await self.inner.complete(messages, json_mode=json_mode, purpose=purpose)


async def main() -> None:
    load_env()
    seed_everything(0)
    with initialize_config_dir(version_base=None, config_dir=str(ROOT / "configs")):
        cfg = compose(
            config_name="config",
            overrides=[
                "llm=deepseek_v4_flash",
                "pages=15",
                "generator.concurrency=8",
                "generator.quality_rounds=0",
                "generator.plan_quality_rounds=0",
                "generator.render_rounds=0",
                "generator.record=false",
            ],
        )
    # Bound provider retries so a single unavailable request cannot strand the experiment for hours.
    with open_dict(cfg):
        cfg.topic = "数据结构-AVL"
        cfg.llm.inner.attempts = 1
        cfg.llm.inner.timeout = 180
        cfg.llm.inner.extra_body = {"enable_thinking": False}

    raw_llm = build_llm(cfg)
    llm = CountingClient(raw_llm)
    log_path = RUN / "run.log"
    log_path.write_text("", encoding="utf-8")

    def log(message: str) -> None:
        stamp = time.strftime("%H:%M:%S")
        line = f"{stamp} | {message}"
        print(line, flush=True)
        with log_path.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")

    started = time.perf_counter()
    result = await generate_lecture(
        llm,
        topic="数据结构-AVL",
        pages=15,
        options=build_options(cfg),
        render_verifier=None,
        log=log,
    )
    elapsed = time.perf_counter() - started
    deck_path = RUN / "deck.lecture.json"
    deck_path.write_text(json.dumps(result.doc, ensure_ascii=False, indent=2), encoding="utf-8")

    verifier = HeadlessVerifier(shot_dir=RUN / "screenshots")
    render = await verifier.verify(json.dumps(result.doc, ensure_ascii=False))
    summary: dict[str, Any] = {
        "topic": "数据结构-AVL",
        "model": model_of(cfg),
        "seed": 0,
        "pagesTarget": 15,
        "pagesActual": len(result.doc.get("scenes") or []),
        "concurrency": 8,
        "qualityRounds": 0,
        "planQualityRounds": 0,
        "enableThinking": False,
        "elapsedSeconds": elapsed,
        "errors": result.errors,
        "warnings": result.warnings,
        "dropped": result.dropped,
        "knowledgeForms": result.knowledge_forms,
        "evidenceObligations": result.evidence_obligations,
        "widgetRoutes": result.widget_routes,
        "modelCallPurposes": dict(llm.purposes),
        "liveUsage": usage_of(raw_llm),
        "quality": result.quality,
        "render": {
            "ok": render.ok,
            "errors": render.errors,
            "warnings": render.warnings,
            "overflowPages": render.overflow_pages,
            "corruptPages": render.corrupt_pages,
            "pageMetrics": render.page_metrics,
            "shots": render.shots,
        },
    }
    (RUN / "run_result.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    log(
        f"DONE pages={summary['pagesActual']} errors={len(result.errors)} "
        f"dropped={len(result.dropped)} render_ok={render.ok}"
    )


if __name__ == "__main__":
    asyncio.run(main())
