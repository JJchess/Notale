"""组合根（L5）· Pipeline A —— 批量/实验向确定性生成。

`scripts/generate.py` / `cli.py` / 实验脚本的入口：seed → 注入 LLM → 跑共享 engine → 存 deck →
记实验账本。只依赖共享 `engine` + adapters，**不 import `shell/`**（流水线解耦）。
"""

from __future__ import annotations

import json
import time
import uuid
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any

from hydra.utils import instantiate
from omegaconf import DictConfig, OmegaConf

from ..adapters.render import HeadlessVerifier
from ..adapters.store import FilesystemStore, LedgerStore
from ..domain.telemetry import profile_deck
from ..engine import GenerateResult, generate_lecture
from ..ports.media import ImageFinder, ImageGenerator
from ..ports.visual_review import VisualReviewer
from ..schema import CodeMarker, Cost, ExperimentRecord
from ..utils.env import load_env
from ..utils.logging import get_logger
from ..utils.seed import seed_everything
from .build import (
    build_llm,
    build_options,
    model_of,
    quality_model_of,
    runtime_model_of,
    sim_model_of,
    usage_of,
    visual_model_of,
)
from .codeprint import agent_fingerprint, git_dirty, git_rev


def build_render_verifier(
    cfg: DictConfig, shot_dir: str | Path | None = None
) -> HeadlessVerifier | None:
    """真机渲染验收（generator.render_rounds>0 时启用，默认开）。

    HeadlessVerifier 本身在无 node / 无 Edge 时会返回 ok=True+warning 而非报错，
    所以这里可以无条件构造——离线机器上它自动退化成 no-op，不必再加开关。
    """
    if int(cfg.generator.get("render_rounds", 2)) <= 0:
        return None
    return HeadlessVerifier(shot_dir=shot_dir)


def build_media(cfg: DictConfig) -> tuple[ImageFinder | None, ImageGenerator | None]:
    """只在 media=auto|true 时装配 provider；auto 不等于每页调用。"""
    if not bool(cfg.generator.get("media", False)) or "media" not in cfg:
        return None, None
    finder = instantiate(cfg.media.finder) if cfg.media.get("finder") else None
    generator = instantiate(cfg.media.generator) if cfg.media.get("generator") else None
    return finder, generator


def build_visual_reviewer(cfg: DictConfig) -> VisualReviewer | None:
    """Full mode gets one screenshot-level review; fast variants keep the zero-cost default."""
    if int(cfg.generator.get("visual_quality_rounds", 0)) <= 0:
        return None
    if "visual_qa" not in cfg or not cfg.visual_qa:
        return None
    reviewer: VisualReviewer = instantiate(cfg.visual_qa)
    return reviewer


async def run_generation(
    cfg: DictConfig,
    out_root: str | Path | None = None,
    *,
    progress: Callable[[dict[str, Any]], None] = lambda _e: None,
) -> GenerateResult:
    """一次端到端生成：seed → 注入 LLM → 编排 → 存 deck → 记录实验账本。返回 GenerateResult。

    progress：结构化进度回调（默认 no-op），透传给 engine 供 Web App 进度视图消费。
    """
    load_env()  # 统一密钥文件 lecture-agent/.env → os.environ（不覆盖已设的），跑前不必手动 source
    seed_everything(int(cfg.seed))
    topic = cfg.get("topic")
    if not topic:
        raise ValueError("请提供 topic=...（例：uv run python scripts/generate.py topic=梯度下降）")
    log = get_logger()
    llm = build_llm(cfg)
    if sim_model := sim_model_of(cfg):
        log.info(f"[llm] create-sim widget:* → {sim_model}")
    if quality_model := quality_model_of(cfg):
        log.info(f"[llm] page-quality quality:* → {quality_model}")
    if visual_model := visual_model_of(cfg):
        log.info(
            f"[llm] structured visuals block:chart/diagram/graph/flow/timeline/formula → {visual_model}"
        )
    if runtime_model := runtime_model_of(cfg):
        log.info(f"[llm] create-code-runtime block:runnable → {runtime_model}")
    options = build_options(cfg)
    image_finder, image_generator = build_media(cfg)
    output_root = Path(out_root or cfg.get("out_dir", "experiments/corpus"))
    visual_reviewer = build_visual_reviewer(cfg)
    shot_dir = output_root / "screenshots" if visual_reviewer is not None else None
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
        render_verifier=build_render_verifier(cfg, shot_dir=shot_dir),
        visual_reviewer=visual_reviewer,
        log=log.info,
        progress=progress,
    )
    elapsed_s = time.perf_counter() - started
    store = FilesystemStore(output_root)
    store.save_deck(str(result.doc.get("id", "lecture")), result.doc)
    output_root.mkdir(parents=True, exist_ok=True)
    (output_root / "generation-report.json").write_text(
        json.dumps(
            {
                "elapsedSeconds": round(elapsed_s, 3),
                "errors": result.errors,
                "warnings": result.warnings,
                "dropped": result.dropped,
                "quality": result.quality,
                "visualQuality": result.visual_quality,
                "widgetRoutes": result.widget_routes,
                "knowledgeForms": result.knowledge_forms,
                "evidenceObligations": result.evidence_obligations,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

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
