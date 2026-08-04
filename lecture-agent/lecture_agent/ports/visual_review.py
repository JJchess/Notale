"""Screenshot-level visual review port.

The reviewer judges rendered pixels. Browser/runtime verification remains authoritative for
overflow, corruption, and interaction failures; a visual model cannot waive those failures.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, Protocol, TypeAlias

ImageInput: TypeAlias = str | Path | bytes
IssueRoute = Literal["tokens", "composition", "media", "blockContent"]


@dataclass(frozen=True)
class VisualReviewRequest:
    contact_sheet: ImageInput
    failed_pages: list[ImageInput] = field(default_factory=list)
    deck_context: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class VisualScores:
    visual_hierarchy: float = 0.0
    composition: float = 0.0
    asset_integration: float = 0.0
    information_density: float = 0.0
    legibility: float = 0.0
    cross_page_rhythm: float = 0.0

    def as_dict(self) -> dict[str, float]:
        return {
            "visualHierarchy": self.visual_hierarchy,
            "composition": self.composition,
            "assetIntegration": self.asset_integration,
            "informationDensity": self.information_density,
            "legibility": self.legibility,
            "crossPageRhythm": self.cross_page_rhythm,
        }


@dataclass(frozen=True)
class VisualIssue:
    scene_id: str
    route: IssueRoute
    problem: str
    instruction: str


@dataclass
class VisualReviewReport:
    scores: VisualScores = field(default_factory=VisualScores)
    issues: list[VisualIssue] = field(default_factory=list)
    summary: str = ""
    available: bool = True
    warnings: list[str] = field(default_factory=list)


class VisualReviewer(Protocol):
    async def review(self, request: VisualReviewRequest) -> VisualReviewReport:
        """Review a rendered contact sheet and optional high-resolution failed pages."""

        ...
