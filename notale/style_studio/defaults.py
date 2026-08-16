"""Audience -> default StylePack id.

deckbase routes elementary/lesson-plan work onto a specific green classroom pack.
notale has no such hard-coded family, so selection is registry-driven: an
audience hint picks the first published pack declaring it, and everything else
falls back to the registry default.
"""

from __future__ import annotations

from notale.style_studio.registry import list_packs, resolve_alias

_ELEMENTARY_AUDIENCE = frozenset({"elementary", "primary"})
_ELEMENTARY_DENSITY = frozenset({"classroom_sparse", "elementary_sparse"})


def is_elementaryish(
    *,
    audience_level: str = "",
    density_profile: str = "",
    document_profile: str = "",
) -> bool:
    return (
        str(document_profile or "").strip().lower() == "lesson_plan"
        or str(audience_level or "").strip().lower() in _ELEMENTARY_AUDIENCE
        or str(density_profile or "").strip().lower() in _ELEMENTARY_DENSITY
    )


def default_style_pack_id(
    *,
    audience_level: str = "",
    density_profile: str = "",
    document_profile: str = "",
) -> str:
    """Resolve the pack to start from when the caller names none."""
    if is_elementaryish(
        audience_level=audience_level,
        density_profile=density_profile,
        document_profile=document_profile,
    ):
        from notale.style_studio.registry import get_pack

        for entry in list_packs():
            try:
                if get_pack(entry["id"], validate=False).audience_hint == "elementary":
                    return entry["id"]
            except Exception:  # noqa: BLE001 — a broken pack must not block selection
                continue
    return resolve_alias("")
