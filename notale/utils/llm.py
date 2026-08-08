"""Notale 自包含的 LLM 基础设施。

移植自 lecture-agent（ports/llm.py + adapters/llm/client.py + adapters/llm/fake.py），
已切断对 lecture_agent 包的一切依赖，行为逻辑原样保留。

- HttpxClient —— OpenAI 兼容异步客户端；温度/模型/seed 烘焙在实例上，带指数退避重试。
  确定性优先：默认 temperature=0.0 + 传 seed。api key 从环境变量读，永不入配置。
- FakeClient —— 测试用 in-memory 替身：按顺序/purpose 返回罐装响应，不联网。
  证明调用方只依赖接口：单测传它即可端到端跑，无需真 key。
"""

from __future__ import annotations

import asyncio
import os
import re
from collections import deque
from typing import Any, Protocol, TypedDict, runtime_checkable

import httpx

# ---------------------------------------------------------------------------
# 类型与接口
# ---------------------------------------------------------------------------


class Message(TypedDict):
    role: str
    content: str


@runtime_checkable
class LLMClient(Protocol):
    async def complete(
        self,
        messages: list[Message],
        *,
        json_mode: bool = True,
        purpose: str = "chat",
    ) -> str:
        """一次 OpenAI 兼容 chat，返回文本。json_mode 请求 JSON 对象输出。

        purpose 是用途标签（plan:skeleton / block:sim …），供归因日志，不影响语义。
        """
        ...


# ---------------------------------------------------------------------------
# 真调客户端
# ---------------------------------------------------------------------------

_RATE_LIMIT = re.compile(
    r"429|rate|too many|529|503|502|overload|timeout|ETIMEDOUT|ECONNRESET", re.I
)


class HttpxClient:
    def __init__(
        self,
        *,
        base_url: str = "https://api.siliconflow.cn/v1",
        model: str = "deepseek-ai/DeepSeek-V4-Flash",
        temperature: float = 0.0,
        seed: int | None = 0,
        api_key_env: str = "SILICONFLOW_API_KEY",
        attempts: int = 4,
        timeout: float = 600.0,  # reasoning 模型单调用可能 >120s（沿用 lecture-agent 对该模型的 pin）
        proxy: str | None = None,
        extra_body: dict[str, Any] | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.temperature = temperature
        self.seed = seed
        self.api_key_env = api_key_env
        self.attempts = attempts
        self.timeout = timeout
        # 境外端点（如 Gemini 评委）需显式走翻墙代理；国内端点留 None=直连。
        self.proxy = proxy
        # 任意 OpenAI 兼容额外参数透传（enable_thinking / thinking / reasoning_effort / max_tokens …）。
        # 普适："关思考"等 per-model 差异全交配置，不进代码。
        self.extra_body = dict(extra_body or {})
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
        # self.proxy 显式给定时（境外评委端点）走该 http 代理；否则直连。
        async with httpx.AsyncClient(
            timeout=self.timeout, trust_env=False, proxy=self.proxy
        ) as client:
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
        body.update(self.extra_body)  # 透传关思考/reasoning_effort/max_tokens 等
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

# ---------------------------------------------------------------------------
# 测试替身
# ---------------------------------------------------------------------------


class FakeClient:
    """测试用 in-memory LLMClient。按顺序/purpose 返回罐装响应，不联网。"""

    def __init__(
        self,
        queue: list[str] | None = None,
        by_purpose: dict[str, str] | None = None,
        default: str = "{}",
    ) -> None:
        self._queue: deque[str] = deque(queue or [])
        self._by_purpose = by_purpose or {}
        self._default = default
        self.calls: list[tuple[str, list[Message]]] = []

    async def complete(
        self, messages: list[Message], *, json_mode: bool = True, purpose: str = "chat"
    ) -> str:
        self.calls.append((purpose, messages))
        if purpose in self._by_purpose:
            return self._by_purpose[purpose]
        if self._queue:
            return self._queue.popleft()
        return self._default
