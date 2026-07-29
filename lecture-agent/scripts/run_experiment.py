"""Hydra 入口：跑一个可复现实验（topics × seeds），聚合多元度指标写 metrics.json。

例：uv run python scripts/run_experiment.py +experiment=main_result
复现跑默认 llm=replay（零 API、完全确定）——需先用 deepseek_v3 录制过 fixtures。

concurrency（默认 1，即原有顺序行为不变）：同时跑几个 (topic, seed) 对。注意每个单题内部
fan-out 生成 block 本身已并发（generator.fanout 的并发度），题间并发是**叠加**的总请求量，
调大前留意 API 限流。传法：`concurrency=5`。
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import hydra
from lecture_agent.app.generate import run_generation
from lecture_agent.domain.evaluation import diversity
from lecture_agent.utils.logging import get_logger
from omegaconf import DictConfig, OmegaConf


async def _run(cfg: DictConfig) -> dict[str, object]:
    topics = list(cfg.get("topics") or ([cfg.topic] if cfg.get("topic") else []))
    seeds = list(cfg.get("seeds") or [cfg.get("seed", 0)])
    log = get_logger()
    sem = asyncio.Semaphore(int(cfg.get("concurrency", 1) or 1))

    async def _one(topic: str, seed: int) -> dict[str, object]:
        run_cfg = OmegaConf.create(OmegaConf.to_container(cfg, resolve=True))
        run_cfg.topic = topic
        run_cfg.seed = seed
        async with sem:
            try:
                result = await run_generation(run_cfg)
            except Exception as e:  # noqa: BLE001 - 单题失败不拖垮整批实验，跳过继续下一题
                log.warning(f"[experiment] 「{topic}」(seed={seed}) 生成失败，跳过: {e}")
                return {"topic": topic, "seed": seed, "ok": False, "error": str(e)[:200]}
        return {
            "topic": topic,
            "seed": seed,
            "ok": True,
            "errors": len(result.errors),
            "dropped": len(result.dropped),
            "_doc": result.doc,
        }

    pairs = [(t, s) for t in topics for s in seeds]
    results = await asyncio.gather(*(_one(t, s) for t, s in pairs))
    docs = [r.pop("_doc") for r in results if "_doc" in r]
    return {"runs": results, "diversity": diversity(docs)}


@hydra.main(version_base=None, config_path="../configs", config_name="config")
def main(cfg: DictConfig) -> None:
    metrics = asyncio.run(_run(cfg))
    out = Path(cfg.get("out_dir", "experiments/results")) / "metrics.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ 实验完成，metrics → {out}")


if __name__ == "__main__":
    main()
