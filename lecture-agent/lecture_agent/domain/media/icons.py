"""图标检索：关键词/标签重合打分（纯函数，零网络、零重依赖）。

presenton 用 FastEmbed 向量语义检索；这里是刻意简化的 v1（不引入 onnxruntime 这类重依赖），
同样"零网络、零 key"，检索源是 `viewer/vendor/icons/icons.json`（离线打包的 Lucide 图标子集）。
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

_CJK = re.compile(r"[一-鿿]")
_SPLIT = re.compile(r"[\s,，、/]+")


def _icons_path() -> Path:
    # lecture_agent/domain/media/icons.py -> 上溯 4 层到 ws2/（viewer/ 是 lecture-agent/ 的兄弟目录，
    # 不在其内部；registry.py 的 default_skills_dir 只需上溯 3 层是因为 skills/ 就在 lecture-agent/ 内）
    return Path(__file__).resolve().parents[4] / "viewer" / "vendor" / "icons" / "icons.json"


@lru_cache(maxsize=1)
def _load_icons() -> dict[str, dict[str, Any]]:
    p = _icons_path()
    if not p.exists():
        return {}
    return json.loads(p.read_text(encoding="utf-8"))  # type: ignore[no-any-return]


def _tokenize(text: str) -> set[str]:
    """中文没有天然分词，逐字拆；英文/连字符按空白拆词。粗糙但对标签重合打分够用。"""
    out: set[str] = set()
    for part in _SPLIT.split(text):
        if not part:
            continue
        if _CJK.search(part):
            out.update(part)
        else:
            out.add(part.lower())
    return out


def find_icon(query: str) -> str | None:
    """按关键词重合打分找最贴的本地图标 id；零匹配返回 None（不硬凑不相关图标）。"""
    icons = _load_icons()
    if not icons or not query:
        return None
    q = _tokenize(query)
    best_id: str | None = None
    best_score = 0
    for icon_id, meta in icons.items():
        tags = _tokenize(str(meta.get("tags", "")) + " " + icon_id.replace("-", " "))
        score = len(q & tags)
        if score > best_score:
            best_id, best_score = icon_id, score
    return best_id


def attach_icons(doc: dict[str, Any]) -> int:
    """确定性后处理：list block 里没显式给 icon 的 item，按 text 关键词匹配自动配一个本地图标
    （零 LLM 调用、零网络，跟 assign_layouts 一样是生成后的纯函数收尾步骤）。"""
    n = 0
    for scene in doc.get("scenes", []):
        for block in scene.get("blocks", []) or []:
            if block.get("type") != "list":
                continue
            for item in block.get("items", []) or []:
                if item.get("icon"):
                    continue
                icon_id = find_icon(str(item.get("text", "")))
                if icon_id:
                    item["icon"] = icon_id
                    n += 1
    return n
