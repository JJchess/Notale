"""Hydra 入口：生成一份 deck。

例：
  uv run python scripts/generate.py topic=梯度下降 llm=deepseek_v3
  uv run python scripts/generate.py topic=二分查找 generator=single_pass
"""

from __future__ import annotations

import asyncio

import hydra
from lecture_agent.app.generate import run_generation
from omegaconf import DictConfig


@hydra.main(version_base=None, config_path="../configs", config_name="config")
def main(cfg: DictConfig) -> None:
    result = asyncio.run(run_generation(cfg))
    print(
        f"✓ {len(result.doc.get('scenes', []))} 页 / 丢弃 {len(result.dropped)} / 错误 {len(result.errors)}"
    )


if __name__ == "__main__":
    main()
