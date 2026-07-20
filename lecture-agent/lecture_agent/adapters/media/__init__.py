"""媒体 adapters：图库检索(Pixabay) + 文生图(Gemini nano-banana) + 测试 fake。"""

from .fake import FakeMediaProvider
from .gemini_image import GeminiImageProvider
from .pixabay import PixabayProvider

__all__ = ["FakeMediaProvider", "GeminiImageProvider", "PixabayProvider"]
