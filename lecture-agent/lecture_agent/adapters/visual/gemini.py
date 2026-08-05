"""Gemini screenshot reviewer through Google's OpenAI-compatible endpoint."""

from __future__ import annotations

import asyncio
import base64
import json
import os
from pathlib import Path
from typing import Any

import httpx

from ...domain.evaluation.visual_quality import parse_visual_review, unavailable_visual_review
from ...ports.visual_review import ImageInput, VisualReviewReport, VisualReviewRequest

_SYSTEM_PROMPT = """你是演示文稿的截图级视觉总监。只根据最终渲染像素评估，不评判未显示的规划意图。
六个维度分别给 1–5 分：visualHierarchy、composition、assetIntegration、
informationDensity、legibility、crossPageRhythm。检查主体大小、留白、裁剪、层级、跨页重复、
视觉系统漂移以及图片与原生文字/图形的结合。不要把风格偏好冒充硬错误。
assetIntegration 评估“被选择的资产是否整合得好”，不是图片数量分：若该课没有教学所需的 media，
且 diagram/chart/sim/runtime 等结构化证据选择正确，应按不缺资产处理，不能因为没有图片而扣分或要求硬塞装饰图。

每个问题必须定位到已提供的 sceneId，并且 route 只能是：
- tokens：色彩、字体、surface、间距等设计 token
- composition：区域、尺寸、对齐、层级、裁剪、留白或跨页节奏
- media：资产选择、焦点、真实性、图片处理或图文关系
- blockContent：单个 block 内部的信息密度或视觉表达

`media` 只用于 photo/illustration/video/background 等真实资产。sim/widget、diagram、graph、chart、
runnable、formula 内部缺节点、边、标签、代码样式或绘图内容，必须 route=`blockContent`，绝不能写成 media。
若画面只有空坐标、问号占位、黑圆点而缺少题目要求的节点标签/连线/状态，这属于 blockContent 硬问题。

overflow、runtime error、控件失效等浏览器硬错误不由你放行或覆盖。
只输出 JSON：
{"scores":{"visualHierarchy":1到5,"composition":1到5,"assetIntegration":1到5,
"informationDensity":1到5,"legibility":1到5,"crossPageRhythm":1到5},
"issues":[{"sceneId":"...","route":"tokens|composition|media|blockContent",
"problem":"像素中可验证的问题","instruction":"不改教学目标的具体修法"}],"summary":"整档判断"}。"""


class GeminiVisualReviewer:
    def __init__(
        self,
        *,
        model: str = "gemini-3.6-flash",
        temperature: float = 0.2,
        thinking_level: str = "low",
        timeout: float = 45.0,
        base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai",
        proxy: str | None = None,
    ) -> None:
        self.model = model
        self.temperature = temperature
        self.thinking_level = thinking_level
        self.timeout = timeout
        self.base_url = base_url.rstrip("/")
        self.proxy = proxy

    @staticmethod
    def _image_part(image: ImageInput) -> dict[str, Any]:
        if isinstance(image, bytes):
            payload = image
            mime = "image/png"
        else:
            path = Path(image)
            payload = path.read_bytes()
            suffix = path.suffix.lower()
            mime = "image/jpeg" if suffix in {".jpg", ".jpeg"} else "image/png"
        encoded = base64.b64encode(payload).decode("ascii")
        return {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{encoded}"}}

    async def _complete(self, body: dict[str, Any], key: str) -> str:
        async with httpx.AsyncClient(
            timeout=self.timeout, trust_env=False, proxy=self.proxy
        ) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json=body,
            )
            response.raise_for_status()
            data = response.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content")
            if not content:
                raise RuntimeError("Gemini visual reviewer returned an empty response")
            return str(content)

    async def review(self, request: VisualReviewRequest) -> VisualReviewReport:
        key = os.environ.get("GEMINI_API_KEY")
        if not key:
            return unavailable_visual_review("视觉审查未运行：缺少 GEMINI_API_KEY")
        try:
            content: list[dict[str, Any]] = [
                {
                    "type": "text",
                    "text": "Deck context:\n"
                    + json.dumps(request.deck_context, ensure_ascii=False, default=str)
                    + "\n第一张图是整档 contact sheet；其余是需要细查的页面。",
                },
                self._image_part(request.contact_sheet),
            ]
            content.extend(self._image_part(image) for image in request.failed_pages)
            body = {
                "model": self.model,
                "temperature": self.temperature,
                "reasoning_effort": self.thinking_level,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": content},
                ],
            }
            raw = await asyncio.wait_for(self._complete(body, key), timeout=self.timeout)
            try:
                return parse_visual_review(raw)
            except (ValueError, json.JSONDecodeError):
                # Even with response_format, model-authored issue text can contain an invalid
                # backslash escape. Repair the existing judgment without resending screenshots.
                repair_body = {
                    **body,
                    "messages": [
                        {"role": "system", "content": _SYSTEM_PROMPT},
                        {"role": "assistant", "content": raw},
                        {
                            "role": "user",
                            "content": "上条不是合法 JSON。保持分数、sceneId 和问题含义不变，转义所有反斜杠，只输出合法 JSON 对象。",
                        },
                    ],
                }
                repaired = await asyncio.wait_for(
                    self._complete(repair_body, key), timeout=self.timeout
                )
                return parse_visual_review(repaired)
        except TimeoutError:
            return unavailable_visual_review(
                f"视觉审查超过 {self.timeout:g}s，已 fail-open，不阻塞生成"
            )
        except Exception as exc:  # noqa: BLE001 - optional visual QA must not stop generation
            return unavailable_visual_review(f"视觉审查失败，已 fail-open: {str(exc)[:180]}")
