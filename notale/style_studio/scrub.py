"""Remove explicit visual directives before a topic reaches the Planner."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

_STYLE_LABEL = (
    r"visual\s+style|style|look\s*(?:&|and)\s*feel|palette|colou?r(?:s|\s+scheme)?|"
    r"typography|fonts?|motion|视觉风格|整体风格|风格锚点|配色(?:方案)?|"
    r"色彩(?:方案)?|字体|排版风格|动效"
)
_MARKDOWN_HEADING = re.compile(r"^\s*(#{1,6})\s*(.*?)\s*$")
_STYLE_HEADING = re.compile(rf"^(?:{_STYLE_LABEL})\s*[:：]?\s*$", re.I)
_BRACKET_HEADING = re.compile(r"^\s*[【\[]\s*([^】\]]+)\s*[】\]]\s*(.*)$")
_STYLE_PREFIX = re.compile(rf"^\s*(?:{_STYLE_LABEL})\s*[:：]", re.I)

# These expressions match the directive itself, not the surrounding sentence.
# A colour literal is never removed merely for being a colour literal.
_INLINE_PATTERNS = [
    re.compile(
        r"(?:请\s*)?(?:使用|采用|选用|设置为|做成)\s*"
        r"(?:深色|浅色|暗色|亮色)\s*(?:主题|模式|背景|页面背景|幻灯片背景)",
        re.I,
    ),
    re.compile(
        r"(?:整体|视觉|页面|幻灯片|PPT)\s*(?:风格|配色|背景)\s*"
        r"(?:为|是|采用|使用)\s*[^，,。；;\n]{1,36}",
        re.I,
    ),
    re.compile(
        r"(?:使用|采用|选用|以)\s*"
        r"(?:#[0-9a-fA-F]{3,8}|[A-Za-z-]+|[\u4e00-\u9fff]{1,10})"
        r"(?:\s*(?:、|和|及|与|,|\+)\s*"
        r"(?:#[0-9a-fA-F]{3,8}|[A-Za-z-]+|[\u4e00-\u9fff]{1,10})){0,3}\s*"
        r"(?:作为\s*)?(?:配色|色调|主题色|背景色|强调色)",
        re.I,
    ),
    re.compile(
        r"(?:使用|采用|加入|搭配|做成)\s*"
        r"(?:大?圆角(?:卡片)?|直角卡片|毛玻璃|玻璃拟态|投影|阴影|渐变背景?)",
        re.I,
    ),
    re.compile(
        r"\b(?:use|with|adopt)\s+(?:an?\s+)?(?:dark|light)\s+"
        r"(?:theme|mode|slide background)\b",
        re.I,
    ),
    re.compile(
        r"\b(?:use|with|adopt)\s+[^,.;\n]{1,32}\s+"
        r"(?:palette|colou?r scheme|rounded cards?|glassmorphism|drop shadows?|"
        r"gradient background)\b",
        re.I,
    ),
]


@dataclass
class ScrubResult:
    text: str
    removed: list[str] = field(default_factory=list)

    @property
    def changed(self) -> bool:
        return bool(self.removed)


def _remember(removed: list[str], fragment: str) -> None:
    clean = " ".join(fragment.strip().split())
    if clean and clean not in removed:
        removed.append(clean[:240])


def _scrub_inline(line: str, removed: list[str]) -> str:
    result = line
    for pattern in _INLINE_PATTERNS:
        matches = list(pattern.finditer(result))
        for match in matches:
            _remember(removed, match.group(0))
        result = pattern.sub("", result)
    # Repair only punctuation adjacent to a removed phrase. Content punctuation,
    # code, CSS declarations, and colour literals otherwise remain untouched.
    result = re.sub(r"[ \t]{2,}", " ", result)
    result = re.sub(r"^[ \t]*[，,、]\s*", "", result)
    result = re.sub(r"\s*[，,、]\s*([。；;.])", r"\1", result)
    result = re.sub(r"([，,、])(?:\s*[，,、])+", r"\1", result)
    return result.rstrip()


def scrub_topic_for_content(text: str) -> ScrubResult:
    """Strip only explicit style sections, fields, and directive phrases."""

    removed: list[str] = []
    kept: list[str] = []
    markdown_style_level: int | None = None
    bracket_style_section = False

    for line in (text or "").splitlines():
        markdown = _MARKDOWN_HEADING.match(line)
        if markdown:
            level = len(markdown.group(1))
            title = markdown.group(2).strip()
            if markdown_style_level is not None and level <= markdown_style_level:
                markdown_style_level = None
            if _STYLE_HEADING.fullmatch(title):
                markdown_style_level = level
                bracket_style_section = False
                _remember(removed, line)
                continue
            if markdown_style_level is not None:
                _remember(removed, line)
                continue

        bracket = _BRACKET_HEADING.match(line)
        if bracket:
            label, remainder = bracket.group(1).strip(), bracket.group(2).strip()
            if _STYLE_HEADING.fullmatch(label):
                bracket_style_section = not bool(remainder.lstrip(":：").strip())
                markdown_style_level = None
                _remember(removed, line)
                continue
            bracket_style_section = False

        if markdown_style_level is not None or bracket_style_section:
            _remember(removed, line)
            continue
        if _STYLE_PREFIX.match(line):
            _remember(removed, line)
            continue

        kept.append(_scrub_inline(line, removed))

    # Keep intentional paragraph boundaries but discard lines emptied by a
    # directive. This also avoids returning a topic made mostly of blank space.
    result: list[str] = []
    for line in kept:
        if line.strip():
            result.append(line.strip())
        elif result and result[-1] != "":
            result.append("")
    while result and result[-1] == "":
        result.pop()
    return ScrubResult(text="\n".join(result).strip(), removed=removed)


def scrub_style_opinions(text: str) -> ScrubResult:
    """Backward-compatible descriptive alias for the Planner scrub."""

    return scrub_topic_for_content(text)
