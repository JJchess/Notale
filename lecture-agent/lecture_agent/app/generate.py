"""组合根（L5）· Pipeline A —— 批量/实验向确定性生成。

`scripts/generate.py` / `cli.py` / 实验脚本的入口：seed → 注入 LLM → 跑共享 engine → 存 deck →
记实验账本。只依赖共享 `engine` + adapters，**不 import `shell/`**（流水线解耦）。
"""

from __future__ import annotations

import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from hydra.utils import instantiate
from omegaconf import DictConfig, OmegaConf

from ..adapters.store import FilesystemStore, LedgerStore
from ..engine import GenerateResult, generate_lecture
from ..ports.media import ImageFinder, ImageGenerator
from ..schema import CodeMarker, Cost, ExperimentRecord
from ..utils.env import load_env
from ..utils.logging import get_logger
from ..utils.seed import seed_everything
from ..domain.telemetry import profile_deck
from .build import build_llm, build_options, model_of, usage_of
from .codeprint import agent_fingerprint, git_dirty, git_rev


def build_media(cfg: DictConfig) -> tuple[ImageFinder | None, ImageGenerator | None]:
    """只在 generator.media=true 时才 instantiate（默认零成本，不建 httpx 客户端不读 key）。"""
    if not bool(cfg.generator.get("media", False)) or "media" not in cfg:
        return None, None
    finder = instantiate(cfg.media.finder) if cfg.media.get("finder") else None
    generator = instantiate(cfg.media.generator) if cfg.media.get("generator") else None
    return finder, generator


async def run_generation(cfg: DictConfig, out_root: str | Path | None = None) -> GenerateResult:
    """一次端到端生成：seed → 注入 LLM → 编排 → 存 deck → 记录实验账本。返回 GenerateResult。"""
    load_env()  # 统一密钥文件 lecture-agent/.env → os.environ（不覆盖已设的），跑前不必手动 source
    seed_everything(int(cfg.seed))
    topic = cfg.get("topic")
    if not topic:
        raise ValueError("请提供 topic=...（例：uv run python scripts/generate.py topic=梯度下降）")
    log = get_logger()
    llm = build_llm(cfg)
    options = build_options(cfg)
    image_finder, image_generator = build_media(cfg)
    started = time.perf_counter()
    result = await generate_lecture(
        llm,
        topic=str(topic),
        pages=int(cfg.get("pages", 8)),
        theme=str(cfg.get("theme", "") or ""),
        audience=str(cfg.get("audience", "") or ""),
        wants=str(cfg.get("wants", "") or ""),
        extra=str(cfg.get("extra", "") or ""),
        coverage=bool(cfg.get("coverage", False)),
        options=options,
        image_finder=image_finder,
        image_generator=image_generator,
        log=log.info,
    )
    elapsed_s = time.perf_counter() - started
    store = FilesystemStore(Path(out_root or cfg.get("out_dir", "experiments/corpus")))
    store.save_deck(str(result.doc.get("id", "lecture")), result.doc)

    if options.record:
        _record_experiment(cfg, result, elapsed_s, usage_of(llm))
    return result


def _record_experiment(
    cfg: DictConfig, result: GenerateResult, elapsed_s: float, usage: dict[str, int]
) -> None:
    """把这次生成写进 experiments/results/ledger.jsonl；记录失败绝不阻断生成本身（try/except 兜底）。"""
    try:
        opts_dict: dict[str, Any] = OmegaConf.to_container(cfg.generator, resolve=True)  # type: ignore[assignment]
        record = ExperimentRecord(
            run_id=f"{datetime.now():%Y%m%d-%H%M%S}-{uuid.uuid4().hex[:8]}",
            ts=datetime.now().isoformat(),
            source="generate",
            code=CodeMarker(
                git_rev=git_rev(),
                git_dirty=git_dirty(),
                agent_fingerprint=agent_fingerprint(),
            ),
            model=model_of(cfg),
            llm_cfg=str(cfg.llm.get("namespace", "") or cfg.llm.get("_target_", ""))
            if "llm" in cfg
            else None,
            generator_cfg=None,
            options=opts_dict,
            theme=str(cfg.get("theme", "") or "") or None,
            topic=str(cfg.get("topic", "") or "") or None,
            pages_target=int(cfg.get("pages", 8)),
            seed=int(cfg.seed),
            audience=str(cfg.get("audience", "") or "") or None,
            wants=str(cfg.get("wants", "") or "") or None,
            extra=str(cfg.get("extra", "") or "") or None,
            ok=not result.errors,
            elapsed_s=elapsed_s,
            pages=len(result.doc.get("scenes", [])),
            blocks=sum(len(s.get("blocks") or []) for s in result.doc.get("scenes", [])),
            dropped=list(result.dropped),
            errors=list(result.errors),
            warnings=list(result.warnings),
            perspectives=len(result.perspectives),
            cost=Cost(**usage) if usage else Cost(),
            profile=profile_deck(result.doc),
        )
        LedgerStore().append(record)
    except Exception as e:  # noqa: BLE001 - 记录失败不能拖垮生成
        get_logger().warning(f"实验记录失败（不影响生成结果）: {e}")
