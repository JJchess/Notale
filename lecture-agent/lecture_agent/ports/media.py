"""图库检索 / 文生图接缝：domain 只认接口，不知道 Pixabay/Gemini 端点。

跟 ports.llm 一样把能力拆两个最小 Protocol，opt-in：
- ImageFinder.find_image —— 图库关键词检索（如 Pixabay）
- ImageGenerator.generate_image —— 文生图（如 Gemini nano-banana pro）

下载/生成后立即转 data: URI——绝不把远程 URL 落进 doc（离线红线，见 schema/validate.py 对
hero.image 的语义校验），调用方只管拿 ImageAsset.data_uri 直接塞进 block 字段。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable


@dataclass
class ImageAsset:
    data_uri: str  # data:<mime>;base64,<...>


@runtime_checkable
class ImageFinder(Protocol):
    async def find_image(self, query: str) -> ImageAsset | None:
        """按关键词查图库，找不到返回 None（不硬凑不相关图）。"""
        ...


@runtime_checkable
class ImageGenerator(Protocol):
    async def generate_image(self, prompt: str) -> ImageAsset | None:
        """按提示词生成一张图，失败/无图返回 None。"""
        ...
