"""Declarative role contracts consumed by the agent runtime."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class RoleSpec:
    name: str
    system_prompt: str
    tools: list[Any] = field(default_factory=list)
    skills: list[str] = field(default_factory=list)
    max_turns: int = 8
    max_tokens: int = 16384
    base_url: str = "https://api.siliconflow.cn/v1"
    model: str = "deepseek-ai/DeepSeek-V4-Flash"
    api_key_env: str = "SILICONFLOW_API_KEY"
