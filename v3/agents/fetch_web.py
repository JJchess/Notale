"""FetchWebTool —— research agent 的网页抓取工具，出处绑定纪律的落点。

模型自己调工具抓 url；每次抓取 harness 侧自动落 FetchRecord（evidence.new_fetch_record：
URL + 抓取时间），存进工具的 `.records`。事后 bind_evidence 只认这些记录——
"模型没抓过的 url"在结构上无法变成出处（PREP §2.1，比旧线更彻底：旧线由 harness 代抓，
现在抓取动作本身也在工具记录里）。
"""

from __future__ import annotations

from openharness.tools.base import BaseTool, ToolExecutionContext, ToolResult
from pydantic import BaseModel, Field

from evidence import FetchRecord, new_fetch_record
from tools.retriever import FetchTool, Retriever


class FetchWebInput(BaseModel):
    url: str = Field(description="要抓取的页面 URL")


class FetchWebTool(BaseTool):
    """包装 v3 Retriever（真实现是 httpx GET，见 tools/retriever.py）的 openharness 工具。"""

    name = "fetch_web"
    description = "抓取指定 URL 的网页正文（纯文本，截断 20000 字符）。引用网络事实前必须先抓原文。"
    input_model = FetchWebInput

    def __init__(self, retriever: Retriever | None = None, *, max_chars: int = 20000) -> None:
        self._retriever = retriever or FetchTool()
        self.max_chars = max_chars
        self.records: list[FetchRecord] = []  # harness 侧事实：每次抓取自动落

    def is_read_only(self, arguments: FetchWebInput) -> bool:
        del arguments
        return True

    async def execute(self, arguments: FetchWebInput, context: ToolExecutionContext) -> ToolResult:
        del context
        try:
            content = await self._retriever.fetch(arguments.url)
        except Exception as e:  # noqa: BLE001 - 抓取失败如实回报模型，不假装抓到
            return ToolResult(output=f"抓取失败：{e}", is_error=True)
        self.records.append(new_fetch_record(arguments.url, content))  # 提取即绑定
        return ToolResult(output=content[: self.max_chars])
