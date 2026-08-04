"""PixabayProvider —— 图库关键词检索，实现 ports.media.ImageFinder。

下载命中图片字节后立即转 data URI（离线红线：doc 里绝不落远程 URL）。api key 从环境变量读，
永不入配置，同 adapters/llm/client.py 的既有约定。
"""

from __future__ import annotations

import base64
import os

import httpx

from ...ports.media import ImageAsset


class PixabayProvider:
    def __init__(self, *, api_key_env: str = "PIXABAY_API_KEY", timeout: float = 20.0) -> None:
        self.api_key_env = api_key_env
        self.timeout = timeout

    def _api_key(self) -> str:
        key = os.environ.get(self.api_key_env)
        if not key:
            raise RuntimeError(f"缺 API key：设环境变量 {self.api_key_env}")
        return key

    async def find_image(self, query: str) -> ImageAsset | None:
        # trust_env=False：Pixabay 实测直连可通，不路由本地翻墙代理（同 GEN-40 的直连纪律）。
        async with httpx.AsyncClient(timeout=self.timeout, trust_env=False) as client:
            resp = await client.get(
                "https://pixabay.com/api/",
                params={
                    "key": self._api_key(),
                    "q": query,
                    "image_type": "photo",
                    "per_page": 3,
                    "safesearch": "true",
                },
            )
            if resp.status_code != 200:
                return None
            hits = resp.json().get("hits") or []
            if not hits:
                return None
            img_url = hits[0].get("webformatURL")
            if not img_url:
                return None
            img_resp = await client.get(img_url)
            if img_resp.status_code != 200:
                return None
            mime = img_resp.headers.get("content-type", "image/jpeg").split(";")[0]
            b64 = base64.b64encode(img_resp.content).decode("ascii")
            hit = hits[0]
            return ImageAsset(
                data_uri=f"data:{mime};base64,{b64}",
                source=str(hit.get("pageURL") or "Pixabay"),
                attribution=str(hit.get("user") or "Pixabay contributor"),
                width=int(hit.get("imageWidth") or 0) or None,
                height=int(hit.get("imageHeight") or 0) or None,
            )
