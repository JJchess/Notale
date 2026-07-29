"""组合根共享构件（L5）——两条流水线（generate / chat）都用的装配 helper。

只依赖 engine + ports，谁都不 import 另一条流水线，保证 L5 也满足"流水线互不 import"。
"""

from __future__ import annotations

from typing import Any

from hydra.utils import instantiate
from omegaconf import DictConfig, OmegaConf, open_dict

from ..engine import GeneratorOptions
from ..ports.llm import LLMClient


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


def model_of(cfg: DictConfig) -> str | None:
    """模型 id 视 llm 配置是否走 CassetteClient(namespace+inner.model) 或直连(model) 而定。"""
    if "llm" not in cfg:
        return None
    inner = cfg.llm.get("inner")
    model = (inner.get("model") if inner else None) or cfg.llm.get("model")
    return str(model) if model else None


def usage_of(llm: Any) -> dict[str, int]:
    """token 用量在哪层视 llm 是 live client 还是 CassetteClient 而定（同 scripts/run_matrix.py usage_of）。"""
    direct = getattr(llm, "usage", None)
    if direct:
        return dict(direct)
    inner = getattr(llm, "inner", None)
    wrapped = getattr(inner, "usage", None)
    return dict(wrapped) if wrapped else {}
