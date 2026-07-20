"""FakeMediaProvider —— 测试用 in-memory ImageFinder + ImageGenerator。不联网，记录调用供断言。"""

from __future__ import annotations

from ...ports.media import ImageAsset


class FakeMediaProvider:
    def __init__(
        self,
        found: ImageAsset | None = None,
        generated: ImageAsset | None = None,
    ) -> None:
        self._found = found
        self._generated = generated
        self.find_calls: list[str] = []
        self.generate_calls: list[str] = []

    async def find_image(self, query: str) -> ImageAsset | None:
        self.find_calls.append(query)
        return self._found

    async def generate_image(self, prompt: str) -> ImageAsset | None:
        self.generate_calls.append(prompt)
        return self._generated
