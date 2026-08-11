"""Deterministic delivery checks run by submit_page."""

from __future__ import annotations

import asyncio
import html as html_mod
import json
import re
from html.parser import HTMLParser
from pathlib import Path

from notale.core.models import PageArtifact, PagePlan
from notale.tools.media import load_asset_manifest
from notale.utils.config import get_config
from notale.utils.parsing import visible_text


_CONFIG = get_config()
_PLACEHOLDER = re.compile(r"TODO|FIXME|占位|placeholder|lorem ipsum|待填|xxx+", re.I)
_NAN_UNDEF = re.compile(r"\b(NaN|undefined)\b")
_FULL_DOCUMENT = re.compile(r"<!doctype|<\s*(?:html|head|body)\b", re.I)
_REMOTE_ASSET = re.compile(
    r"(?:<\s*(?:script|img|link|source|video|audio|iframe|object)\b[^>]*(?:src|srcset|href|data)\s*=\s*['\"]?https?://|"
    r"@import\s+(?:url\()?\s*['\"]?https?://|url\(\s*['\"]?https?://|"
    r"\b(?:fetch|import)\s*\(\s*['\"]https?://)",
    re.I,
)
_UNAVAILABLE_GLOBAL = re.compile(r"\b(?:anime|gsap|d3|THREE|BABYLON|PIXI)\s*(?:\.|\()")
_EXTERNAL_RUNTIME_TAG = re.compile(
    r"<\s*(?:script\b[^>]*\bsrc|link\b[^>]*\bhref|iframe\b[^>]*\bsrc|"
    r"(?:source|video|audio)\b[^>]*\bsrc|object\b[^>]*\bdata)\s*=",
    re.I,
)
_RESERVED_TOKEN = re.compile(
    r"--notale-(?:bg|surface|ink|muted|accent|accent-2|line|font|mono)\s*:", re.I
)
_SCRIPT = re.compile(r"<script(?P<attrs>[^>]*)>(?P<code>.*?)</script\s*>", re.I | re.S)


def clean_fragment(html: str) -> str:
    """Accept a model-produced document shell but store only its useful fragment."""
    value = html.strip()
    if not _FULL_DOCUMENT.search(value):
        return value
    head_match = re.search(r"<head[^>]*>(.*?)</head\s*>", value, re.I | re.S)
    body_match = re.search(r"<body[^>]*>(.*?)</body\s*>", value, re.I | re.S)
    head_assets = ""
    if head_match:
        head_assets = "\n".join(
            re.findall(r"<(?:style|script)\b[^>]*>.*?</(?:style|script)\s*>", head_match.group(1), re.I | re.S)
        )
    body = body_match.group(1).strip() if body_match else value
    body = re.sub(r"<!doctype[^>]*>", "", body, flags=re.I)
    body = re.sub(r"</?(?:html|head|body)\b[^>]*>", "", body, flags=re.I)
    return (head_assets + "\n" + body).strip()


class _PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.roots = 0
        self.images: list[dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): value or "" for key, value in attrs}
        if "data-notale-page" in values:
            self.roots += 1
        if tag.lower() == "img":
            self.images.append(values)

    handle_startendtag = handle_starttag


def _asset_failures(artifact: PageArtifact, page: int, run_dir: Path | None) -> list[str]:
    parser = _PageParser()
    parser.feed(artifact.html)
    local_refs = set(re.findall(r"\.\./assets/[A-Za-z0-9._-]+", artifact.html))
    if not parser.images and not local_refs:
        return []
    if run_dir is None:
        return ["page uses images but no run directory was provided"]
    try:
        manifest = load_asset_manifest(run_dir, create=False)
    except ValueError as exc:
        return [str(exc)]
    records = {
        str(record.get("local_path", "")): record
        for record in manifest.get("assets", [])
        if isinstance(record, dict)
    }
    failures: list[str] = []
    image_sources = {image.get("src", "").strip() for image in parser.images}
    for reference in sorted(local_refs - image_sources):
        failures.append(f"local image must be used by an img with alt: {reference}")
    for index, image in enumerate(parser.images, 1):
        src = image.get("src", "").strip()
        if image.get("srcset", "").strip():
            failures.append(f"image {index} must not use srcset")
        if not image.get("alt", "").strip():
            failures.append(f"image {index} needs a meaningful alt")
        if not src.startswith("../assets/") or "?" in src or "#" in src:
            failures.append(f"image {index} must use a local media-tool path: {src!r}")
            continue
        relative = src[3:]
        if Path(relative).is_absolute() or ".." in Path(relative).parts:
            failures.append(f"image {index} has an unsafe path: {src!r}")
            continue
        record = records.get(relative)
        if record is None:
            failures.append(f"image {index} is absent from the asset manifest: {src!r}")
            continue
        if int(record.get("page", 0) or 0) != page:
            failures.append(f"image {index} is not assigned to page {page}")
        path = Path(run_dir) / relative
        if not path.is_file() or path.stat().st_size <= 0:
            failures.append(f"image {index} is missing locally: {src!r}")
    return failures


async def _js_failure(html: str, run_dir: Path | None, page: int) -> str:
    scripts: list[str] = []
    for match in _SCRIPT.finditer(html):
        attrs = match.group("attrs")
        if re.search(r"\bsrc\s*=", attrs, re.I):
            continue
        type_match = re.search(r"\btype\s*=\s*['\"]([^'\"]+)", attrs, re.I)
        if type_match and type_match.group(1).lower() not in {
            "text/javascript", "application/javascript", "module",
        }:
            continue
        scripts.append(match.group("code"))
    if not scripts:
        return ""
    work = (Path(run_dir) if run_dir else Path.cwd()) / ".work"
    work.mkdir(parents=True, exist_ok=True)
    path = work / f"check-p{page}.js"
    path.write_text("\n;\n".join(scripts), encoding="utf-8")
    try:
        process = await asyncio.create_subprocess_exec(
            "node", "--check", str(path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(), timeout=_CONFIG.tools.inline_js_check_timeout_sec
            )
        except TimeoutError:
            process.kill()
            await process.communicate()
            return "inline JavaScript syntax check timed out"
        if process.returncode:
            output = (stdout + stderr).decode("utf-8", errors="replace")
            return "inline JavaScript is invalid: " + output[: _CONFIG.tools.inline_js_error_max_chars]
        return ""
    finally:
        path.unlink(missing_ok=True)


async def page_delivery_failures(
    artifact: PageArtifact,
    *,
    page: int,
    run_dir: Path | None = None,
) -> list[str]:
    failures: list[str] = []
    if not artifact.html.strip():
        failures.append("html is empty")
    if _FULL_DOCUMENT.search(artifact.html):
        failures.append("html must be a fragment, not a document shell")
    parser = _PageParser()
    parser.feed(artifact.html)
    if parser.roots != 1:
        failures.append("html must contain exactly one data-notale-page root")
    if _RESERVED_TOKEN.search(artifact.html):
        failures.append("page must not redefine shared --notale-* tokens")
    if _REMOTE_ASSET.search(artifact.html):
        failures.append("page contains a remote runtime dependency")
    if _EXTERNAL_RUNTIME_TAG.search(artifact.html):
        failures.append("page must not load an external script, stylesheet, frame, or media runtime")
    match = _UNAVAILABLE_GLOBAL.search(artifact.html)
    if match:
        failures.append(f"unavailable third-party global: {match.group(0).rstrip('.(')}")
    text = visible_text(artifact.html)
    if not text:
        failures.append("page has no visible text")
    match = _PLACEHOLDER.search(text)
    if match:
        failures.append(f"placeholder text: {match.group(0)!r}")
    match = _NAN_UNDEF.search(text)
    if match:
        failures.append(f"visible runtime leak: {match.group(0)}")
    failures.extend(_asset_failures(artifact, page, run_dir))
    js_failure = await _js_failure(artifact.html, run_dir, page)
    if js_failure:
        failures.append(js_failure)
    return failures


def make_fallback_page(page: int, spec: PagePlan, reason: str) -> PageArtifact:
    title = html_mod.escape(spec.claim[: _CONFIG.pipeline.fallback_title_max_chars])
    claim = html_mod.escape(spec.claim)
    detail = html_mod.escape(reason[:300])
    return PageArtifact(
        html=(
            '<section class="page fallback" data-notale-page>'
            f"<h2>{title}</h2><p>{claim}</p>"
            f'<p class="fallback-note">本页生成失败，已安全降级：{detail}</p>'
            "</section>"
        ),
        notes=f"Builder fallback for page {page}: {reason}",
    )
