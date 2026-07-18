"""Hydra 入口：跑一个可复现实验（topics × seeds），聚合多元度指标写 metrics.json。

例：uv run python scripts/run_experiment.py +experiment=main_result
复现跑默认 llm=replay（零 API、完全确定）——需先用 deepseek_v3 录制过 fixtures。
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import hydra
from lecture_agent.app.container import run_generation
from lecture_agent.domain.evaluation import diversity
from omegaconf import DictConfig, OmegaConf


async def _run(cfg: DictConfig) -> dict[str, object]:
    topics = list(cfg.get("topics") or ([cfg.topic] if cfg.get("topic") else []))
    seeds = list(cfg.get("seeds") or [cfg.get("seed", 0)])
    docs: list[dict[str, object]] = []
    per_run = []
    for topic in topics:
        for seed in seeds:
            run_cfg = OmegaConf.create(OmegaConf.to_container(cfg, resolve=True))
            run_cfg.topic = topic
            run_cfg.seed = seed
            result = await run_generation(run_cfg)
            docs.append(result.doc)
            per_run.append(
                {
                    "topic": topic,
                    "seed": seed,
                    "errors": len(result.errors),
                    "dropped": len(result.dropped),
                }
            )
    return {"runs": per_run, "diversity": diversity(docs)}


@hydra.main(version_base=None, config_path="../configs", config_name="config")
def main(cfg: DictConfig) -> None:
    metrics = asyncio.run(_run(cfg))
    out = Path(cfg.get("out_dir", "results")) / "metrics.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ 实验完成，metrics → {out}")


if __name__ == "__main__":
    main()
