"""组合根（L5）——唯一把具体 adapter 接到 port 的地方（Hydra `_target_` 实例化并注入）。

domain/agent 只认接口；这里负责"用哪个实现"。换 live/replay/模型只改 configs/llm，代码不动。
"""

from __future__ import annotations

import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from hydra.utils import instantiate
from omegaconf import DictConfig, OmegaConf, open_dict

from ..adapters.store import FilesystemStore, LedgerStore
from ..agent import GenerateResult, GeneratorOptions, generate_lecture
from ..domain.telemetry import profile_deck
from ..ports.llm import LLMClient
from ..ports.media import ImageFinder, ImageGenerator
from ..schema import CodeMarker, Cost, ExperimentRecord
from ..utils.env import load_env
from ..utils.logging import get_logger
from ..utils.seed import seed_everything
from .codeprint import agent_fingerprint, git_dirty, git_rev


def build_llm(cfg: DictConfig) -> LLMClient:
    """fast_extra_body 是给 bench fast 变体用的 per-model 参数，不是 CassetteClient 的入参——
    这里剥掉再 instantiate（同 scripts/run_matrix.py build_llm 的既有处理）。"""
    with open_dict(cfg):
        cfg.llm.pop("fast_extra_body", None)
    llm: LLMClient = instantiate(cfg.llm)
    return llm


def build_options(cfg: DictConfig) -> GeneratorOptions:
    data: dict[str, Any] = OmegaConf.to_container(cfg.generator, resolve=True)  # type: ignore[assignment]
    return GeneratorOptions(**data)


def build_media(cfg: DictConfig) -> tuple[ImageFinder | None, ImageGenerator | None]:
    """只在 generator.media=true 时才 instantiate（默认零成本，不建 httpx 客户端不读 key）。"""
    if not bool(cfg.generator.get("media", False)) or "media" not in cfg:
        return None, None
    finder = instantiate(cfg.media.finder) if cfg.media.get("finder") else None
    generator = instantiate(cfg.media.generator) if cfg.media.get("generator") else None
    return finder, generator


def _model_of(cfg: DictConfig) -> str | None:
    """模型 id 视 llm 配置是否走 CassetteClient(namespace+inner.model) 或直连(model) 而定。"""
    if "llm" not in cfg:
        return None
    inner = cfg.llm.get("inner")
    model = (inner.get("model") if inner else None) or cfg.llm.get("model")
    return str(model) if model else None


def _usage_of(llm: Any) -> dict[str, int]:
    """token 用量在哪层视 llm 是 live client 还是 CassetteClient 而定（同 scripts/run_matrix.py usage_of）。"""
    direct = getattr(llm, "usage", None)
    if direct:
        return dict(direct)
    inner = getattr(llm, "inner", None)
    wrapped = getattr(inner, "usage", None)
    return dict(wrapped) if wrapped else {}


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
    store = FilesystemStore(Path(out_root or cfg.get("out_dir", "data/corpus")))
    store.save_deck(str(result.doc.get("id", "lecture")), result.doc)

    if options.record:
        _record_experiment(cfg, result, elapsed_s, _usage_of(llm))
    return result


def _record_experiment(
    cfg: DictConfig, result: GenerateResult, elapsed_s: float, usage: dict[str, int]
) -> None:
    """把这次生成写进 results/ledger.jsonl；记录失败绝不阻断生成本身（try/except 兜底）。"""
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
            model=_model_of(cfg),
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
