"""StyleBuild contracts: sparse fill tracking + merge report."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Literal

Confidence = Literal["filled", "inferred", "missing"]


@dataclass
class FieldConfidence:
    path: str
    status: Confidence
    source: str = ""  # explicit|adapter|input|parent|audience_default|safe_default|bridge
    note: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class MergeReport:
    pack_id: str
    parent_id: str = ""
    fields: List[FieldConfidence] = field(default_factory=list)
    adapters: List[str] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "pack_id": self.pack_id,
            "parent_id": self.parent_id,
            "adapters": list(self.adapters),
            "notes": list(self.notes),
            "fields": [item.to_dict() for item in self.fields],
        }

    def mark(
        self,
        path: str,
        status: Confidence,
        *,
        source: str = "",
        note: str = "",
    ) -> None:
        for item in self.fields:
            if item.path == path:
                item.status = status
                item.source = source or item.source
                item.note = note or item.note
                return
        self.fields.append(
            FieldConfidence(path=path, status=status, source=source, note=note)
        )


@dataclass
class BuildBrief:
    """Normalized sparse user intent before extractors run."""

    pack_id: str
    label: str = ""
    parent_id: str = ""
    text: str = ""
    image_paths: List[str] = field(default_factory=list)
    json_patch: Dict[str, Any] = field(default_factory=dict)
    audience_hint: str = ""
    provenance: str = "hybrid"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
