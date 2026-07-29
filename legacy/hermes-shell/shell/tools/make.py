"""make_lecture —— 把确定性流水线 generate_lecture 包成一个外壳工具。

这是"流水线降级为工具"的落点：外壳决定何时造 deck，流水线仍确定性地产出。产物存进
CorpusStore（不进上下文窗口），工具只回**摘要**（deck_id / 页块数 / 类型计数 / 错误数）。
"""

from __future__ import annotations

import re
from typing import Any

from ...domain.telemetry import profile_deck
from ...ports.llm import LLMClient
from ...ports.store import CorpusStore
from ...ports.tool import ToolSpec
from ...engine import GeneratorOptions, generate_lecture

_SLUG = re.compile(r"[^0-9A-Za-z一-鿿]+")


def _slug(s: str) -> str:
    return _SLUG.sub("-", s.strip()).strip("-")[:48] or "lecture"


class MakeLectureTool:
    """构造注入 llm + CorpusStore（+ 可选生成开关/技能目录）；run() 造一份 deck 并存库。"""

    def __init__(
        self,
        llm: LLMClient,
        store: CorpusStore,
        *,
        options: GeneratorOptions | None = None,
        skills_dir: str | None = None,
        default_pages: int = 8,
    ) -> None:
        self._llm = llm
        self._store = store
        self._options = options
        self._skills_dir = skills_dir
        self._default_pages = default_pages

    @property
    def spec(self) -> ToolSpec:
        return {
            "name": "make_lecture",
            "description": (
                "根据课题生成一份完整讲义（LectureDoc），存入语料库并返回摘要。"
                "内部走确定性流水线（规划→逐块生成→组装→校验自修→备注）。"
                "返回的是摘要，不含正文；要看内容用 view_scene / view_block。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "topic": {"type": "string", "description": "课题"},
                    "pages": {"type": "integer", "description": "目标页数（默认 8）"},
                    "theme": {"type": "string", "description": "可选主题名；留空让规划器自选"},
                    "audience": {"type": "string", "description": "可选受众描述"},
                    "wants": {"type": "string", "description": "可选：用户明确想要的内容/侧重"},
                    "extra": {"type": "string", "description": "可选：其它约束/补充"},
                    "deck_id": {"type": "string", "description": "可选：deck 标识；留空按课题派生"},
                },
                "required": ["topic"],
            },
        }

    async def run(self, args: dict[str, Any]) -> str:
        topic = str(args.get("topic", "")).strip()
        if not topic:
            return "ERROR: 缺 topic"
        deck_id = str(args.get("deck_id") or "").strip() or _slug(topic)
        res = await generate_lecture(
            self._llm,
            topic=topic,
            pages=int(args.get("pages") or self._default_pages),
            theme=str(args.get("theme", "") or ""),
            audience=str(args.get("audience", "") or ""),
            wants=str(args.get("wants", "") or ""),
            extra=str(args.get("extra", "") or ""),
            options=self._options,
            skills_dir=self._skills_dir,
        )
        doc = res.doc
        doc["id"] = deck_id
        self._store.save_deck(deck_id, doc)
        prof = profile_deck(doc)
        top = ", ".join(
            f"{k}:{v}" for k, v in sorted(prof.block_types.items(), key=lambda kv: -kv[1])[:6]
        )
        status = "✓" if not res.errors else "✗"
        return (
            f"{status} deck '{deck_id}' 已存入语料库 · {prof.pages}页/{prof.blocks_total}块 · "
            f"类型[{top}] · theme={prof.theme} · 错误{len(res.errors)}/丢弃{len(res.dropped)} · "
            f"看内容: view_scene(deck_id='{deck_id}', index=i) / view_block(deck_id='{deck_id}', block_id=...)"
        )
