"""LLM adapters：httpx 真客户端 + 录制盒（确定性）+ 测试 fake。"""

from .cassette import CassetteClient
from .client import HttpxClient
from .fake import FakeClient

__all__ = ["CassetteClient", "HttpxClient", "FakeClient"]
