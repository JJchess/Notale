"""Hydra 入口：跑一轮专能 Hermes 外壳（对话式做讲义）。

例：
  uv run python scripts/chat.py request="给研究生做一份关于梯度下降的讲义" llm=deepseek_v3
  uv run python scripts/chat.py topic=二分查找
"""

from __future__ import annotations

import asyncio

import hydra
from lecture_agent.app.chat import run_shell
from omegaconf import DictConfig


@hydra.main(version_base=None, config_path="../configs", config_name="config")
def main(cfg: DictConfig) -> None:
    res = asyncio.run(run_shell(cfg))
    print(f"\n[shell] {res.rounds} 轮 · 工具序列 {res.tool_sequence}\n{'-' * 40}\n{res.final}")


if __name__ == "__main__":
    main()
