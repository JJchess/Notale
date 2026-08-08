"""出处的确定性绑定（PREP §2.1）——让"事后补出处"在结构上不可能发生。

出处不是模型填的字段，是工具调用记录自动带出来的事实：
1. 提取即绑定：每次抓取工具调用，harness 自动把 URL + 抓取时间存成 FetchRecord；
2. 引文必须是抓回文档的字面子串，机器校验，零成本；
3. 校验失败 = 伪造或张冠李戴 → 抛 EvidenceBindingError，调用方丢弃该条资料并记事件
   （宁可没有这条资料，不留假出处）。
"""

from __future__ import annotations

import datetime
import re

from pydantic import BaseModel

from artifacts import Evidence


class FetchRecord(BaseModel):
    """一次抓取工具调用的原始记录——harness 侧事实，模型摸不到。"""

    url: str
    content: str  # 抓回的文档全文
    fetchedAt: str


class EvidenceBindingError(ValueError):
    pass


_WS = re.compile(r"\s+")


def _normalize(text: str) -> str:
    """子串比对前做空白归一（HTML 抓取的空格/换行差异不算伪造）。"""
    return _WS.sub(" ", text).strip()


def new_fetch_record(url: str, content: str) -> FetchRecord:
    """工具调用落点：harness 自动记 URL 与抓取时间。"""
    return FetchRecord(
        url=url,
        content=content,
        fetchedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    )


def bind_evidence(fetch: FetchRecord, quoted_span: str) -> Evidence:
    """从抓取记录绑定出处。引文必须是抓回文档的字面子串，否则抛错。"""
    span = _normalize(quoted_span)
    if not span:
        raise EvidenceBindingError("空引文")
    if span not in _normalize(fetch.content):
        raise EvidenceBindingError(f"引文不是 {fetch.url} 抓回内容的字面子串（伪造或张冠李戴）")
    return Evidence(url=fetch.url, quotedSpan=quoted_span.strip(), fetchedAt=fetch.fetchedAt)
