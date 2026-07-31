"""ports —— L1 纯抽象接缝（Protocol，零实现）。只依赖 schema。

只在"真会变的轴"上开接缝（≥2 实现才算真接缝）：
- LLMClient / ToolCallingLLM：httpx-live / cassette-replay / in-memory-fake
- Tool：纯工具(calc,domain) / 有 I-O 工具(retrieve,adapters) / test-fake
- RenderVerifier：structural（纯 schema，无浏览器）/ headless（真机无头 Edge，驱动 tools/render-check.mjs）
- CorpusStore：filesystem（共享 store adapter 的契约）
"""

from .llm import LLMClient, Message, ToolCallingLLM, ToolInvocation, Turn
from .renderer import RenderReport, RenderVerifier
from .store import CorpusStore
from .tool import Tool, ToolSpec

__all__ = [
    "LLMClient",
    "Message",
    "ToolCallingLLM",
    "ToolInvocation",
    "Turn",
    "Tool",
    "ToolSpec",
    "RenderReport",
    "RenderVerifier",
    "CorpusStore",
]
