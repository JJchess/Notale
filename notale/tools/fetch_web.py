"""FetchWebTool —— research agent 的网页抓取工具，出处绑定纪律的落点。

模型自己调工具抓 url；每次抓取 harness 侧自动落 FetchRecord（evidence.new_fetch_record：
URL + 抓取时间），存进工具的 `.records`。事后 bind_evidence 只认这些记录——
"模型没抓过的 url"在结构上无法变成出处（PREP §2.1，比旧线更彻底：旧线由 harness 代抓，
现在抓取动作本身也在工具记录里）。
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import re
from pathlib import Path

from openharness.tools.base import BaseTool, ToolExecutionContext, ToolResult
from openharness.tools.web_search_tool import WebSearchTool, WebSearchToolInput
from pydantic import BaseModel, Field

from notale.core.evidence import FetchRecord, new_fetch_record
from notale.tools.retriever import FetchTool, Retriever
from notale.utils.config import get_config


_CACHE_LOCKS: dict[str, asyncio.Lock] = {}
_CONFIG = get_config()
_TOOLS_CONFIG = _CONFIG.tools
_RESEARCH_CONFIG = _CONFIG.research


class FetchWebInput(BaseModel):
    url: str = Field(description="要抓取的页面 URL")
    query: str = Field(default="", description="希望从原文中定位的主题或短语")


class SearchWebInput(BaseModel):
    query: str = Field(description="用于发现可靠来源 URL 的检索词")
    max_results: int = Field(
        default=_TOOLS_CONFIG.web_search_default_results,
        ge=1,
        le=_TOOLS_CONFIG.web_search_max_results,
        description="返回结果数",
    )


class SearchWebTool(BaseTool):
    """A budgeted discovery tool; fetch_web remains the evidence-bearing operation."""

    name = "web_search"
    description = "搜索网页并返回标题、URL 和摘要；先搜索再用 fetch_web 抓取可引用原文。"
    input_model = SearchWebInput

    def __init__(
        self,
        *,
        state_path: Path | None = None,
        max_requests: int = _RESEARCH_CONFIG.web_search_max_requests_per_branch,
        inner: BaseTool | None = None,
    ) -> None:
        self.state_path = Path(state_path) if state_path else None
        self.max_requests = max_requests
        self._inner = inner or WebSearchTool()
        self.attempts = 0
        if self.state_path and self.state_path.exists():
            raw = json.loads(self.state_path.read_text(encoding="utf-8"))
            self.attempts = int(raw.get("webSearchAttempts", 0))

    def _save(self) -> None:
        if self.state_path is None:
            return
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {}
        if self.state_path.exists():
            payload = json.loads(self.state_path.read_text(encoding="utf-8"))
        payload["webSearchAttempts"] = self.attempts
        tmp = self.state_path.with_suffix(self.state_path.suffix + ".search.tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(self.state_path)

    def is_read_only(self, arguments: SearchWebInput) -> bool:
        del arguments
        return True

    async def execute(self, arguments: SearchWebInput, context: ToolExecutionContext) -> ToolResult:
        if self.attempts >= self.max_requests:
            return ToolResult(
                output=(f"web_search 尝试额度已用完（{self.max_requests} 次）；"
                        "不要继续搜索，使用已有来源并尽快 submit_research"),
                is_error=True,
            )
        self.attempts += 1
        self._save()
        result = await self._inner.execute(
            WebSearchToolInput(query=arguments.query, max_results=arguments.max_results),
            context,
        )
        remaining = self.max_requests - self.attempts
        return ToolResult(
            output=f"[searchAttemptsRemaining={remaining}]\n{result.output}",
            is_error=result.is_error,
            metadata=result.metadata,
        )


class FetchWebTool(BaseTool):
    """包装 Retriever（真实现是 httpx GET）的 OpenHarness 工具。"""

    name = "fetch_web"
    description = "抓取指定 URL 的网页正文（纯文本、有界返回）。引用网络事实前必须先抓原文。"
    input_model = FetchWebInput

    def __init__(
        self,
        retriever: Retriever | None = None,
        *,
        max_chars: int = _RESEARCH_CONFIG.fetch_excerpt_chars,
        state_path: Path | None = None,
        cache_dir: Path | None = None,
        max_requests: int = _RESEARCH_CONFIG.fetch_max_requests_per_branch,
    ) -> None:
        self._retriever = retriever or FetchTool()
        self.max_chars = max_chars
        self.state_path = Path(state_path) if state_path else None
        self.cache_dir = Path(cache_dir) if cache_dir else None
        self.max_requests = max_requests
        self.records: list[FetchRecord] = []
        self.attempts = 0
        if self.state_path and self.state_path.exists():
            raw = json.loads(self.state_path.read_text(encoding="utf-8"))
            self.records = [FetchRecord.model_validate(item) for item in raw.get("fetchRecords", [])]
            self.attempts = int(raw.get("fetchAttempts", len(self.records)))

    def _save(self) -> None:
        if self.state_path is None:
            return
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {}
        if self.state_path.exists():
            payload = json.loads(self.state_path.read_text(encoding="utf-8"))
        payload["fetchRecords"] = [item.model_dump(mode="json") for item in self.records]
        payload["fetchAttempts"] = self.attempts
        tmp = self.state_path.with_suffix(self.state_path.suffix + ".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(self.state_path)

    def is_read_only(self, arguments: FetchWebInput) -> bool:
        del arguments
        return True

    async def execute(self, arguments: FetchWebInput, context: ToolExecutionContext) -> ToolResult:
        del context
        if self.attempts >= self.max_requests:
            return ToolResult(
                output=(f"fetch_web 尝试额度已用完（{self.max_requests} 次）；"
                        "不要继续抓取，整理已有证据并立即 submit_research"),
                is_error=True,
            )
        self.attempts += 1
        self._save()
        cache_path = None
        content = ""
        cache_hit = False
        if self.cache_dir is not None:
            digest = hashlib.sha256(arguments.url.encode("utf-8")).hexdigest()
            cache_path = self.cache_dir / f"{digest}.json"
            if cache_path.is_file():
                cached = json.loads(cache_path.read_text(encoding="utf-8"))
                if cached.get("url") == arguments.url:
                    content = str(cached.get("content", ""))
                    cache_hit = bool(content)
        if not content:
            lock = _CACHE_LOCKS.setdefault(str(cache_path or arguments.url), asyncio.Lock())
            async with lock:
                # Another research branch may have populated the shared cache while waiting.
                if cache_path is not None and cache_path.is_file():
                    cached = json.loads(cache_path.read_text(encoding="utf-8"))
                    if cached.get("url") == arguments.url:
                        content = str(cached.get("content", ""))
                        cache_hit = bool(content)
                if not content:
                    try:
                        content = await self._retriever.fetch(arguments.url)
                    except Exception as e:  # noqa: BLE001 - 抓取失败如实回报模型，不假装抓到
                        return ToolResult(
                            output=(f"抓取失败：{type(e).__name__}: "
                                    f"{str(e)[: _TOOLS_CONFIG.fetch_error_max_chars]}"),
                            is_error=True,
                        )
                    if cache_path is not None:
                        cache_path.parent.mkdir(parents=True, exist_ok=True)
                        tmp = cache_path.with_name(cache_path.name + f".{id(self)}.tmp")
                        tmp.write_text(json.dumps({"url": arguments.url, "content": content},
                                                  ensure_ascii=False), encoding="utf-8")
                        tmp.replace(cache_path)
        self.records.append(new_fetch_record(arguments.url, content))  # 提取即绑定
        self._save()
        excerpt = content
        if arguments.query.strip():
            terms = [
                term for term in re.split(r"\s+", arguments.query.strip())
                if len(term) >= _TOOLS_CONFIG.fetch_query_term_min_chars
            ]
            positions = [content.lower().find(term.lower()) for term in terms]
            positions = [pos for pos in positions if pos >= 0]
            if positions:
                start = max(
                    0,
                    min(positions) - self.max_chars // _TOOLS_CONFIG.fetch_excerpt_lead_divisor,
                )
                excerpt = content[start : start + self.max_chars]
        output = excerpt[: self.max_chars]
        return ToolResult(
            output=(f"[url={arguments.url!r} cacheHit={cache_hit} "
                    f"fetchAttemptsRemaining={self.max_requests - self.attempts} "
                    f"returnedChars={len(output)} totalChars={len(content)}]\n" + output),
            metadata={"url": arguments.url, "cacheHit": cache_hit, "totalChars": len(content)},
        )
