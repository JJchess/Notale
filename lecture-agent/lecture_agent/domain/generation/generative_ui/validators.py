from __future__ import annotations

import json
import re
import uuid
from typing import Any, Dict, List

from .constants import VISUAL_TRIGGERS_EN, VISUAL_TRIGGERS_ZH, WIDGET_TYPES


def parse_json_object(raw: str) -> Dict[str, Any]:
    text = str(raw or "").strip()
    if text.startswith("```"):
        text = text.replace("```json", "").replace("```", "").strip()
    try:
        payload = json.loads(text)
    except Exception:
        payload = {}
    return payload if isinstance(payload, dict) else {}


def parse_split_response(raw: str) -> Dict[str, Any]:
    text = str(raw or "").strip()

    widget_code = ""
    wc_match = re.search(r"<widget_code>\s*([\s\S]*?)\s*</widget_code>", text)
    if wc_match:
        widget_code = wc_match.group(1).strip()
        text = text[: wc_match.start()].strip()

    if text.startswith("```"):
        text = re.sub(r"^```[a-z]*\n?", "", text).rstrip("`").strip()

    data: Dict[str, Any] = {}
    json_match = re.search(r"\{[\s\S]*\}", text)
    if json_match:
        try:
            parsed = json.loads(json_match.group(0))
            if isinstance(parsed, dict):
                data = parsed
        except Exception:
            pass

    if widget_code:
        data["widget_code"] = widget_code

    return data


def is_widget_code_valid(widget_code: str) -> bool:
    if len(widget_code or "") < 50:
        return False
    normalized = widget_code.lower()
    if any(tag in normalized for tag in ("<!doctype", "<html", "<head", "<body")):
        return False
    return any(token in normalized for token in ("<div", "<svg", "<canvas", "<style"))


def is_payload_usable(data: Dict[str, Any]) -> bool:
    return not payload_validation_errors(data)


def payload_validation_errors(
    data: Dict[str, Any],
    expected_widget_type: str | None = None,
) -> List[str]:
    if not isinstance(data, dict):
        return ["Payload must be a JSON object."]

    errors: List[str] = []

    title = str(data.get("title") or "").strip()
    if not title:
        errors.append("title is required and must be a non-empty string.")

    widget_type = str(data.get("widget_type") or "").strip()
    if widget_type not in WIDGET_TYPES:
        errors.append(f"widget_type must be one of: {', '.join(WIDGET_TYPES)}.")
    elif expected_widget_type and widget_type != expected_widget_type:
        errors.append(f"widget_type must stay '{expected_widget_type}' unless truly impossible.")

    assistant_text = str(data.get("assistant_text") or "").strip()
    if not assistant_text:
        errors.append("assistant_text is required and must be one short sentence.")

    loading_messages = data.get("loading_messages")
    if loading_messages is not None:
        if not isinstance(loading_messages, list):
            errors.append("loading_messages must be an array of 1 to 4 short strings.")
        else:
            values = [str(item).strip() for item in loading_messages if str(item).strip()]
            if not values:
                errors.append("loading_messages must contain at least one non-empty string.")
            elif len(values) > 4:
                errors.append("loading_messages must contain at most 4 items.")

    widget_code = str(data.get("widget_code") or "").strip()
    if not is_widget_code_valid(widget_code):
        errors.append("widget_code must be a valid HTML fragment with <style>/<div|svg|canvas> content.")
    else:
        normalized = widget_code.lower()
        style_idx = normalized.find("<style")
        script_idx = normalized.find("<script")
        first_content_idx = min(
            [idx for idx in (normalized.find("<div"), normalized.find("<svg"), normalized.find("<canvas")) if idx >= 0],
            default=-1,
        )
        if style_idx >= 0 and first_content_idx >= 0 and style_idx > first_content_idx:
            errors.append("widget_code should place <style> before the main markup when possible.")
        if script_idx >= 0 and first_content_idx >= 0 and script_idx < first_content_idx:
            errors.append("widget_code should place <script> after the main markup.")
        errors.extend(_aesthetic_quality_errors(widget_type, normalized))

    return errors


_MOTION_TOKENS = ("transition", "animation", "@keyframes", "requestanimationframe", "setinterval")

_INTERACTIVE_WIDGET_TYPES = ("interactive", "chart_interactive", "art_interactive")

_INSTRUCTION_PILL_RE = re.compile(r"(提示\s*[:：]|小贴士\s*[:：]|tips?\s*:)", re.IGNORECASE)

# Flat CSS rule: capture "selector { body }" (widget CSS is non-nested; @media/@keyframes skipped).
_CSS_RULE_RE = re.compile(r"([^{}]*)\{([^{}]*)\}")
_BG_HEX_RE = re.compile(r"background(?:-color)?\s*:[^;}]*?#([0-9a-f]{3}|[0-9a-f]{6})\b")
# `color:` but not `background-color:`/`border-color:` — require a non-hyphen delimiter before it.
_THEME_INK_RE = re.compile(r"(?:^|[;{\s])color\s*:\s*(var\(\s*--|currentcolor|inherit)")


def _hex_is_dark(hex_digits: str) -> bool:
    if len(hex_digits) == 3:
        hex_digits = "".join(ch * 2 for ch in hex_digits)
    r, g, b = (int(hex_digits[i : i + 2], 16) for i in (0, 2, 4))
    # Perceived luminance, 0..1. Navy #1a1a2e ≈ 0.11; #ECE8F6 ≈ 0.92.
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.3


def _dark_fill_theme_ink_blocks(normalized_code: str) -> bool:
    """True if any rule pairs a fixed dark background hex with a theme-following ink color.

    This is the chip/pill footgun: dark fixed fill + var(--ink)/currentColor text reads in
    dark mode but goes dark-on-dark in light mode. Conservative: only the literal-dark-hex case,
    and skips blocks already scoped to [data-theme="dark"] (a dark fill there is correct).
    """
    for selector, body in _CSS_RULE_RE.findall(normalized_code):
        if "data-theme" in selector or "prefers-color-scheme" in selector:
            continue
        bg = _BG_HEX_RE.search(body)
        if bg and _hex_is_dark(bg.group(1)) and _THEME_INK_RE.search(body):
            return True
    return False


def _aesthetic_quality_errors(widget_type: str, normalized_code: str) -> List[str]:
    errors: List[str] = []
    if "#4fc3f7" in normalized_code:
        errors.append(
            "widget_code uses the stock example color #4fc3f7 — pick colors from the chosen aesthetic direction instead of copying the example palette."
        )
    if widget_type in _INTERACTIVE_WIDGET_TYPES and not any(token in normalized_code for token in _MOTION_TOKENS):
        errors.append(
            "interactive widget_code has no motion or interaction feedback (no transition/animation/requestAnimationFrame) — add hover/active transitions on controls and make state changes visibly animate."
        )
    if "<h1" in normalized_code:
        errors.append(
            "widget_code contains an <h1> self-introducing headline — the chat message already introduces the widget. Remove the title block (and its explainer subtitle); content captions may use a small in-style label instead."
        )
    if _INSTRUCTION_PILL_RE.search(normalized_code):
        errors.append(
            "widget_code contains an instruction pill ('提示:'/'Tip:') — express affordances through design (cursor styles, hover preview) instead of a sticker explaining the UI."
        )
    if "prefers-color-scheme" in normalized_code:
        errors.append(
            "widget_code uses prefers-color-scheme — it tracks the OS, not the app's theme toggle, and will desynchronize from the page. Follow the app theme: write the light register as default rules, the dark register under [data-theme=\"dark\"] .yourClass { ... } (a pictorial scene is the only fixed-surface exception)."
        )
    if _dark_fill_theme_ink_blocks(normalized_code):
        errors.append(
            "widget_code has a chip/pill with a fixed dark background hex but a theme-following text color (var(--…)/currentColor) — in light mode the ink flips dark and vanishes on the dark fill. Make surface and ink move together: give the chip a light-register fill plus a [data-theme=\"dark\"] dark fill, or pair the fixed dark fill with a fixed light ink."
        )
    return errors


def normalize_title(title: str) -> str:
    text = (title or "").strip()
    if not text:
        return "generated_widget"

    cleaned_chars: List[str] = []
    for ch in text:
        if ch.isalnum() or ch == "_":
            cleaned_chars.append(ch)
        elif ch.isspace() or ch in "-/\\":
            cleaned_chars.append("_")
    cleaned = "".join(cleaned_chars)
    cleaned = "".join(c.lower() if "A" <= c <= "Z" else c for c in cleaned)
    cleaned = re.sub(r"_+", "_", cleaned).strip("_")
    return cleaned or "generated_widget"


def normalize_widget_type(widget_type: str) -> str:
    value = str(widget_type or "").strip()
    return value if value in WIDGET_TYPES else "interactive"


def safe_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _detect_language(text: str) -> str:
    for ch in text or "":
        if "\u4e00" <= ch <= "\u9fff":
            return "zh"
        if "\u3040" <= ch <= "\u30ff":
            return "ja"
        if "\uac00" <= ch <= "\ud7af":
            return "ko"
    return "en"


_LOADING_MESSAGES_BY_LANG: Dict[str, Dict[str, List[str]]] = {
    "en": {
        "chart": ["Preparing chart structure", "Binding chart data", "Rendering chart interactions"],
        "diagram": ["Preparing diagram layout", "Routing connectors", "Rendering final diagram"],
        "mockup": ["Preparing mockup layout", "Applying component styles", "Rendering UI interactions"],
        "art": ["Preparing art composition", "Applying visual layers", "Rendering final illustration"],
        "interactive": ["Preparing interactive layout", "Binding controls", "Rendering interactive widget"],
    },
    "zh": {
        "chart": ["准备图表结构", "绑定图表数据", "渲染图表交互"],
        "diagram": ["准备示意图布局", "连接节点", "渲染最终示意图"],
        "mockup": ["准备界面布局", "应用组件样式", "渲染交互界面"],
        "art": ["准备画面构图", "应用视觉图层", "渲染最终插画"],
        "interactive": ["准备交互布局", "绑定控件", "渲染交互组件"],
    },
    "ja": {
        "chart": ["チャート構造を準備中", "データをバインド中", "チャートを描画中"],
        "diagram": ["図のレイアウトを準備中", "コネクタを配線中", "図を描画中"],
        "mockup": ["UIレイアウトを準備中", "スタイルを適用中", "UIを描画中"],
        "art": ["構図を準備中", "レイヤーを適用中", "イラストを描画中"],
        "interactive": ["インタラクティブUIを準備中", "コントロールをバインド中", "ウィジェットを描画中"],
    },
    "ko": {
        "chart": ["차트 구조 준비 중", "데이터 바인딩 중", "차트 렌더링 중"],
        "diagram": ["다이어그램 배치 준비 중", "연결선 배선 중", "다이어그램 렌더링 중"],
        "mockup": ["UI 레이아웃 준비 중", "스타일 적용 중", "UI 렌더링 중"],
        "art": ["구성 준비 중", "레이어 적용 중", "일러스트 렌더링 중"],
        "interactive": ["인터랙티브 레이아웃 준비 중", "컨트롤 바인딩 중", "위젯 렌더링 중"],
    },
}


def default_loading_messages(user_text: str) -> List[str]:
    normalized = (user_text or "").lower()
    lang = _detect_language(user_text or "")
    table = _LOADING_MESSAGES_BY_LANG.get(lang, _LOADING_MESSAGES_BY_LANG["en"])

    if any(token in normalized for token in ["chart", "graph", "plot", "histogram", "timeseries", "图表"]):
        return table["chart"]
    if any(token in normalized for token in ["diagram", "architecture", "flow", "workflow", "流程图"]):
        return table["diagram"]
    if any(token in normalized for token in ["mockup", "form", "layout", "ui", "界面"]):
        return table["mockup"]
    if any(token in normalized for token in ["art", "illustration", "draw", "creative"]):
        return table["art"]
    return table["interactive"]


def safe_loading_messages(raw: Any, query: str) -> List[str]:
    if isinstance(raw, list):
        values = [str(item).strip() for item in raw if str(item).strip()]
        if values:
            return values[:4]
    return default_loading_messages(query)


def infer_widget_type(user_text: str) -> str:
    normalized = user_text.lower()
    if any(token in normalized for token in ["chart", "graph", "plot", "histogram", "timeseries", "图表"]):
        return "chart"
    if any(token in normalized for token in ["diagram", "architecture", "flow", "workflow", "流程图"]):
        return "diagram"
    if any(token in normalized for token in ["mockup", "form", "layout", "ui", "界面"]):
        return "mockup"
    if any(token in normalized for token in ["art", "illustration", "draw", "creative"]):
        return "art"
    if any(token in normalized for token in VISUAL_TRIGGERS_EN) or any(token in user_text for token in VISUAL_TRIGGERS_ZH):
        return "interactive"
    return "interactive"


def next_session_id(existing: str, reset_session: bool) -> str:
    if not reset_session and existing.strip():
        return existing.strip()
    return f"genui-tool-{uuid.uuid4()}"
