"""Materialize and place a StylePack's decorative assets deterministically."""

from __future__ import annotations

import hashlib
import html
import json
import math
import re
from dataclasses import asdict, dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Mapping, Sequence, Union

from notale.style_studio.models import StylePack, normalize_page_role
from notale.style_studio.registry import get_pack

CHANNEL_FILENAME = "decorations.json"
CHROME_ICON_TAG = "chrome_icon"
MODES = frozenset({"none", "corner_accent", "side_character"})
SELECTIONS = frozenset({"all", "rotate_by_page"})
_IMAGE_SUFFIXES = frozenset({".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"})
_SAFE_ID = re.compile(r"[^a-zA-Z0-9_.-]+")

PLACEMENT_CLASSES = {
    "bottom_left": "notale-decoration-bottom-left",
    "bottom_right": "notale-decoration-bottom-right",
    "top_left": "notale-decoration-top-left",
    "top_right": "notale-decoration-top-right",
    "side": "notale-decoration-side-right",
    "side_left": "notale-decoration-side-left",
    "side_right": "notale-decoration-side-right",
}


@dataclass(frozen=True)
class DecorationAsset:
    id: str
    path: str
    family_id: str = ""
    tags: tuple[str, ...] = ()
    placement_hint: str = ""
    usage: str = ""
    sha256: str = ""

    def is_chrome_icon(self) -> bool:
        return CHROME_ICON_TAG in self.tags

    def is_character(self) -> bool:
        return not self.is_chrome_icon()

    def css_class(self, mode: str) -> str:
        if self.placement_hint in PLACEMENT_CLASSES:
            return PLACEMENT_CLASSES[self.placement_hint]
        if self.is_chrome_icon():
            return PLACEMENT_CLASSES["top_right"]
        if mode == "side_character":
            return PLACEMENT_CLASSES["side_right"]
        return PLACEMENT_CLASSES["bottom_right"]

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["tags"] = list(self.tags)
        return payload

    @classmethod
    def from_dict(cls, raw: Mapping[str, Any]) -> "DecorationAsset":
        return cls(
            id=str(raw.get("id") or "decoration"),
            path=str(raw.get("path") or ""),
            family_id=str(raw.get("family_id") or ""),
            tags=tuple(str(tag) for tag in (raw.get("tags") or ())),
            placement_hint=str(raw.get("placement_hint") or ""),
            usage=str(raw.get("usage") or ""),
            sha256=str(raw.get("sha256") or ""),
        )


@dataclass(frozen=True)
class DecorationChannel:
    pack_id: str
    mode: str = "none"
    selection: str = "all"
    max_area_ratio: float = 0.12
    roles_allowed: tuple[str, ...] = ()
    assets: tuple[DecorationAsset, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": "notale_decorations.v1",
            "pack_id": self.pack_id,
            "mode": self.mode,
            "selection": self.selection,
            "max_area_ratio": self.max_area_ratio,
            "roles_allowed": list(self.roles_allowed),
            "assets": [asset.to_dict() for asset in self.assets],
        }

    @classmethod
    def load(cls, run_dir: Path) -> "DecorationChannel | None":
        path = Path(run_dir) / "style_refs" / CHANNEL_FILENAME
        if not path.is_file():
            return None
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            mode = str(raw.get("mode") or "none")
            selection = str(raw.get("selection") or "all")
            ratio = float(raw.get("max_area_ratio", 0.12))
            if mode not in MODES or selection not in SELECTIONS:
                return None
            assets: list[DecorationAsset] = []
            for item in raw.get("assets") or ():
                if not isinstance(item, Mapping):
                    continue
                asset = DecorationAsset.from_dict(item)
                relative = PurePosixPath(asset.path)
                if (
                    relative.is_absolute()
                    or ".." in relative.parts
                    or not relative.parts
                    or relative.parts[0] != "decorations"
                ):
                    continue
                assets.append(asset)
            return cls(
                pack_id=str(raw.get("pack_id") or ""),
                mode=mode,
                selection=selection,
                max_area_ratio=max(0.0, min(0.5, ratio)),
                roles_allowed=tuple(
                    normalize_page_role(str(role))
                    for role in (raw.get("roles_allowed") or ())
                ),
                assets=tuple(assets),
            )
        except (OSError, TypeError, ValueError, json.JSONDecodeError):
            return None


def _stem_id(relative: str) -> str:
    stem = _SAFE_ID.sub("-", Path(relative).stem).strip("-._")
    return stem or "decoration"


def _source_path(pack: StylePack, relative: str) -> Path:
    root = pack.pack_dir.resolve()
    source = (root / relative).resolve()
    try:
        source.relative_to(root)
    except ValueError as exc:
        raise ValueError(f"decoration asset escapes pack directory: {relative}") from exc
    if not source.is_file():
        raise FileNotFoundError(f"decoration asset not found: {relative}")
    if source.suffix.lower() not in _IMAGE_SUFFIXES:
        raise ValueError(f"unsupported decoration image type: {relative}")
    return source


def normalize_assets(pack: StylePack) -> list[DecorationAsset]:
    """Normalize the string/object forms and validate every source path."""

    out: list[DecorationAsset] = []
    ids: set[str] = set()
    for item in pack.mascot_policy().get("assets") or []:
        if isinstance(item, str):
            relative = item.strip()
            raw: Mapping[str, Any] = {}
        elif isinstance(item, Mapping):
            relative = str(item.get("path") or "").strip()
            raw = item
        else:
            continue
        if not relative:
            continue
        _source_path(pack, relative)
        asset_id = _SAFE_ID.sub("-", str(raw.get("id") or _stem_id(relative))).strip(
            "-._"
        ) or "decoration"
        if asset_id in ids:
            raise ValueError(f"duplicate decoration asset id: {asset_id}")
        ids.add(asset_id)
        out.append(
            DecorationAsset(
                id=asset_id,
                path=relative,
                family_id=str(raw.get("family_id") or ""),
                tags=tuple(sorted({str(tag) for tag in (raw.get("tags") or ())})),
                placement_hint=str(raw.get("placement_hint") or ""),
                usage=str(raw.get("usage") or ""),
            )
        )
    return out


def _channel_for_pack(pack: StylePack) -> DecorationChannel:
    policy = pack.mascot_policy()
    mode = str(policy.get("mode") or "none")
    selection = str(policy.get("selection") or "all")
    if mode not in MODES:
        mode = "none"
    if selection not in SELECTIONS:
        selection = "all"
    ratio = float(policy.get("max_area_ratio", 0.12))
    return DecorationChannel(
        pack_id=pack.id,
        mode=mode,
        selection=selection,
        max_area_ratio=max(0.0, min(0.5, ratio)),
        roles_allowed=tuple(
            normalize_page_role(str(role))
            for role in (policy.get("roles_allowed") or ())
        ),
        assets=tuple(normalize_assets(pack)),
    )


def materialize_decorations(pack: StylePack, run_dir: Path) -> DecorationChannel:
    """Copy pack assets into an immutable, content-addressed run channel."""

    source_channel = _channel_for_pack(pack)
    refs = Path(run_dir) / "style_refs"
    destination = refs / "decorations"
    destination.mkdir(parents=True, exist_ok=True)
    materialized: list[DecorationAsset] = []
    for asset in source_channel.assets:
        source = _source_path(pack, asset.path)
        data = source.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        relative = f"decorations/{digest[:20]}{source.suffix.lower()}"
        target = refs / relative
        if not target.is_file():
            temporary = target.with_suffix(target.suffix + ".tmp")
            temporary.write_bytes(data)
            temporary.replace(target)
        materialized.append(
            DecorationAsset(
                id=asset.id,
                path=relative,
                family_id=asset.family_id,
                tags=asset.tags,
                placement_hint=asset.placement_hint,
                usage=asset.usage,
                sha256=digest,
            )
        )
    channel = DecorationChannel(
        pack_id=source_channel.pack_id,
        mode=source_channel.mode,
        selection=source_channel.selection,
        max_area_ratio=source_channel.max_area_ratio,
        roles_allowed=source_channel.roles_allowed,
        assets=tuple(materialized),
    )
    path = refs / CHANNEL_FILENAME
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(channel.to_dict(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)
    return channel


def select_for_page(
    channel_or_pack: Union[DecorationChannel, StylePack, str],
    *,
    page_role: str = "content",
    deck_pos: int | None = None,
    mode: str | None = None,
) -> list[DecorationAsset]:
    """Select one stable family member plus every chrome icon for a page."""

    if isinstance(channel_or_pack, str):
        channel_or_pack = get_pack(channel_or_pack)
    channel = (
        _channel_for_pack(channel_or_pack)
        if isinstance(channel_or_pack, StylePack)
        else channel_or_pack
    )
    resolved_mode = str(mode or channel.mode)
    if (
        resolved_mode not in MODES
        or resolved_mode == "none"
        or channel.max_area_ratio <= 0
    ):
        return []
    role = normalize_page_role(page_role)
    if channel.roles_allowed and role not in channel.roles_allowed:
        return []

    assets = sorted(channel.assets, key=lambda item: (item.family_id, item.id, item.path))
    chrome = [asset for asset in assets if asset.is_chrome_icon()]
    characters = [asset for asset in assets if asset.is_character()]
    if channel.selection == "rotate_by_page" and characters:
        families: dict[str, list[DecorationAsset]] = {}
        for asset in characters:
            families.setdefault(asset.family_id or "_ungrouped", []).append(asset)
        family_id = max(sorted(families), key=lambda key: len(families[key]))
        pool = families[family_id]
        position = max(1, int(deck_pos or 1))
        characters = [pool[(position - 1) % len(pool)]]
    return characters + chrome


def page_role_for(page_type: Any, deck_pos: int) -> str:
    """Map a plan page to the pack's small visual-role vocabulary."""

    value = getattr(page_type, "value", page_type)
    if deck_pos == 1:
        return "cover"
    if str(value or "") == "section-break":
        return "section"
    return "content"


def _box_dimensions(ratio: float, *, side: bool, chrome: bool) -> tuple[int, int]:
    area = max(0.0, ratio) * 1280 * 720
    aspect = 1.0 if chrome else (0.68 if side else 1.0)
    width = math.sqrt(area * aspect) if area else 0
    height = area / width if width else 0
    return (
        max(1, min(460 if not chrome else 150, round(width))),
        max(1, min(590 if side else 380, round(height))),
    )


def render_html(
    channel: DecorationChannel,
    assets: Sequence[DecorationAsset],
    *,
    src_prefix: str = "../style_refs/",
) -> str:
    """Emit trusted decorative ``img`` nodes with bounded layout boxes."""

    characters = [asset for asset in assets if asset.is_character()]
    chrome = [asset for asset in assets if asset.is_chrome_icon()]
    chrome_ratio = min(0.018, channel.max_area_ratio / max(1, len(assets)))
    character_total = max(0.0, channel.max_area_ratio - chrome_ratio * len(chrome))
    counts: dict[str, int] = {}
    parts: list[str] = []
    for asset in assets:
        css_class = asset.css_class(channel.mode)
        offset_index = counts.get(css_class, 0)
        counts[css_class] = offset_index + 1
        ratio = (
            chrome_ratio
            if asset.is_chrome_icon()
            else character_total / max(1, len(characters))
        )
        width, height = _box_dimensions(
            ratio,
            side=channel.mode == "side_character",
            chrome=asset.is_chrome_icon(),
        )
        src = src_prefix + asset.path
        parts.append(
            '<img data-notale-decoration '
            f'data-notale-decoration-id="{html.escape(asset.id, quote=True)}" '
            f'class="notale-decoration {css_class}" '
            f'src="{html.escape(src, quote=True)}" alt="" aria-hidden="true" '
            f'style="--notale-decoration-width:{width}px;'
            f'--notale-decoration-height:{height}px;'
            f'--notale-decoration-offset:{offset_index * 18}px">'
        )
    return "".join(parts)


def render_page_decorations(
    run_dir: Path,
    *,
    page: int,
    page_role: str,
) -> str:
    channel = DecorationChannel.load(run_dir)
    if channel is None:
        return ""
    assets = select_for_page(channel, page_role=page_role, deck_pos=page)
    return render_html(channel, assets)
