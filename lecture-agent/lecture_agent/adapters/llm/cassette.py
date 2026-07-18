"""CassetteClient —— 录制盒（确定性命根子），实现 ports.LLMClient。

三态（由 configs/llm 的 mode 选）：
- live   ：调 inner 真客户端，把响应以 (signature, messages, json_mode) 的 hash 为 key 落盘。
- replay ：只从 fixtures 读；未命中即**报错**（绝不联网）→ 复现跑零 API、完全确定。

默认扁平命名空间：live 与 replay 共享同一 key 天然对齐；需按模型隔离 fixture 时给显式 namespace。
让审稿人 `mode=replay` 一键重放论文全部生成，无需任何 key。
诚实边界：可复现的权威来源是 cassette 快照，不是"再调一次 API"（temp0 也非 bit 级可复现）。
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Literal

from ...ports.llm import LLMClient, Message, ToolCallingLLM, ToolInvocation, Turn
from ...ports.tool import ToolSpec


def _key(namespace: str, messages: list[Message], json_mode: bool) -> str:
    payload = json.dumps(
        {"ns": namespace, "messages": messages, "json_mode": json_mode},
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]


def _key_tools(namespace: str, messages: list[dict[str, Any]], tool_names: list[str]) -> str:
    payload = json.dumps(
        {"ns": namespace, "kind": "tools", "messages": messages, "tools": tool_names},
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]


def _dump_turn(t: Turn) -> dict[str, Any]:
    return {
        "content": t.content,
        "tool_calls": [
            {"id": c.id, "name": c.name, "arguments": c.arguments} for c in t.tool_calls
        ],
    }


def _load_turn(d: dict[str, Any]) -> Turn:
    return Turn(
        content=d.get("content"),
        tool_calls=[
            ToolInvocation(c["id"], c["name"], c["arguments"]) for c in d.get("tool_calls", [])
        ],
    )


class CassetteMiss(RuntimeError):
    """replay 模式下 fixture 未命中——绝不回退联网。"""


class CassetteClient:
    def __init__(
        self,
        *,
        mode: Literal["live", "replay"] = "replay",
        fixtures_dir: str | Path = "fixtures",
        inner: LLMClient | None = None,
        namespace: str | None = None,
    ) -> None:
        if mode == "live" and inner is None:
            raise ValueError("live 模式需 inner 真客户端")
        self.mode = mode
        self.inner = inner
        # 命名空间：默认扁平（live 与 replay 共享同一 key，天然对齐）；需按模型隔离时显式给 namespace。
        self.namespace = namespace or ""
        self.dir = Path(fixtures_dir) / self.namespace if self.namespace else Path(fixtures_dir)
        if mode == "live":
            self.dir.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        return self.dir / f"{key}.json"

    async def complete(
        self, messages: list[Message], *, json_mode: bool = True, purpose: str = "chat"
    ) -> str:
        key = _key(self.namespace, messages, json_mode)
        path = self._path(key)
        if self.mode == "replay":
            if not path.exists():
                raise CassetteMiss(
                    f"fixture 未命中 [{self.namespace}/{key}] purpose={purpose}——"
                    f"replay 模式不联网；请先 `llm=deepseek_v3` 录制。"
                )
            return str(json.loads(path.read_text(encoding="utf-8"))["response"])
        # live：命中缓存则复用，否则真调并落盘
        if path.exists():
            return str(json.loads(path.read_text(encoding="utf-8"))["response"])
        assert self.inner is not None
        response = await self.inner.complete(messages, json_mode=json_mode, purpose=purpose)
        path.write_text(
            json.dumps(
                {
                    "purpose": purpose,
                    "json_mode": json_mode,
                    "messages": messages,
                    "response": response,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        return response

    async def complete_tools(
        self, messages: list[dict[str, Any]], tools: list[ToolSpec], *, purpose: str = "tools"
    ) -> Turn:
        names = [t["name"] for t in tools]
        key = _key_tools(self.namespace, messages, names)
        path = self._path(key)
        if self.mode == "replay":
            if not path.exists():
                raise CassetteMiss(
                    f"tool-fixture 未命中 [{self.namespace}/{key}] purpose={purpose}——"
                    f"replay 模式不联网；请先 `llm=deepseek_v3` 录制。"
                )
            return _load_turn(json.loads(path.read_text(encoding="utf-8"))["turn"])
        if path.exists():
            return _load_turn(json.loads(path.read_text(encoding="utf-8"))["turn"])
        if not isinstance(self.inner, ToolCallingLLM):
            raise RuntimeError("live 模式的 inner 客户端未实现 complete_tools")
        turn = await self.inner.complete_tools(messages, tools, purpose=purpose)
        path.write_text(
            json.dumps(
                {
                    "purpose": purpose,
                    "tools": names,
                    "messages": messages,
                    "turn": _dump_turn(turn),
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        return turn
