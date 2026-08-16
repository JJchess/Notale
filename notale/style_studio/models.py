"""StylePack and StyleBundle models.

``StylePack`` mirrors deckbase's accessor surface field-for-field so pack JSON is
interchangeable. ``StyleBundle`` replaces deckbase's ``RenderStyleBundle``: where
deckbase projects a pack onto image-generation channels, notale projects it onto
executable CSS tokens, a Builder-facing Skill body, and a composition catalog.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Mapping

from notale.core.models import CompositionSpec, TypeScale

PAGE_ROLES = ("cover", "section", "content", "closing", "toc")


@dataclass(frozen=True)
class StylePack:
    """Loaded StylePack with resolved absolute pack directory."""

    data: Mapping[str, Any]
    pack_dir: Path

    # ---- deckbase-compatible accessors -------------------------------------

    @property
    def id(self) -> str:
        return str(self.data.get("id") or "")

    @property
    def label(self) -> str:
        return str(self.data.get("label") or self.id)

    @property
    def version(self) -> str:
        return str(self.data.get("version") or "")

    @property
    def status(self) -> str:
        return str(self.data.get("status") or "")

    @property
    def provenance(self) -> str:
        return str(self.data.get("provenance") or "")

    @property
    def density_default(self) -> str:
        return str(self.data.get("density_default") or "")

    @property
    def audience_hint(self) -> str:
        return str(self.data.get("audience_hint") or "")

    @property
    def parent_id(self) -> str:
        lineage = self.data.get("lineage") or {}
        if isinstance(lineage, Mapping):
            return str(lineage.get("parent_preset_id") or "")
        return ""

    def style_tokens(self) -> Dict[str, str]:
        """deckbase abstract palette (primary/secondary/accent/background/text)."""
        identity = self.data.get("identity") or {}
        tokens = identity.get("style_tokens") or {}
        return {str(k): str(v) for k, v in dict(tokens).items()}

    def prompt_compile(self) -> Dict[str, str]:
        pc = self.data.get("prompt_compile") or {}
        return {
            "style_prose": str(pc.get("style_prose") or ""),
            "style_anchor": str(pc.get("style_anchor") or ""),
        }

    def hard_negatives(self) -> List[str]:
        return [str(x) for x in (self.data.get("hard_negatives") or [])]

    def acceptance_hooks(self) -> List[str]:
        return [str(x) for x in (self.data.get("acceptance_hooks") or [])]

    def role_exemplar_relpaths(self, role: str) -> List[str]:
        roles = self.data.get("role_exemplars") or {}
        key = normalize_page_role(role)
        return [str(p) for p in (roles.get(key) or [])]

    def role_exemplar_paths(self, role: str) -> List[Path]:
        out: List[Path] = []
        for rel in self.role_exemplar_relpaths(role):
            path = (self.pack_dir / rel).resolve()
            if path.is_file():
                out.append(path)
        return out

    def has_exemplars(self) -> bool:
        return any(
            self.role_exemplar_paths(role)
            for role in ("cover", "section", "content", "closing")
        )

    def layout_policy(self) -> Dict[str, Any]:
        return dict(self.data.get("layout_policy") or {})

    def mascot_policy(self) -> Dict[str, Any]:
        return dict(self.data.get("mascot_policy") or {})

    def info_form_bias(self) -> Dict[str, Any]:
        return dict(self.data.get("info_form_bias") or {})

    def or_hints(self) -> Dict[str, Any]:
        return dict(self.data.get("or_hints") or {})

    def chrome_rules(self) -> Dict[str, Any]:
        return dict(self.data.get("chrome_rules") or {})

    def radius_scale(self) -> str:
        identity = self.data.get("identity") or {}
        return str(identity.get("radius_scale") or "")

    def type_hints(self) -> str:
        identity = self.data.get("identity") or {}
        return str(identity.get("type_hints") or "")

    def as_dict(self) -> Dict[str, Any]:
        return dict(self.data)

    # ---- notale extension --------------------------------------------------

    def notale_tokens(self) -> Dict[str, str]:
        """The eleven CSS custom properties notale emits into ``:root``."""
        identity = self.data.get("identity") or {}
        tokens = identity.get("notale_tokens") or {}
        return {str(k): str(v) for k, v in dict(tokens).items()}

    def skill_body(self) -> str:
        return str(self.data.get("skill_body") or "")

    def type_scale(self) -> TypeScale | None:
        """The pack's own type bands, or None to fall back to the default."""
        raw = self.data.get("type_scale")
        if not raw:
            return None
        return raw if isinstance(raw, TypeScale) else TypeScale.model_validate(raw)

    def description(self) -> str:
        """Planner-facing one-liner. deckbase stores this as style_prose."""
        return self.prompt_compile()["style_prose"]

    def compositions(self) -> List[CompositionSpec]:
        return [
            item
            if isinstance(item, CompositionSpec)
            else CompositionSpec.model_validate(item)
            for item in (self.data.get("compositions") or [])
        ]


def normalize_page_role(role: str) -> str:
    r = str(role or "content").strip().lower()
    if r in {"toc", "agenda", "目录"}:
        return "section"
    if r in {"closing", "end", "结束"}:
        return "closing"
    if r in {"cover", "title", "封面"}:
        return "cover"
    if r in {"section", "sec", "章节"}:
        return "section"
    return "content"


@dataclass
class StyleBundle:
    """Compiled projection of a pack onto what notale actually renders.

    The notale counterpart of deckbase's ``RenderStyleBundle``. Where deckbase
    fills a style/mascot/content image channel, notale fills CSS tokens, the
    Skill body, and the composition catalog.
    """

    pack_id: str
    version: str
    name: str
    description: str
    body: str
    tokens: Dict[str, str] = field(default_factory=dict)
    compositions: List[CompositionSpec] = field(default_factory=list)
    type_scale: TypeScale | None = None
    forbidden: List[str] = field(default_factory=list)
    acceptance_hooks: List[str] = field(default_factory=list)
    exemplar_paths: List[str] = field(default_factory=list)
    meta: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        payload = asdict(self)
        payload["compositions"] = [
            item.model_dump(mode="json") for item in self.compositions
        ]
        return payload
