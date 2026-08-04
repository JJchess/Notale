"""GeminiImageProvider —— Gemini(nano-banana pro) 文生图，实现 ports.media.ImageGenerator。

走原生 generateContent 端点（图像生成不在 judge_gemini.yaml 用的 OpenAI 兼容 chat/completions
线上）；境外端点同 judge_gemini.yaml 需显式代理。响应 base64 图片字节直接转 data URI。
"""

from __future__ import annotations

import os

import httpx

from ...ports.media import ImageAsset


class GeminiImageProvider:
    def __init__(
        self,
        *,
        model: str = "nano-banana-pro-preview",
        api_key_env: str = "GEMINI_API_KEY",
        proxy: str | None = None,
        timeout: float = 60.0,
    ) -> None:
        self.model = model
        self.api_key_env = api_key_env
        self.proxy = proxy
        self.timeout = timeout

    def _api_key(self) -> str:
        key = os.environ.get(self.api_key_env)
        if not key:
            raise RuntimeError(f"缺 API key：设环境变量 {self.api_key_env}")
        return key

    async def generate_image(self, prompt: str) -> ImageAsset | None:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
        async with httpx.AsyncClient(
            timeout=self.timeout, trust_env=False, proxy=self.proxy
        ) as client:
            resp = await client.post(
                url,
                params={"key": self._api_key()},
                json={"contents": [{"parts": [{"text": prompt}]}]},
            )
            if resp.status_code != 200:
                return None
            data = resp.json()
            candidates = data.get("candidates") or []
            if not candidates:
                return None
            parts = candidates[0].get("content", {}).get("parts", [])
            for p in parts:
                inline = p.get("inlineData")
                if inline and inline.get("data"):
                    mime = inline.get("mimeType", "image/png")
                    return ImageAsset(
                        data_uri=f"data:{mime};base64,{inline['data']}",
                        source=f"Gemini image generation ({self.model})",
                    )
            return None
