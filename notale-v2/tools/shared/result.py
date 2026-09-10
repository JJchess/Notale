from __future__ import annotations
from pathlib import Path
from dataclasses import dataclass, field


CAP = 30_000


@dataclass
class Out:
    """一次工具调用的结果。

    `images` 非空时 builder 会在 `function_call_output` 之后**再追加一条带图的
    user 消息** —— tool_result 本身在 responses 和 chat 两条 wire 上都只装字符串。
    """

    text: str
    images: list[tuple[str, str]] = field(default_factory=list)  # (media_type, base64)


def _cap(s: str, cap: int = CAP) -> str:
    return s if len(s) <= cap else s[:cap] + f"\n…（已截断，原文 {len(s):,} 字符）"
