"""Deterministic delivery checks used inside the Builder's ``submit_page`` tool.

These checks cover artifact shape, offline delivery, local assets, references, and
visible runtime leaks. They deliberately make no claim about whether an interactive
model is scientifically or pedagogically correct.
"""

from __future__ import annotations

import re
from html.parser import HTMLParser
from pathlib import Path

from notale.core.models import PageArtifact, PageSpec, PageStatus, PrepRecord
from notale.tools.media import load_asset_manifest
from notale.utils.config import get_config
from notale.utils.parsing import visible_text


_CONFIG = get_config()

_PLACEHOLDER = re.compile(r"TODO|FIXME|占位|placeholder|lorem ipsum|待填|xxx+", re.I)
_NAN_UNDEF = re.compile(r"\b(NaN|undefined|null)\b")
_FULL_DOCUMENT = re.compile(r"<!doctype|<\s*(?:html|head|body)\b", re.I)
_REMOTE_ASSET = re.compile(
    r"(?:<\s*(?:script|img|link|source|video|audio|iframe|object)\b[^>]*(?:src|srcset|href|data)\s*=\s*['\"]?https?://|"
    r"@import\s+(?:url\()?\s*['\"]?https?://|url\(\s*['\"]?https?://|"
    r"\b(?:fetch|import)\s*\(\s*['\"]https?://)",
    re.I,
)
_UNAVAILABLE_GLOBAL = re.compile(
    r"\b(?:anime|gsap|d3|THREE|BABYLON|PIXI)\s*(?:\.|\()",
)
_RESERVED_VISUAL_TOKEN = re.compile(
    r"--notale-(?:bg|surface|ink|muted|accent|accent-2|line|font|mono)\s*:",
    re.I,
)


class _PageRootParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root_count = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        del tag
        if any(key.lower() == "data-notale-page" for key, _ in attrs):
            self.root_count += 1

    handle_startendtag = handle_starttag


class _ImageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.images: list[dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() == "img":
            self.images.append({key.lower(): value or "" for key, value in attrs})

    handle_startendtag = handle_starttag


def _asset_failures(page: PageArtifact, run_dir: Path | None) -> list[str]:
    parser = _ImageParser()
    parser.feed(page.html)
    local_refs = set(re.findall(r"\.\./assets/[A-Za-z0-9._-]+", page.html))
    if not parser.images and not local_refs:
        return []
    if run_dir is None:
        return ["页面使用了图片，但 submit_page 没有收到 run 目录，无法核对 asset manifest"]
    try:
        manifest = load_asset_manifest(run_dir)
    except ValueError as exc:
        return [str(exc)]
    records = {
        str(record.get("localPath", "")): record
        for record in manifest.get("assets", [])
        if isinstance(record, dict)
    }
    failures: list[str] = []
    image_sources = {image.get("src", "").strip() for image in parser.images}
    for reference in sorted(local_refs - image_sources):
        failures.append(f"本地图片素材必须通过带 alt 的 img 使用：{reference!r}")
    for index, image in enumerate(parser.images, 1):
        src = image.get("src", "").strip()
        if image.get("srcset", "").strip():
            failures.append(f"第 {index} 个 img 不得使用未登记的 srcset")
        if not image.get("alt", "").strip():
            failures.append(f"第 {index} 个 img 缺少有效 alt")
        if not src.startswith("../assets/") or "?" in src or "#" in src:
            failures.append(f"第 {index} 个 img 必须使用媒体工具返回的本地路径：{src!r}")
            continue
        relative = src[3:]
        path = Path(relative)
        if path.is_absolute() or ".." in path.parts:
            failures.append(f"第 {index} 个 img 路径不安全：{src!r}")
            continue
        record = records.get(relative)
        if record is None:
            failures.append(f"第 {index} 个 img 未登记到 asset manifest：{src!r}")
            continue
        if str(record.get("pageId", "")) != page.pageId:
            failures.append(f"第 {index} 个 img 未绑定当前页面 {page.pageId}：{src!r}")
        asset_path = Path(run_dir) / relative
        if not asset_path.is_file() or asset_path.stat().st_size <= 0:
            failures.append(f"第 {index} 个 img 本地文件不存在或为空：{src!r}")
    return failures


def page_delivery_failures(
    page: PageArtifact,
    valid_record_ids: set[str],
    *,
    run_dir: Path | None = None,
) -> list[str]:
    """Return deterministic delivery failures; an empty list is a passing check."""
    failures: list[str] = []
    if not page.html.strip():
        failures.append("html 为空")
    if _FULL_DOCUMENT.search(page.html):
        failures.append("html 必须是单页片段，不能包含 doctype/html/head/body")
    root_parser = _PageRootParser()
    root_parser.feed(page.html)
    if root_parser.root_count != 1:
        failures.append(
            "html 必须且只能有一个带 data-notale-page 的页面根节点"
        )
    if _RESERVED_VISUAL_TOKEN.search(page.html):
        failures.append("页面不得重新定义共享的 --notale-* 视觉 token")
    if _REMOTE_ASSET.search(page.html):
        failures.append("html 含远程运行时依赖，离线 deck 无法交付")
    match = _UNAVAILABLE_GLOBAL.search(page.html)
    if match:
        failures.append(f"html 调用了未随 deck 提供的第三方全局：{match.group(0).rstrip('.(')}")
    text = visible_text(page.html)
    if not text:
        failures.append("无可见文本")
    match = _PLACEHOLDER.search(text)
    if match:
        failures.append(f"占位文本：{match.group(0)!r}")
    match = _NAN_UNDEF.search(text)
    if match:
        failures.append(f"可见文本含 {match.group(0)}（运行时值泄漏）")
    unknown = set(page.boundReferences) - valid_record_ids
    if unknown:
        failures.append(f"boundReferences 指向不存在的资料：{sorted(unknown)}")
    failures.extend(_asset_failures(page, run_dir))
    return failures


_FALLBACK_TEMPLATE = """<section class="page fallback" data-notale-page data-page-id="{page_id}">
  <h2>{title}</h2>
  <p>{message}</p>
  {prep_block}
  <p class="fallback-note">⚠ 本页为降级安全页（{reason}），已进人审队列。</p>
</section>"""


def make_fallback_page(
    spec: PageSpec,
    prep_store: dict[str, PrepRecord],
    reason: str,
) -> PageArtifact:
    """Create a deterministic static page when its Builder cannot submit."""
    prep_block = "\n".join(
        f'<blockquote data-record="{record_id}">{prep_store[record_id].content}</blockquote>'
        for record_id in spec.boundPrepRecords
        if record_id in prep_store
    )
    html = _FALLBACK_TEMPLATE.format(
        page_id=spec.pageId,
        title=spec.centralMessage[: _CONFIG.pipeline.fallback_title_max_chars],
        message=spec.centralMessage,
        prep_block=prep_block,
        reason=reason,
    )
    return PageArtifact(
        pageId=spec.pageId,
        designSpec={"layout": "fallback"},
        html=html,
        boundReferences=list(spec.boundPrepRecords),
        status=PageStatus.DEGRADED,
    )
