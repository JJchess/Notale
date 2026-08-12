"""The small, current-only contract shared by Planner, Builders, and assembly."""

from __future__ import annotations

import re
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, model_validator

_NAME = re.compile(r"^[a-z0-9][a-z0-9-]*$")
_TOOL = re.compile(r"^[a-z][a-z0-9_]*$")


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PageType(str, Enum):
    FORMULA_DERIVATION = "formula-derivation"
    SIM_EXPLORABLE = "sim-explorable"
    CODE_RUNNABLE = "code-runnable"
    QUIZ_CHECK = "quiz-check"
    WORKED_EXAMPLE = "worked-example"
    SECTION_BREAK = "section-break"
    NARRATIVE_SCENE = "narrative-scene"


class CompositionPrimitive(str, Enum):
    FOCAL_OBJECT = "focal-object"
    ASYMMETRIC_SPLIT = "asymmetric-split"
    FULL_BLEED_EVIDENCE = "full-bleed-evidence"
    SPATIAL_MAP = "spatial-map"
    PROCESS_PATH = "process-path"
    COMPARISON = "comparison"
    DATA_LED = "data-led"
    DOCUMENT_LED = "document-led"
    MATRIX = "matrix"
    INTERACTIVE_WORKBENCH = "interactive-workbench"
    TYPOGRAPHIC_STATEMENT = "typographic-statement"
    LAYERED_REVEAL = "layered-reveal"


class NarrativeRelation(str, Enum):
    BUILDS_ON = "builds-on"
    CONTRASTS_WITH = "contrasts-with"
    RETURNS_TO = "returns-to"
    SETS_UP = "sets-up"
    SYNTHESIZES = "synthesizes"


class SkillAssignment(StrictModel):
    name: str
    instruction: str = ""

    @model_validator(mode="after")
    def validate_assignment(self) -> "SkillAssignment":
        if _NAME.fullmatch(self.name) is None:
            raise ValueError(f"invalid skill name: {self.name!r}")
        self.instruction = self.instruction.strip()
        return self


class DesignSkillRef(StrictModel):
    """Immutable reference to the design Skill generated for one run."""

    name: str
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")

    @model_validator(mode="after")
    def validate_name(self) -> "DesignSkillRef":
        if _NAME.fullmatch(self.name) is None:
            raise ValueError(f"invalid design skill name: {self.name!r}")
        return self


class CompositionSpec(StrictModel):
    """One topic-derived fixed-canvas composition available to page Planners."""

    id: str
    name: str = Field(min_length=1)
    primary: CompositionPrimitive
    secondary: CompositionPrimitive | None = None
    page_types: list[PageType] = Field(min_length=1)
    use_when: str = Field(min_length=1)
    spatial_logic: str = Field(min_length=1)
    dominant_carrier: str = Field(min_length=1)
    text_role: str = Field(min_length=1)
    variation: str = Field(min_length=1)
    avoid: str = Field(min_length=1)

    @model_validator(mode="after")
    def validate_composition(self) -> "CompositionSpec":
        if _NAME.fullmatch(self.id) is None:
            raise ValueError(f"invalid composition id: {self.id!r}")
        if self.secondary == self.primary:
            raise ValueError("composition primary and secondary primitives must differ")
        if len(self.page_types) != len(set(self.page_types)):
            raise ValueError("composition page_types contain duplicates")
        return self


class Chapter(StrictModel):
    id: str
    title: str = Field(min_length=1)
    pages: int = Field(ge=1)
    goal: str = Field(min_length=1)
    entry: str = Field(min_length=1)
    payoff: str = Field(min_length=1)

    @model_validator(mode="after")
    def validate_identity(self) -> "Chapter":
        if _NAME.fullmatch(self.id) is None:
            raise ValueError(f"invalid chapter id: {self.id!r}")
        return self


class PageLink(StrictModel):
    target: int = Field(ge=1)
    relation: NarrativeRelation
    cue: str = Field(min_length=1)


class PagePlan(StrictModel):
    type: PageType
    composition: str
    claim: str = Field(min_length=1)
    learning_action: str = Field(min_length=1)
    narrative_role: str = Field(min_length=1)
    links: list[PageLink] = Field(default_factory=list, max_length=3)
    skills: list[SkillAssignment] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_capabilities(self) -> "PagePlan":
        if _NAME.fullmatch(self.composition) is None:
            raise ValueError(f"invalid composition id: {self.composition!r}")
        names = [item.name for item in self.skills]
        if len(names) != len(set(names)):
            raise ValueError("page skills contain duplicate names")
        if len(self.tools) != len(set(self.tools)):
            raise ValueError("page tools contain duplicate names")
        invalid = sorted(name for name in self.tools if _TOOL.fullmatch(name) is None)
        if invalid:
            raise ValueError(f"invalid tool names: {invalid}")
        return self


class LecturePlan(StrictModel):
    title: str = Field(min_length=1)
    language: str = Field(min_length=1)
    audience: str = Field(min_length=1)
    throughline: str = Field(min_length=1)
    chapters: list[Chapter] = Field(min_length=1)
    design: DesignSkillRef
    pages: list[PagePlan] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_structure(self) -> "LecturePlan":
        count = len(self.pages)
        chapter_ids = [chapter.id for chapter in self.chapters]
        if len(chapter_ids) != len(set(chapter_ids)):
            raise ValueError("chapter ids must be unique")
        ranges: dict[str, range] = {}
        cursor = 1
        for chapter in self.chapters:
            ranges[chapter.id] = range(cursor, cursor + chapter.pages)
            cursor += chapter.pages
        for source, page in enumerate(self.pages, 1):
            keys = [(link.target, link.relation) for link in page.links]
            if len(keys) != len(set(keys)):
                raise ValueError(f"page {source} contains duplicate links")
            for link in page.links:
                if link.target > count or link.target == source:
                    raise ValueError(f"page {source} has invalid link target {link.target}")
                if link.relation == NarrativeRelation.SETS_UP and link.target <= source:
                    raise ValueError(f"page {source} sets-up must target a later page")
                if link.relation != NarrativeRelation.SETS_UP and link.target >= source:
                    raise ValueError(
                        f"page {source} {link.relation.value} must target an earlier page"
                    )

        for chapter in self.chapters[1:]:
            earlier_pages = range(1, ranges[chapter.id].start)
            backward_link = any(
                link.target in earlier_pages
                for source in ranges[chapter.id]
                if source <= count
                for link in self.pages[source - 1].links
            )
            if not backward_link:
                raise ValueError(
                    f"chapter {chapter.id} needs a link to an earlier chapter"
                )
        return self


class PageArtifact(StrictModel):
    html: str = Field(min_length=1)
    notes: str = ""


class PageRunStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    DEGRADED = "degraded"


class PageRun(StrictModel):
    status: PageRunStatus = PageRunStatus.PENDING
    attempts: int = Field(default=0, ge=0)
    error: str = ""
    started_at: str = ""
    finished_at: str = ""


class RunState(StrictModel):
    run_id: str
    topic: str = Field(min_length=1)
    contract_hash: str = Field(min_length=1)
    created_at: str
    plan_status: str = Field(default="pending", pattern=r"^(pending|completed)$")
    pages: list[PageRun] = Field(default_factory=list)
