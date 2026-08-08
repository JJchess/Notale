"""检索/抓取工具——research fan-out 的外部输入口。

- FetchTool：真实现（httpx GET），抓回文本交给 harness 做出处绑定；
- FakeRetriever：测试替身，罐装 url→内容，记录调用。
"""

from __future__ import annotations

import re
from typing import Protocol

import httpx

_TAG = re.compile(r"<[^>]+>")
_SCRIPT_STYLE = re.compile(r"<(script|style)[^>]*>.*?</\1>", re.S | re.I)


class Retriever(Protocol):
    async def fetch(self, url: str) -> str: ...


class FetchTool:
    def __init__(self, timeout: float = 30.0, max_chars: int = 20000) -> None:
        self.timeout = timeout
        self.max_chars = max_chars

    async def fetch(self, url: str) -> str:
        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
        text = resp.text
        if "<html" in text[:2000].lower():
            text = _SCRIPT_STYLE.sub(" ", text)
            text = _TAG.sub(" ", text)
        return re.sub(r"\s+", " ", text).strip()[: self.max_chars]


class FakeRetriever:
    def __init__(self, pages: dict[str, str] | None = None) -> None:
        self.pages = pages or {}
        self.calls: list[str] = []

    async def fetch(self, url: str) -> str:
        self.calls.append(url)
        if url not in self.pages:
            raise RuntimeError(f"FakeRetriever 没有罐装页面：{url}")
        return self.pages[url]
