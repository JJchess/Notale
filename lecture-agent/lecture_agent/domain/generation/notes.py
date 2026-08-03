"""讲者备注增强：把占位式 notes 补成有料讲稿。对应旧 src/notes.mjs。

原为"一次调用出全部页"的大串行——对低吞吐/重 reasoning 模型是延迟大头。改为**逐页并行**
（`utils.concurrency.pool`），每页一个短调用、附相邻页标题保"承上启下"，并发由调用方给。
每调用独立软上限：尽力而为，超时即保留占位，不拖垮流水线。
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from ...ports.llm import LLMClient
from ...utils.concurrency import pool
from ...utils.jsonio import parse_json

_NOTES_SOFT_TIMEOUT_S = 180.0  # 单页软上限（逐页后每次都很短，慢模型也够）


async def enrich_notes(
    llm: LLMClient,
    doc: dict[str, Any],
    *,
    audience: str = "",
    concurrency: int = 4,
    page_briefs: dict[str, dict[str, str]] | None = None,
) -> dict[str, Any]:
    """逐页并行写详实讲者备注（展开/直觉/误区/衔接）。失败则保留原 notes。"""
    scenes = doc.get("scenes", [])
    if not scenes:
        return doc
    title = doc.get("title")
    sys = (
        "你是严谨的资深讲者。为讲义的**这一页**写一条详实讲者备注（讲稿）3-5 句。"
        "你会收到本页最终 block 的真实 JSON；只能依据这些内容解释推导、数据和交互，严禁从 block 类型或标题脑补。"
        "先核对公式、数字与解释是否一致；若页面只给了示意数据就明确说是示意，不得补造论文、年份、比例或人物原话。"
        "点出 brief 中的误区并与相邻页衔接，但不要照抄正文。"
        + (f"受众：{audience}，措辞与深度匹配。" if audience else "")
        + '\n只输出 JSON：{ "note": "本页备注" }'
    )

    def head(i: int) -> str:
        if i < 0 or i >= len(scenes):
            return "（无）"
        s = scenes[i]
        return str(s.get("headline") or s.get("eyebrow") or s.get("kind") or "（封面/收尾）")

    def compact(value: Any, *, key: str = "") -> Any:
        """保留讲稿所需公式/数据/解释，裁掉大段二进制、HTML 与实现代码。"""
        if isinstance(value, dict):
            return {str(k): compact(v, key=str(k)) for k, v in value.items() if k not in {"image"}}
        if isinstance(value, list):
            return [compact(v, key=key) for v in value]
        if isinstance(value, str):
            if key == "html":
                return f"[互动组件 HTML 已省略，共 {len(value)} 字；请只依据 caption/参数/本页目标描述]"
            limit = 1600 if key in {"source", "computeJs"} else 2400
            return value if len(value) <= limit else value[:limit] + "…[截断]"
        return value

    async def one(scene: dict[str, Any], i: int) -> None:
        brief = (page_briefs or {}).get(str(scene.get("id")), {})
        page_payload = {
            "brief": brief,
            "headline": scene.get("headline"),
            "lead": scene.get("lead"),
            "blocks": compact(scene.get("blocks") or []),
        }
        user = (
            f"讲义：{title}（共 {len(scenes)} 页）\n"
            f"本页 第{i + 1}页 [{scene.get('kind')}] {head(i)}\n"
            f"上一页: {head(i - 1)}｜下一页: {head(i + 1)}\n\n为本页写一条讲者备注。"
            f"\n\n本页最终内容 JSON：\n{json.dumps(page_payload, ensure_ascii=False)}"
        )
        try:
            r = parse_json(
                await asyncio.wait_for(
                    llm.complete(
                        [{"role": "system", "content": sys}, {"role": "user", "content": user}],
                        purpose="notes",
                    ),
                    timeout=_NOTES_SOFT_TIMEOUT_S,
                )
            )
            note = r.get("note")
            if isinstance(note, str) and len(note.strip()) > len(scene.get("notes", "")):
                scene["notes"] = note.strip()
        except Exception:  # noqa: BLE001 —— 尽力而为，失败保留占位
            pass

    await pool(scenes, concurrency, one)
    return doc
