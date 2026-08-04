"""Purpose-based LLM routing without leaking provider choices into domain code."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, cast

from ...ports.llm import LLMClient, Message, Turn
from ...ports.tool import ToolSpec


class PurposeRouterClient:
    """Route matching purpose prefixes to dedicated clients.

    Widget generation uses ``widget:*`` purpose labels already.  Keeping the
    dispatch here lets the domain continue depending only on ``LLMClient``.
    """

    def __init__(self, default: LLMClient, routes: Mapping[str, LLMClient]) -> None:
        self.default = default
        self.routes = dict(routes)

    def client_for(self, purpose: str) -> LLMClient:
        matches = ((prefix, client) for prefix, client in self.routes.items() if purpose.startswith(prefix))
        matched = max(matches, key=lambda item: len(item[0]), default=None)
        return matched[1] if matched else self.default

    async def complete(
        self, messages: list[Message], *, json_mode: bool = True, purpose: str = "chat"
    ) -> str:
        return await self.client_for(purpose).complete(
            messages, json_mode=json_mode, purpose=purpose
        )

    async def complete_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[ToolSpec],
        *,
        purpose: str = "tools",
    ) -> Turn:
        client = self.client_for(purpose)
        complete_tools = getattr(client, "complete_tools", None)
        if complete_tools is None:
            raise TypeError(f"purpose={purpose} 的 LLM 不支持 tools")
        result = await complete_tools(messages, tools, purpose=purpose)
        return cast(Turn, result)

    @property
    def usage(self) -> dict[str, int]:
        total: dict[str, int] = {}
        clients = {id(self.default): self.default}
        clients.update({id(client): client for client in self.routes.values()})
        for client in clients.values():
            usage = getattr(client, "usage", None)
            if not usage:
                inner = getattr(client, "inner", None)
                usage = getattr(inner, "usage", None)
            for key, value in dict(usage or {}).items():
                total[key] = total.get(key, 0) + int(value or 0)
        return total
