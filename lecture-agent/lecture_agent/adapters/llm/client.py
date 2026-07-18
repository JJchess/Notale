"""HttpxClient —— OpenAI 兼容异步客户端，实现 ports.LLMClient + ToolCallingLLM。

对应旧 `src/llm.mjs` 的真调部分；温度/模型/seed 烘焙在此（从 configs/llm 注入），带指数退避重试。
确定性优先：默认 temperature=0.0 + 传 seed。api key 从环境变量读，永不入配置。
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from typing import Any

import httpx

from ...ports.llm import Message, ToolInvocation, Turn
from ...ports.tool import ToolSpec

_RATE_LIMIT = re.compile(
    r"429|rate|too many|529|503|502|overload|timeout|ETIMEDOUT|ECONNRESET", re.I
)


class HttpxClient:
    def __init__(
        self,
        *,
        base_url: str = "https://api.siliconflow.cn/v1",
        model: str = "deepseek-ai/DeepSeek-V3",
        temperature: float = 0.0,
        seed: int | None = 0,
        api_key_env: str = "SILICONFLOW_API_KEY",
        attempts: int = 4,
        timeout: float = 120.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.temperature = temperature
        self.seed = seed
        self.api_key_env = api_key_env
        self.attempts = attempts
        self.timeout = timeout
        # 累计 token（供实验 harness 归因；仅真调计数，命中缓存的调用不计）
        self.usage: dict[str, int] = {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "reasoning_tokens": 0,
            "total_tokens": 0,
            "calls": 0,
        }

    @property
    def signature(self) -> str:
        """标识"用什么参数产出"，供录制盒命名空间隔离（换模型/温度不撞 fixture）。"""
        return f"{self.model}@t{self.temperature}@s{self.seed}"

    def _api_key(self) -> str:
        key = os.environ.get(self.api_key_env) or os.environ.get("OPENAI_API_KEY")
        if not key:
            raise RuntimeError(f"缺 API key：设环境变量 {self.api_key_env} 或 OPENAI_API_KEY")
        return key

    async def _post_message(self, body: dict[str, Any]) -> dict[str, Any]:
        """POST /chat/completions，带退避重试，返回 choices[0].message 对象。"""
        headers = {"Authorization": f"Bearer {self._api_key()}", "Content-Type": "application/json"}
        last_err: Exception | None = None
        # trust_env=False：忽略环境 *_PROXY（本地翻墙代理不路由国内端点，且 SOCKS 需额外依赖）。
        async with httpx.AsyncClient(timeout=self.timeout, trust_env=False) as client:
            for attempt in range(1, self.attempts + 1):
                try:
                    resp = await client.post(
                        f"{self.base_url}/chat/completions", headers=headers, json=body
                    )
                    if resp.status_code != 200:
                        raise RuntimeError(f"HTTP {resp.status_code} {resp.text[:200]}")
                    data = resp.json()
                    self._record_usage(data.get("usage"))
                    message: dict[str, Any] = data.get("choices", [{}])[0].get("message", {})
                    return message
                except Exception as e:  # noqa: BLE001 - 统一重试
                    last_err = e
                    if attempt < self.attempts:
                        backoff = (4.0 if _RATE_LIMIT.search(str(e)) else 1.0) * attempt
                        await asyncio.sleep(backoff)
        assert last_err is not None
        raise last_err

    def _record_usage(self, usage: dict[str, Any] | None) -> None:
        """累加一次真调的 token 用量（OpenAI 兼容 usage 字段；缺字段兜 0）。"""
        if not usage:
            return
        self.usage["prompt_tokens"] += int(usage.get("prompt_tokens", 0) or 0)
        self.usage["completion_tokens"] += int(usage.get("completion_tokens", 0) or 0)
        self.usage["total_tokens"] += int(usage.get("total_tokens", 0) or 0)
        details = usage.get("completion_tokens_details") or {}
        self.usage["reasoning_tokens"] += int(details.get("reasoning_tokens", 0) or 0)
        self.usage["calls"] += 1

    def _base_body(self) -> dict[str, Any]:
        body: dict[str, Any] = {
            "model": self.model,
            "messages": [],
            "temperature": self.temperature,
        }
        if self.seed is not None:
            body["seed"] = self.seed
        return body

    async def complete(
        self, messages: list[Message], *, json_mode: bool = True, purpose: str = "chat"
    ) -> str:
        body = self._base_body()
        body["messages"] = messages
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        message = await self._post_message(body)
        content = message.get("content")
        if not content:
            raise RuntimeError("空响应")
        return str(content)

    async def complete_tools(
        self, messages: list[dict[str, Any]], tools: list[ToolSpec], *, purpose: str = "tools"
    ) -> Turn:
        body = self._base_body()
        body["messages"] = messages
        body["tools"] = [{"type": "function", "function": spec} for spec in tools]
        message = await self._post_message(body)
        raw_calls = message.get("tool_calls") or []
        calls = [
            ToolInvocation(
                id=str(tc.get("id", "")),
                name=str(tc.get("function", {}).get("name", "")),
                arguments=json.loads(tc.get("function", {}).get("arguments") or "{}"),
            )
            for tc in raw_calls
        ]
        content = message.get("content")
        return Turn(content=None if content is None else str(content), tool_calls=calls)
