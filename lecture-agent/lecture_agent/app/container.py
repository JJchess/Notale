"""组合根（L5）——唯一把具体 adapter 接到 port 的地方（Hydra `_target_` 实例化并注入）。

domain/agent 只认接口；这里负责"用哪个实现"。换 live/replay/模型只改 configs/llm，代码不动。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from hydra.utils import instantiate
from omegaconf import DictConfig, OmegaConf

from ..adapters.store import FilesystemStore
from ..agent import GenerateResult, GeneratorOptions, generate_lecture
from ..ports.llm import LLMClient
from ..utils.logging import get_logger
from ..utils.seed import seed_everything


def build_llm(cfg: DictConfig) -> LLMClient:
    llm: LLMClient = instantiate(cfg.llm)
    return llm


def build_options(cfg: DictConfig) -> GeneratorOptions:
    data: dict[str, Any] = OmegaConf.to_container(cfg.generator, resolve=True)  # type: ignore[assignment]
    return GeneratorOptions(**data)


async def run_generation(cfg: DictConfig, out_root: str | Path | None = None) -> GenerateResult:
    """一次端到端生成：seed → 注入 LLM → 编排 → 存 deck。返回 GenerateResult。"""
    seed_everything(int(cfg.seed))
    topic = cfg.get("topic")
    if not topic:
        raise ValueError("请提供 topic=...（例：uv run python scripts/generate.py topic=梯度下降）")
    log = get_logger()
    result = await generate_lecture(
        build_llm(cfg),
        topic=str(topic),
        pages=int(cfg.get("pages", 8)),
        theme=str(cfg.get("theme", "") or ""),
        audience=str(cfg.get("audience", "") or ""),
        wants=str(cfg.get("wants", "") or ""),
        extra=str(cfg.get("extra", "") or ""),
        coverage=bool(cfg.get("coverage", False)),
        options=build_options(cfg),
        log=log.info,
    )
    store = FilesystemStore(Path(out_root or cfg.get("out_dir", "data/corpus")))
    store.save_deck(str(result.doc.get("id", "lecture")), result.doc)
    return result
