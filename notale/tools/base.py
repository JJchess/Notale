"""Minimal tool contracts used by the Notale agent loop.

Derived from OpenHarness v0.1.9 ``openharness.tools.base`` (MIT), pinned at
commit a0f8552c69d0b25d613af288823212a8b6b59a.  Notale intentionally keeps only
the schema, registry, execution context, and result contracts it exercises.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pydantic import BaseModel


@dataclass
class ToolContext:
    cwd: Path
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ToolResult:
    output: str
    is_error: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


class BaseTool(ABC):
    name: str
    description: str
    input_model: type[BaseModel]

    @abstractmethod
    async def execute(self, arguments: BaseModel, context: ToolContext) -> ToolResult:
        """Execute one validated invocation."""

    def to_api_schema(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_model.model_json_schema(),
        }


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, BaseTool] = {}

    def register(self, tool: BaseTool) -> None:
        if tool.name in self._tools:
            raise ValueError(f"duplicate tool: {tool.name}")
        self._tools[tool.name] = tool

    def get(self, name: str) -> BaseTool | None:
        return self._tools.get(name)

    def to_api_schema(self) -> list[dict[str, Any]]:
        return [tool.to_api_schema() for tool in self._tools.values()]
