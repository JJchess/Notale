"""讲者备注增强（一次 LLM 调用）：把占位式 notes 补成有料讲稿。对应旧 src/notes.mjs。"""

from __future__ import annotations

from typing import Any

from ...ports.llm import LLMClient
from ...utils.jsonio import parse_json


async def enrich_notes(
    llm: LLMClient, doc: dict[str, Any], *, audience: str = ""
) -> dict[str, Any]:
    """为每页写详实讲者备注（展开/直觉/误区/衔接）。失败则保留原 notes。"""
    scenes = doc.get("scenes", [])
    if not scenes:
        return doc
    sys = (
        "你是资深讲者。给定一节讲义的大纲，为**每一页**写详实的讲者备注（讲稿），2-4 句：展开关键点的"
        "解释/推导/直觉，点出学生常见误区，必要时给数据诚实说明，并做承上启下的衔接。不要照抄正文。"
        + (f"受众：{audience}，措辞与深度匹配。" if audience else "")
        + '\n只输出 JSON：{ "notes": ["第1页备注", …] }，数组长度必须等于页数、顺序对齐。'
    )
    listing = "\n".join(
        f"p{i + 1} [{s.get('kind')}] {s.get('headline') or s.get('eyebrow') or '(封面/收尾)'} "
        f"— 块: {','.join(b.get('type', '') for b in (s.get('blocks') or []))}"
        for i, s in enumerate(scenes)
    )
    user = f"讲义标题：{doc.get('title')}\n页数：{len(scenes)}\n\n各页：\n{listing}\n\n为这 {len(scenes)} 页各写一条讲者备注。"
    try:
        r = parse_json(
            await llm.complete(
                [{"role": "system", "content": sys}, {"role": "user", "content": user}],
                purpose="notes",
            )
        )
        notes = r.get("notes") if isinstance(r.get("notes"), list) else None
        if notes and len(notes) == len(scenes):
            for i, s in enumerate(scenes):
                if isinstance(notes[i], str) and len(notes[i].strip()) > len(s.get("notes", "")):
                    s["notes"] = notes[i].strip()
    except Exception:  # noqa: BLE001
        pass
    return doc
