"""Run-local media acquisition tools with automatic provenance manifests."""

from __future__ import annotations

import datetime as dt
import hashlib
import html
import json
import re
import struct
import threading
from enum import Enum
from pathlib import Path
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, Field

from notale.tools.base import BaseTool, ToolContext, ToolResult
from notale.tools.media_backends import ImageRequest, get_backend
from notale.utils.config import get_config
from notale.utils.retry import RetryPolicy, run_with_retry


_CONFIG = get_config().media
_MANIFEST_LOCK = threading.Lock()
_SAFE_PART = re.compile(r"[^a-z0-9]+")


class DocumentaryKind(str, Enum):
    PERSON = "person"
    DOCUMENT = "document"
    PLACE = "place"
    ARTIFACT = "artifact"
    EVENT = "event"


class GeneratedRole(str, Enum):
    EDITORIAL_ILLUSTRATION = "editorial-illustration"
    CONCEPT_DIAGRAM = "concept-diagram"
    TEXTURE = "texture"


class FindImageInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(min_length=2, max_length=240)
    kind: DocumentaryKind
    alt: str = Field(min_length=2, max_length=240)


class MakeImageInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    prompt: str = Field(min_length=8, max_length=3000)
    role: GeneratedRole = GeneratedRole.EDITORIAL_ILLUSTRATION
    alt: str = Field(min_length=2, max_length=240)


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def _atomic_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(data)
    tmp.replace(path)


def _atomic_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(value, ensure_ascii=False, indent=2, default=str)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def ensure_asset_manifest(run_dir: Path) -> Path:
    """Create the shared manifest only when a media tool is actually used."""
    path = Path(run_dir) / "assets" / "manifest.json"
    with _MANIFEST_LOCK:
        if not path.exists():
            _atomic_json(path, {"assets": [], "attempts": {"find": 0, "make": 0}})
    (Path(run_dir) / "assets").mkdir(parents=True, exist_ok=True)
    return path


def load_asset_manifest(run_dir: Path, *, create: bool = True) -> dict[str, Any]:
    path = ensure_asset_manifest(run_dir) if create else Path(run_dir) / "assets" / "manifest.json"
    if not path.is_file():
        raise ValueError("asset manifest does not exist")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ValueError(f"asset manifest is unreadable: {exc}") from exc
    if not isinstance(value, dict) or not isinstance(value.get("assets"), list):
        raise ValueError("asset manifest must contain an assets list")
    return value


def _record_asset(run_dir: Path, record: dict[str, Any]) -> dict[str, Any]:
    path = ensure_asset_manifest(run_dir)
    with _MANIFEST_LOCK:
        manifest = json.loads(path.read_text(encoding="utf-8"))
        assets = manifest.setdefault("assets", [])
        existing = next(
            (item for item in assets if item.get("asset_id") == record["asset_id"]), None
        )
        if existing is None:
            assets.append(record)
            _atomic_json(path, manifest)
            return record
        return existing


def _clean_metadata(value: Any) -> str:
    raw = value.get("value", "") if isinstance(value, dict) else str(value or "")
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", raw)).split())


def _jpeg_size(data: bytes) -> tuple[int, int] | None:
    index = 2
    while index + 9 < len(data):
        if data[index] != 0xFF:
            index += 1
            continue
        marker = data[index + 1]
        index += 2
        if marker in {0xD8, 0xD9}:
            continue
        if index + 2 > len(data):
            return None
        length = int.from_bytes(data[index:index + 2], "big")
        if marker in {
            0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
            0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF,
        } and index + 7 < len(data):
            return int.from_bytes(data[index + 5:index + 7], "big"), int.from_bytes(
                data[index + 3:index + 5], "big"
            )
        if length < 2:
            return None
        index += length
    return None


def inspect_image(data: bytes) -> tuple[str, str, int, int]:
    """Validate a safe raster format and return mime, extension, width, height."""
    if len(data) < _CONFIG.minimum_image_bytes:
        raise ValueError(f"image is unexpectedly small: {len(data)} bytes")
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        width, height = struct.unpack(">II", data[16:24])
        result = ("image/png", "png", width, height)
    elif data.startswith(b"\xff\xd8"):
        size = _jpeg_size(data)
        if size is None:
            raise ValueError("JPEG dimensions could not be read")
        result = ("image/jpeg", "jpg", size[0], size[1])
    elif data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        chunk = data[12:16]
        if chunk == b"VP8X" and len(data) >= 30:
            width = 1 + int.from_bytes(data[24:27], "little")
            height = 1 + int.from_bytes(data[27:30], "little")
        elif chunk == b"VP8L" and len(data) >= 25 and data[20] == 0x2F:
            bits = int.from_bytes(data[21:25], "little")
            width = 1 + (bits & 0x3FFF)
            height = 1 + ((bits >> 14) & 0x3FFF)
        else:
            marker = data.find(b"\x9d\x01\x2a")
            if marker < 0 or marker + 7 > len(data):
                raise ValueError("WebP dimensions could not be read")
            width = int.from_bytes(data[marker + 3:marker + 5], "little") & 0x3FFF
            height = int.from_bytes(data[marker + 5:marker + 7], "little") & 0x3FFF
        result = ("image/webp", "webp", width, height)
    else:
        raise ValueError("only PNG, JPEG, and WebP raster assets are accepted")
    if result[2] <= 0 or result[3] <= 0:
        raise ValueError("invalid image dimensions")
    return result


async def _download(client: httpx.AsyncClient, url: str) -> tuple[bytes, str]:
    data = bytearray()
    async with client.stream("GET", url) as response:
        response.raise_for_status()
        content_type = response.headers.get("content-type", "").split(";", 1)[0].strip()
        async for chunk in response.aiter_bytes():
            data.extend(chunk)
            if len(data) > _CONFIG.maximum_download_bytes:
                raise ValueError("image exceeds configured download limit")
    return bytes(data), content_type


def _asset_id(page_id: str, source: str, seed: str) -> str:
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()[:12]
    clean_page = _SAFE_PART.sub("-", page_id.lower()).strip("-") or "page"
    return f"{clean_page}-{source}-{digest}"


def _tool_output(record: dict[str, Any]) -> str:
    return json.dumps(
        {
            "asset_id": record["asset_id"],
            "html_src": "../" + record["local_path"],
            "alt": record["alt"],
            "source_type": record["source_type"],
            "source_url": record.get("source_url", ""),
            "license": record.get("license", ""),
        },
        ensure_ascii=False,
        indent=2,
    )


def _consume_budget(
    state: Any,
    kind: str,
    page_limit: int,
    run_limit: int,
) -> tuple[bool, dict[str, int]]:
    attempts = state.tool_state.setdefault("media_attempts", {})
    used = int(attempts.get(kind, 0))
    if used >= page_limit:
        return False, {"page_remaining": 0, "run_remaining": -1}
    budget_path = ensure_asset_manifest(state.run_dir)
    with _MANIFEST_LOCK:
        budget = json.loads(budget_path.read_text(encoding="utf-8"))
        run_attempts = budget.setdefault("attempts", {})
        run_used = int(run_attempts.get(kind, 0))
        if run_used >= run_limit:
            return False, {"page_remaining": page_limit - used, "run_remaining": 0}
        run_attempts[kind] = run_used + 1
        _atomic_json(budget_path, budget)
    attempts[kind] = used + 1
    state.save_tool_state()
    remaining = {
        "page_remaining": page_limit - used - 1,
        "run_remaining": run_limit - run_used - 1,
    }
    state.event("media.attempt", media_tool=kind, attempt=used + 1, **remaining)
    return True, remaining


class FindImageTool(BaseTool):
    name = "find_image"
    description = (
        "Find and download a real documentary raster asset from Wikimedia Commons. "
        "Use for identifiable people, documents, places, artifacts, and historical events. "
        "Returns an exact local htmlSrc and records provenance automatically."
    )
    input_model = FindImageInput

    def __init__(self, state: Any, client_factory: Any = httpx.AsyncClient) -> None:
        self.state = state
        self.client_factory = client_factory

    async def execute(
        self, arguments: FindImageInput, context: ToolContext
    ) -> ToolResult:
        del context
        allowed, _ = _consume_budget(
            self.state,
            "find",
            _CONFIG.maximum_find_per_page,
            _CONFIG.maximum_find_per_run,
        )
        if not allowed:
            return ToolResult(output="find_image per-page request budget exhausted", is_error=True)
        page_id = f"p{self.state.page}"
        params = {
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "generator": "search",
            "gsrnamespace": "6",
            "gsrsearch": arguments.query,
            "gsrlimit": str(_CONFIG.search_results),
            "prop": "imageinfo",
            "iiprop": "url|mime|size|extmetadata",
            "iiurlwidth": str(_CONFIG.thumbnail_width_px),
        }
        headers = {"User-Agent": _CONFIG.wikimedia_user_agent}
        try:
            async with self.client_factory(
                timeout=_CONFIG.request_timeout_sec,
                follow_redirects=True,
                headers=headers,
            ) as client:
                response = await client.get(_CONFIG.wikimedia_api_url, params=params)
                response.raise_for_status()
                pages = (response.json().get("query") or {}).get("pages") or []
                candidate = None
                for page in pages:
                    info = (page.get("imageinfo") or [None])[0]
                    if not isinstance(info, dict):
                        continue
                    if info.get("mime") not in {"image/jpeg", "image/png", "image/webp"}:
                        continue
                    metadata = info.get("extmetadata") or {}
                    has_license = bool(_clean_metadata(metadata.get("LicenseShortName")))
                    if (info.get("thumburl") or info.get("url")) and info.get("descriptionurl") and has_license:
                        candidate = (page, info)
                        break
                if candidate is None:
                    return ToolResult(
                        output="Wikimedia Commons returned no supported raster asset",
                        is_error=True,
                    )
                source_page, info = candidate
                download_url = str(info.get("thumburl") or info.get("url"))
                binary, _ = await _download(client, download_url)
            mime, extension, width, height = inspect_image(binary)
            width = width or int(info.get("thumbwidth") or info.get("width") or 0)
            height = height or int(info.get("thumbheight") or info.get("height") or 0)
            source_url = str(info.get("descriptionurl") or info.get("url") or "")
            asset_id = _asset_id(page_id, "commons", source_url or download_url)
            relative = f"assets/{asset_id}.{extension}"
            _atomic_bytes(self.state.run_dir / relative, binary)
            metadata = info.get("extmetadata") or {}
            record = {
                "asset_id": asset_id,
                "page": self.state.page,
                "kind": arguments.kind.value,
                "alt": arguments.alt,
                "source_type": "wikimedia-commons",
                "source_url": source_url,
                "download_url": download_url,
                "title": str(source_page.get("title", "")),
                "creator": _clean_metadata(metadata.get("Artist")),
                "credit": _clean_metadata(metadata.get("Credit")),
                "license": _clean_metadata(metadata.get("LicenseShortName")),
                "license_url": _clean_metadata(metadata.get("LicenseUrl")),
                "local_path": relative,
                "mime_type": mime,
                "width": width,
                "height": height,
                "bytes": len(binary),
                "sha256": hashlib.sha256(binary).hexdigest(),
                "query": arguments.query,
                "created_at": _now(),
            }
            record = _record_asset(self.state.run_dir, record)
            media_assets = self.state.tool_state.setdefault("mediaAssets", [])
            if record["asset_id"] not in media_assets:
                media_assets.append(record["asset_id"])
            self.state.save_tool_state()
            self.state.event(
                "media.found", asset_id=record["asset_id"], source_type=record["source_type"]
            )
            return ToolResult(output=_tool_output(record), metadata={"asset_id": record["asset_id"]})
        except Exception as exc:
            return ToolResult(output=f"media acquisition failed: {exc}", is_error=True)


class MakeImageTool(BaseTool):
    name = "make_image"
    description = (
        "Generate a clearly non-documentary editorial illustration with the configured image model. "
        "Never use it as evidence, an archival portrait, a manuscript, or a historical photograph. "
        "Returns an exact local htmlSrc and records model/prompt provenance automatically."
    )
    input_model = MakeImageInput

    def __init__(self, state: Any, client_factory: Any = httpx.AsyncClient) -> None:
        self.state = state
        self.client_factory = client_factory

    async def execute(
        self, arguments: MakeImageInput, context: ToolContext
    ) -> ToolResult:
        del context
        allowed, _ = _consume_budget(
            self.state,
            "make",
            _CONFIG.maximum_make_per_page,
            _CONFIG.maximum_make_per_run,
        )
        if not allowed:
            return ToolResult(output="make_image per-page request budget exhausted", is_error=True)
        page_id = f"p{self.state.page}"
        prompt = (
            "Create a clearly non-documentary editorial illustration for an educational lecture. "
            "It must not resemble an archival photograph, documentary portrait, manuscript, or "
            "historical evidence. Use no readable text, letters, numbers, logos, or watermark.\n\n"
            + arguments.prompt.strip()
        )
        try:
            backend = get_backend()
            request = ImageRequest(prompt=prompt)
            result, retry_meta = await run_with_retry(
                lambda: backend.generate(
                    request, client_factory=self.client_factory
                ),
                policy=RetryPolicy(timeout_sec=_CONFIG.request_timeout_sec),
                on_retry=lambda attempt, error_class, delay: self.state.event(
                    "media.retrying",
                    tool=self.name,
                    backend=backend.name,
                    attempt=attempt,
                    next_attempt=attempt + 1,
                    error_class=error_class,
                    delay_sec=round(delay, 3),
                ),
            )
            binary = result.data
            mime, extension, width, height = inspect_image(binary)
            prompt_hash = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
            asset_id = _asset_id(page_id, "generated", prompt_hash)
            relative = f"assets/{asset_id}.{extension}"
            _atomic_bytes(self.state.run_dir / relative, binary)
            record = {
                "asset_id": asset_id,
                "page": self.state.page,
                "kind": arguments.role.value,
                "alt": arguments.alt,
                "source_type": "generated-editorial",
                "source_url": "",
                "license": "model-output",
                "local_path": relative,
                "mime_type": mime,
                "width": width,
                "height": height,
                "bytes": len(binary),
                "sha256": hashlib.sha256(binary).hexdigest(),
                "model": result.model,
                "prompt": prompt,
                "prompt_sha256": prompt_hash,
                "usage": result.usage,
                "attempts": int(retry_meta.get("attempts", 1)),
                "created_at": _now(),
            }
            record = _record_asset(self.state.run_dir, record)
            media_assets = self.state.tool_state.setdefault("mediaAssets", [])
            if record["asset_id"] not in media_assets:
                media_assets.append(record["asset_id"])
            self.state.save_tool_state()
            self.state.event(
                "media.made",
                asset_id=record["asset_id"],
                model=result.model,
                backend=backend.name,
                attempts=int(retry_meta.get("attempts", 1)),
            )
            return ToolResult(output=_tool_output(record), metadata={"asset_id": record["asset_id"]})
        except Exception as exc:
            return ToolResult(output=f"media generation failed: {exc}", is_error=True)


class SafeAreaInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: str = Field(min_length=2, max_length=20)
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    w: float = Field(gt=0, le=1)
    h: float = Field(gt=0, le=1)


class MakeBackplateInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    subject: str = Field(min_length=8, max_length=1200)
    safe_areas: list[SafeAreaInput] = Field(min_length=1, max_length=6)


class MakeBackplateTool(BaseTool):
    name = "make_backplate"
    description = (
        "Generate a text-free background plate for this page, styled by the run's "
        "StylePack and reserving the regions where your text will sit. Returns a "
        "local htmlSrc for an <img data-notale-backplate alt=\"\" aria-hidden=\"true\">. "
        "Declare safe_areas as fractions of the 1280x720 frame covering every text "
        "region you intend to place; inspect_page measures the real ground under "
        "your text afterwards and reports backplate_contrast."
    )
    input_model = MakeBackplateInput

    def __init__(self, state: Any, client_factory: Any = httpx.AsyncClient) -> None:
        self.state = state
        self.client_factory = client_factory

    async def execute(
        self, arguments: MakeBackplateInput, context: ToolContext
    ) -> ToolResult:
        del context
        from notale.style_studio.backplate import (
            ImageChannel,
            SafeArea,
            backplate_prompt,
            validate_safe_areas,
        )

        allowed, _ = _consume_budget(
            self.state, "make", _CONFIG.maximum_make_per_page, _CONFIG.maximum_make_per_run
        )
        if not allowed:
            return ToolResult(output="make_backplate request budget exhausted", is_error=True)
        if self.state.tool_state.get("backplate_asset_id"):
            return ToolResult(output="this page already has a backplate", is_error=True)

        areas = [
            SafeArea(role=item.role, x=item.x, y=item.y, w=item.w, h=item.h)
            for item in arguments.safe_areas
        ]
        problems = validate_safe_areas(areas)
        if problems:
            return ToolResult(output="; ".join(problems), is_error=True)

        channel = ImageChannel.load(self.state.run_dir)
        composition = None
        style, page_plan = getattr(self.state, "style", None), getattr(self.state, "page_plan", None)
        if style is not None and page_plan is not None:
            try:
                composition = style.composition(page_plan.composition)
            except Exception:  # noqa: BLE001 — guidance only
                composition = None
        prompt, negative = backplate_prompt(
            channel=channel,
            subject=arguments.subject,
            safe_areas=areas,
            composition=composition,
        )

        page_id = f"p{self.state.page}"
        try:
            backend = get_backend()
            request = ImageRequest(prompt=prompt, negative_prompt=negative)
            result, retry_meta = await run_with_retry(
                lambda: backend.generate(
                    request,
                    client_factory=self.client_factory,
                ),
                policy=RetryPolicy(timeout_sec=_CONFIG.request_timeout_sec),
                on_retry=lambda attempt, error_class, delay: self.state.event(
                    "media.retrying",
                    tool=self.name,
                    backend=backend.name,
                    attempt=attempt,
                    next_attempt=attempt + 1,
                    error_class=error_class,
                    delay_sec=round(delay, 3),
                ),
            )
            binary = result.data
            mime, extension, width, height = inspect_image(binary)
            provider_prompt = request.provider_prompt()
            prompt_hash = hashlib.sha256(provider_prompt.encode("utf-8")).hexdigest()
            asset_id = _asset_id(page_id, "backplate", prompt_hash)
            relative = f"assets/{asset_id}.{extension}"
            _atomic_bytes(self.state.run_dir / relative, binary)
            record = {
                "asset_id": asset_id,
                "page": self.state.page,
                "kind": "backplate",
                "alt": "",
                "source_type": "generated-backplate",
                "source_url": "",
                "license": "model-output",
                "local_path": relative,
                "mime_type": mime,
                "width": width,
                "height": height,
                "bytes": len(binary),
                "sha256": hashlib.sha256(binary).hexdigest(),
                "model": result.model,
                "prompt": prompt,
                "negative_prompt": negative,
                "prompt_sha256": prompt_hash,
                "safe_areas": [item.model_dump() for item in arguments.safe_areas],
                "usage": result.usage,
                "attempts": int(retry_meta.get("attempts", 1)),
                "created_at": _now(),
            }
            record = _record_asset(self.state.run_dir, record)
            self.state.tool_state["backplate_asset_id"] = record["asset_id"]
            media_assets = self.state.tool_state.setdefault("mediaAssets", [])
            if record["asset_id"] not in media_assets:
                media_assets.append(record["asset_id"])
            self.state.save_tool_state()
            self.state.event(
                "media.backplate",
                asset_id=record["asset_id"],
                backend=backend.name,
                attempts=int(retry_meta.get("attempts", 1)),
            )
            payload = json.loads(_tool_output(record))
            payload["usage"] = (
                '<img data-notale-backplate src="{src}" alt="" aria-hidden="true">'.format(
                    src=payload["html_src"]
                )
            )
            payload["note"] = (
                "Ink is not verified yet: inspect_page measures the real ground under "
                "your text and reports backplate_contrast with a recommended colour."
            )
            return ToolResult(
                output=json.dumps(payload, ensure_ascii=False, indent=2),
                metadata={"asset_id": record["asset_id"]},
            )
        except Exception as exc:
            return ToolResult(output=f"backplate generation failed: {exc}", is_error=True)
