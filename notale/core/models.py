"""The small, current-only contract shared by Planner, Builders, and assembly."""

from __future__ import annotations

import re
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, model_validator

from notale.web.font_catalog import font_ids_for_role

_NAME = re.compile(r"^[a-z0-9][a-z0-9-]*$")
_TOOL = re.compile(r"^[a-z][a-z0-9_]*$")


def _font_enum(name: str, role: str) -> type[Enum]:
    values = font_ids_for_role(role)  # type: ignore[arg-type]
    members = {value.replace("-", "_").upper(): value for value in values}
    return Enum(name, members, type=str, module=__name__)


FontDisplayId = _font_enum("FontDisplayId", "display")
FontBodyId = _font_enum("FontBodyId", "body")
FontMonoId = _font_enum("FontMonoId", "mono")


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

    id: str = Field(
        pattern=r"^[a-z0-9][a-z0-9-]*$",
        description=(
            "Stable lowercase ASCII slug used by Planner and Builder, for example "
            "'phase-path'. Put the human-readable, localized label in `name`."
        ),
    )
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


class TypeRole(str, Enum):
    """The five typographic jobs a page has, ported from deckbase's plate roles."""

    TITLE = "title"
    LEDE = "lede"
    BANNER = "banner"
    CARD = "card"
    CELL = "cell"


class ColorRole(str, Enum):
    INK = "ink"
    MUTED = "muted"
    ACCENT = "accent"
    ACCENT_2 = "accent-2"
    ACCENT_3 = "accent-3"


class TypeRoleSpec(StrictModel):
    """One role's executable band, compiled to a CSS clamp().

    ``preferred_vw`` is the fluid middle term. The slide viewport is exactly
    1280px wide in both the deck and the inspection render, so 1vw is 12.8px and
    the clamp is fully deterministic.
    """

    min_px: float = Field(gt=0, le=400)
    preferred_vw: float = Field(gt=0, le=40)
    max_px: float = Field(gt=0, le=400)
    line_height: float = Field(ge=1.0, le=2.4)
    letter_spacing_em: float = Field(default=0.0, ge=-0.1, le=0.5)
    bold: bool = False
    color_role: ColorRole = ColorRole.INK

    @model_validator(mode="after")
    def validate_band(self) -> "TypeRoleSpec":
        if self.min_px > self.max_px:
            raise ValueError(f"min_px {self.min_px} exceeds max_px {self.max_px}")
        return self


class TypeScale(StrictModel):
    """A pack's type scale. Every role is required so compilation never guesses."""

    roles: dict[TypeRole, TypeRoleSpec]

    @model_validator(mode="after")
    def validate_scale(self) -> "TypeScale":
        missing = sorted(role.value for role in TypeRole if role not in self.roles)
        if missing:
            raise ValueError(f"type scale is missing roles: {missing}")
        title, cell = self.roles[TypeRole.TITLE], self.roles[TypeRole.CELL]
        if title.min_px <= cell.max_px:
            raise ValueError(
                f"type hierarchy is not visible: title starts at {title.min_px}px "
                f"but cell reaches {cell.max_px}px"
            )
        return self


# A generous sanity envelope, not a house style. `skills/style-studio/SKILL.md`
# tells the model to derive a scale per visual system and treat it as guidance,
# so a pack narrows this to its own intent; the default only exists to catch the
# absurd (a 12px page title) when a pack declares nothing.
DEFAULT_TYPE_SCALE = TypeScale(
    roles={
        TypeRole.TITLE: TypeRoleSpec(
            min_px=36, preferred_vw=6.0, max_px=120, line_height=1.15,
            letter_spacing_em=0.02, bold=True, color_role=ColorRole.INK,
        ),
        TypeRole.BANNER: TypeRoleSpec(
            min_px=22, preferred_vw=3.0, max_px=56, line_height=1.20,
            bold=True, color_role=ColorRole.INK,
        ),
        TypeRole.LEDE: TypeRoleSpec(
            min_px=18, preferred_vw=1.9, max_px=34, line_height=1.45,
            color_role=ColorRole.MUTED,
        ),
        TypeRole.CARD: TypeRoleSpec(
            min_px=16, preferred_vw=1.6, max_px=30, line_height=1.40,
            color_role=ColorRole.INK,
        ),
        TypeRole.CELL: TypeRoleSpec(
            min_px=12, preferred_vw=1.4, max_px=22, line_height=1.30,
            color_role=ColorRole.INK,
        ),
    }
)


class StyleTokens(StrictModel):
    """Strict structured-output projection of executable Style tokens."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    bg: str
    surface: str
    ink: str
    muted: str
    accent: str
    accent_2: str = Field(alias="accent-2")
    accent_3: str = Field(alias="accent-3")
    line: str
    font_display: FontDisplayId = Field(  # type: ignore[valid-type]
        alias="font-display",
        description="Exact ID of an installed offline display font.",
    )
    font_body: FontBodyId = Field(  # type: ignore[valid-type]
        alias="font-body",
        description="Exact ID of an installed offline body font.",
    )
    font_mono: FontMonoId = Field(  # type: ignore[valid-type]
        alias="font-mono",
        description="Exact ID of an installed offline monospace font.",
    )


class StyleOutput(StrictModel):
    """The sole model output of the run-local Style stage."""

    name: str = Field(
        pattern=r"^[a-z]+(?:-[a-z]+){1,3}$",
        description=(
            "Slug naming the visual system itself, as a durable library identifier a "
            "person will later browse and reuse: two to four evocative words about the "
            "look, like 'parchment-ledger' or 'civic-blueprint'. Never a measurement, a "
            "date, a number, or the lecture's title."
        ),
    )
    description: str = Field(min_length=1)
    body: str = Field(
        min_length=1,
        description=(
            "Complete Builder-facing design Skill, including a topic-specific 1280x720 "
            "scale/spacing recipe and component grammar as visual guidance, not validation."
        ),
    )
    tokens: StyleTokens
    compositions: list[CompositionSpec] = Field(
        min_length=1,
        description="Return a compact composition catalog sized to the learning request.",
    )

    def generated_style_arguments(self) -> dict[str, object]:
        return self.model_dump(mode="json", by_alias=True)


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
    tools: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_capabilities(self) -> "PagePlan":
        if _NAME.fullmatch(self.composition) is None:
            raise ValueError(f"invalid composition id: {self.composition!r}")
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


class StylePackRef(StrictModel):
    """Which StylePack a run was rendered from.

    Pack files live outside the run and can be edited between a run and its
    resume, so the content hash is recorded alongside the id and version.
    """

    pack_id: str = Field(min_length=1)
    version: str = Field(min_length=1)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class RunState(StrictModel):
    run_id: str
    topic: str = Field(min_length=1)
    contract_hash: str = Field(min_length=1)
    created_at: str
    style_status: str = Field(
        default="pending", pattern=r"^(pending|running|completed|failed)$"
    )
    style: DesignSkillRef | None = None
    style_pack: StylePackRef | None = None
    style_error: str = ""
    plan_status: str = Field(default="pending", pattern=r"^(pending|completed)$")
    pages: list[PageRun] = Field(default_factory=list)
