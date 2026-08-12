"""The complete Notale tool surface: Planner draft tools and page transaction tools."""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from notale.core.models import (
    Chapter,
    CompositionSpec,
    DesignSkillRef,
    LecturePlan,
    NarrativeRelation,
    PageArtifact,
    PageLink,
    PagePlan,
    PageType,
    SkillAssignment,
)
from notale.core.observability import EventLog
from notale.core.stages.page_check import clean_fragment, page_delivery_failures
from notale.tools.base import BaseTool, ToolContext, ToolResult
from notale.utils.config import get_config
from notale.utils.skill_catalog import (
    GeneratedDesignSkill,
    SkillCatalog,
)


_CONFIG = get_config()
OPTIONAL_PAGE_TOOLS = {"run_js", "find_image", "make_image"}


def _atomic_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


class ToolInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="before")
    @classmethod
    def decode_json_fields(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        result = dict(value)
        for key, item in result.items():
            if isinstance(item, str) and item.strip().startswith(("[", "{")):
                try:
                    result[key] = json.loads(item)
                except json.JSONDecodeError:
                    pass
        return result


class PlanChapter(ToolInput):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]*$")
    title: str = Field(min_length=1)
    goal: str = Field(min_length=1)
    entry: str = Field(min_length=1)
    payoff: str = Field(min_length=1)
    pages: int = Field(ge=1)


class SymbolicLink(ToolInput):
    chapter: str = Field(pattern=r"^[a-z0-9][a-z0-9-]*$")
    anchor: Literal["entry", "exit"]
    relation: NarrativeRelation
    cue: str = Field(min_length=1)


class DraftPage(ToolInput):
    type: PageType
    composition: str = Field(pattern=r"^[a-z0-9][a-z0-9-]*$")
    claim: str = Field(min_length=1)
    learning_action: str = Field(min_length=1)
    narrative_role: str = Field(min_length=1)
    links: list[SymbolicLink] = Field(default_factory=list, max_length=3)
    skills: list[SkillAssignment] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_capabilities(self) -> "DraftPage":
        skill_names = [item.name for item in self.skills]
        if len(skill_names) != len(set(skill_names)):
            raise ValueError("page skills contain duplicate names")
        if len(self.tools) != len(set(self.tools)):
            raise ValueError("page tools contain duplicate names")
        invalid = sorted(
            name for name in self.tools if re.fullmatch(r"[a-z][a-z0-9_]*", name) is None
        )
        if invalid:
            raise ValueError(f"invalid tool names: {invalid}")
        return self


class ChapterPages(ToolInput):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]*$")
    pages: list[DraftPage] = Field(min_length=1)


def _validate_draft_structure(
    chapters: list[PlanChapter], chapter_pages: list[ChapterPages]
) -> None:
    chapter_ids = [chapter.id for chapter in chapters]
    if len(chapter_ids) != len(set(chapter_ids)):
        raise ValueError("chapter ids must be unique")
    positions = {chapter_id: index for index, chapter_id in enumerate(chapter_ids)}

    outline = {chapter.id: chapter for chapter in chapters}
    for item in chapter_pages:
        source_position = positions.get(item.id)
        if source_position is None:
            raise ValueError(f"unknown source chapter: {item.id}")
        backward_link = False
        for page_offset, page in enumerate(item.pages):
            keys = [
                (link.chapter, link.anchor, link.relation) for link in page.links
            ]
            if len(keys) != len(set(keys)):
                raise ValueError(f"chapter {item.id} contains duplicate page links")
            for link in page.links:
                if link.chapter not in outline:
                    raise ValueError(f"unknown link chapter: {link.chapter}")
                target_position = positions[link.chapter]
                if target_position == source_position:
                    target_offset = 0 if link.anchor == "entry" else len(item.pages) - 1
                    if target_offset == page_offset:
                        raise ValueError("a page link cannot target itself")
                    if (
                        link.relation == NarrativeRelation.SETS_UP
                        and target_offset < page_offset
                    ):
                        raise ValueError("sets-up must target a later page")
                    if (
                        link.relation != NarrativeRelation.SETS_UP
                        and target_offset > page_offset
                    ):
                        raise ValueError(
                            f"{link.relation.value} must target an earlier page"
                        )
                    continue
                if (
                    link.relation == NarrativeRelation.SETS_UP
                    and target_position <= source_position
                ):
                    raise ValueError("sets-up must target a later chapter")
                if (
                    link.relation != NarrativeRelation.SETS_UP
                    and target_position >= source_position
                ):
                    raise ValueError(
                        f"{link.relation.value} must target an earlier chapter"
                    )
                if target_position < source_position:
                    backward_link = True
        if source_position and not backward_link:
            raise ValueError(
                f"chapter {item.id} needs a page link to an earlier chapter"
            )


class PlanInput(ToolInput):
    title: str = Field(min_length=1)
    language: str = Field(min_length=1)
    audience: str = Field(min_length=1)
    throughline: str = Field(min_length=1)
    chapters: list[PlanChapter] = Field(min_length=1)
    chapter_pages: list[ChapterPages] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_shape(self) -> "PlanInput":
        chapter_ids = [chapter.id for chapter in self.chapters]
        page_ids = [chapter.id for chapter in self.chapter_pages]
        if page_ids and page_ids != chapter_ids:
            raise ValueError(
                "chapter_pages must include every chapter in order or be empty"
            )
        _validate_draft_structure(self.chapters, self.chapter_pages)
        return self


class PagesInput(ToolInput):
    chapters: list[ChapterPages] = Field(min_length=1)


class BlockInput(ToolInput):
    reason: str = Field(min_length=1, max_length=_CONFIG.tools.block_reason_max_chars)


@dataclass
class PlannerRootState:
    run_dir: Path
    catalog: SkillCatalog
    logger: EventLog
    style: GeneratedDesignSkill
    submission: PlanInput | None = None
    blocked: str = ""

    def __post_init__(self) -> None:
        self.workspace = self.run_dir / ".work" / "planner" / "root"
        self.workspace.mkdir(parents=True, exist_ok=True)


@dataclass
class PlannerGroupState:
    run_dir: Path
    group: int
    chapters: tuple[PlanChapter, ...]
    all_chapters: tuple[PlanChapter, ...]
    catalog: SkillCatalog
    style: GeneratedDesignSkill
    logger: EventLog
    submission: PagesInput | None = None
    blocked: str = ""

    def __post_init__(self) -> None:
        self.workspace = self.run_dir / ".work" / "planner" / f"g{self.group}"
        self.workspace.mkdir(parents=True, exist_ok=True)


def _validate_page_capabilities(
    chapter_pages: list[ChapterPages], catalog: SkillCatalog
) -> None:
    for chapter in chapter_pages:
        for offset, page in enumerate(chapter.pages, 1):
            label = f"{chapter.id}:{offset}"
            for skill in page.skills:
                if skill.name not in catalog.role.skill_policy.page:
                    raise ValueError(f"page {label} has disallowed skill: {skill.name}")
                catalog.validate_assignment(skill)
            unknown = sorted(set(page.tools) - OPTIONAL_PAGE_TOOLS)
            if unknown:
                raise ValueError(f"page {label} has unknown tools: {unknown}")


def _validate_page_compositions(
    chapter_pages: list[ChapterPages], style: GeneratedDesignSkill
) -> None:
    catalog = {item.id: item for item in style.compositions}
    all_ids: list[str] = []
    for chapter in chapter_pages:
        ids: list[str] = []
        for offset, page in enumerate(chapter.pages, 1):
            composition = catalog.get(page.composition)
            if composition is None:
                raise ValueError(
                    f"page {chapter.id}:{offset} has unknown composition: {page.composition}"
                )
            if page.type not in composition.page_types:
                raise ValueError(
                    f"page {chapter.id}:{offset} composition {page.composition} "
                    f"does not support {page.type.value}"
                )
            ids.append(page.composition)
        for left, right in zip(ids, ids[1:]):
            if left == right:
                raise ValueError(
                    f"chapter {chapter.id} has adjacent pages with composition {left}"
                )
        if len(ids) >= 3 and len(set(ids)) < 3:
            raise ValueError(
                f"chapter {chapter.id} needs at least three compositions"
            )
        all_ids.extend(ids)
    if len(all_ids) >= 6 and len(set(all_ids)) < 4:
        raise ValueError("a plan with at least six pages needs at least four compositions")


class PlanTool(BaseTool):
    name = "plan"
    description = (
        "Submit either the complete chapter-and-page plan or a chapter outline for "
        "parallel expansion. This finishes the root Planner."
    )
    input_model = PlanInput

    def __init__(self, state: PlannerRootState) -> None:
        self.state = state

    async def execute(self, arguments: PlanInput, context: ToolContext) -> ToolResult:
        del context
        try:
            _validate_page_capabilities(arguments.chapter_pages, self.state.catalog)
            _validate_page_compositions(arguments.chapter_pages, self.state.style)
        except ValueError as exc:
            return ToolResult(output=str(exc), is_error=True)
        _atomic_text(
            self.state.workspace / "plan.json", arguments.model_dump_json(indent=2)
        )
        self.state.submission = arguments
        return ToolResult(
            output=json.dumps(
                {
                    "grouped": not bool(arguments.chapter_pages),
                    "chapters": len(arguments.chapters),
                    "estimated_pages": sum(item.pages for item in arguments.chapters),
                    "pages": sum(len(item.pages) for item in arguments.chapter_pages),
                }
            )
        )


class PagesTool(BaseTool):
    name = "pages"
    description = (
        "Submit all page plans for the assigned whole chapters. Counts may differ "
        "from their page hints. This finishes the group Planner."
    )
    input_model = PagesInput

    def __init__(self, state: PlannerGroupState) -> None:
        self.state = state

    async def execute(self, arguments: PagesInput, context: ToolContext) -> ToolResult:
        del context
        expected = [chapter.id for chapter in self.state.chapters]
        actual = [chapter.id for chapter in arguments.chapters]
        if actual != expected:
            return ToolResult(
                output=f"expected assigned chapters in order: {expected}; got {actual}",
                is_error=True,
            )
        try:
            _validate_draft_structure(
                list(self.state.all_chapters), arguments.chapters
            )
            _validate_page_capabilities(arguments.chapters, self.state.catalog)
            _validate_page_compositions(arguments.chapters, self.state.style)
        except ValueError as exc:
            return ToolResult(output=str(exc), is_error=True)
        _atomic_text(
            self.state.workspace / "pages.json", arguments.model_dump_json(indent=2)
        )
        self.state.submission = arguments
        return ToolResult(
            output=json.dumps(
                {
                    "chapters": actual,
                    "pages": sum(len(item.pages) for item in arguments.chapters),
                }
            )
        )


def assemble_plan(
    root: PlanInput,
    chapter_pages: list[ChapterPages],
    catalog: SkillCatalog,
    style: GeneratedDesignSkill,
) -> LecturePlan:
    expected = [chapter.id for chapter in root.chapters]
    actual = [chapter.id for chapter in chapter_pages]
    if actual != expected:
        raise ValueError(f"chapter page drafts must follow outline order: {expected}")
    _validate_draft_structure(root.chapters, chapter_pages)
    _validate_page_capabilities(chapter_pages, catalog)
    _validate_page_compositions(chapter_pages, style)

    ranges: dict[str, tuple[int, int]] = {}
    chapters: list[Chapter] = []
    cursor = 1
    for outline, drafted in zip(root.chapters, chapter_pages):
        start = cursor
        end = start + len(drafted.pages) - 1
        ranges[outline.id] = (start, end)
        chapters.append(
            Chapter(
                id=outline.id,
                title=outline.title,
                pages=len(drafted.pages),
                goal=outline.goal,
                entry=outline.entry,
                payoff=outline.payoff,
            )
        )
        cursor = end + 1

    pages: list[PagePlan] = []
    for drafted in chapter_pages:
        for page in drafted.pages:
            links = [
                PageLink(
                    target=ranges[link.chapter][0 if link.anchor == "entry" else 1],
                    relation=link.relation,
                    cue=link.cue,
                )
                for link in page.links
            ]
            pages.append(
                PagePlan(
                    type=page.type,
                    composition=page.composition,
                    claim=page.claim,
                    learning_action=page.learning_action,
                    narrative_role=page.narrative_role,
                    links=links,
                    skills=page.skills,
                    tools=page.tools,
                )
            )

    plan = LecturePlan(
        title=root.title,
        language=root.language,
        audience=root.audience,
        throughline=root.throughline,
        chapters=chapters,
        design=style.reference,
        pages=pages,
    )
    style.validate_plan(plan)
    return catalog.validate_plan(plan, OPTIONAL_PAGE_TOOLS)


class BlockTool(BaseTool):
    name = "block"
    description = "Stop this agent because a real blocker prevents completion."
    input_model = BlockInput

    def __init__(self, state: Any) -> None:
        self.state = state

    async def execute(self, arguments: BlockInput, context: ToolContext) -> ToolResult:
        del context
        self.state.blocked = arguments.reason
        return ToolResult(output="blocked")


@dataclass
class PageToolState:
    run_dir: Path
    page: int
    logger: EventLog
    revision: int = 0
    submission: PageArtifact | None = None
    blocked: str = ""
    tool_state: dict[str, Any] = field(default_factory=dict)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    def __post_init__(self) -> None:
        self.workspace = self.run_dir / ".work" / f"p{self.page}"
        self.workspace.mkdir(parents=True, exist_ok=True)
        self.page_path = self.workspace / "page.html"

    def save_tool_state(self) -> None:
        return

    def event(self, kind: str, **fields: Any) -> None:
        self.logger.emit(kind, agent_id=f"builder:p{self.page}", page=self.page, **fields)


class ReadPageInput(ToolInput):
    offset: int = Field(default=0, ge=0)
    limit: int = Field(
        default=_CONFIG.tools.page_read_default_chars,
        ge=1,
        le=_CONFIG.tools.page_read_max_chars,
    )
    find: str = ""


class ReadPageTool(BaseTool):
    name = "read_page"
    description = "Read the current page HTML and revision, optionally locating exact text."
    input_model = ReadPageInput

    def __init__(self, state: PageToolState) -> None:
        self.state = state

    async def execute(self, arguments: ReadPageInput, context: ToolContext) -> ToolResult:
        del context
        async with self.state.lock:
            html = self.state.page_path.read_text(encoding="utf-8") if self.state.page_path.is_file() else ""
            if arguments.find:
                positions: list[int] = []
                cursor = 0
                while True:
                    cursor = html.find(arguments.find, cursor)
                    if cursor < 0:
                        break
                    positions.append(cursor)
                    cursor += max(1, len(arguments.find))
                output = {"revision": self.state.revision, "positions": positions}
            else:
                output = {
                    "revision": self.state.revision,
                    "offset": arguments.offset,
                    "html": html[arguments.offset : arguments.offset + arguments.limit],
                    "total_chars": len(html),
                }
        return ToolResult(output=json.dumps(output, ensure_ascii=False))


class EditPageInput(ToolInput):
    mode: Literal["replace", "patch"]
    revision: int = Field(ge=0)
    html: str = ""
    find: str = ""
    replace: str = ""


class EditPageTool(BaseTool):
    name = "edit_page"
    description = "Replace the whole page or patch one exact text occurrence at a known revision."
    input_model = EditPageInput

    def __init__(self, state: PageToolState) -> None:
        self.state = state

    async def execute(self, arguments: EditPageInput, context: ToolContext) -> ToolResult:
        del context
        async with self.state.lock:
            if self.state.submission is not None:
                return ToolResult(output="page is already submitted", is_error=True)
            if arguments.revision != self.state.revision:
                return ToolResult(output=f"revision conflict: current revision is {self.state.revision}", is_error=True)
            current = self.state.page_path.read_text(encoding="utf-8") if self.state.page_path.is_file() else ""
            if arguments.mode == "replace":
                if not arguments.html.strip():
                    return ToolResult(output="html must not be blank", is_error=True)
                updated = arguments.html
            else:
                if not arguments.find:
                    return ToolResult(output="find must not be blank in patch mode", is_error=True)
                count = current.count(arguments.find)
                if count != 1:
                    return ToolResult(output=f"patch requires exactly one match; found {count}", is_error=True)
                updated = current.replace(arguments.find, arguments.replace, 1)
            _atomic_text(self.state.page_path, updated)
            self.state.revision += 1
            return ToolResult(output=json.dumps({"revision": self.state.revision, "chars": len(updated)}))


class SubmitPageInput(ToolInput):
    revision: int = Field(ge=0)
    notes: str = ""


class SubmitPageTool(BaseTool):
    name = "submit_page"
    description = "Validate and submit the current page revision. This finishes Builder."
    input_model = SubmitPageInput

    def __init__(self, state: PageToolState) -> None:
        self.state = state

    async def execute(self, arguments: SubmitPageInput, context: ToolContext) -> ToolResult:
        del context
        async with self.state.lock:
            if arguments.revision != self.state.revision:
                return ToolResult(output=f"revision conflict: current revision is {self.state.revision}", is_error=True)
            if not self.state.page_path.is_file():
                return ToolResult(output="page is empty; call edit_page first", is_error=True)
            artifact = PageArtifact(
                html=clean_fragment(self.state.page_path.read_text(encoding="utf-8")),
                notes=arguments.notes,
            )
            failures = await page_delivery_failures(
                artifact,
                page=self.state.page,
                run_dir=self.state.run_dir,
            )
            if failures:
                return ToolResult(output=json.dumps({"failures": failures}, ensure_ascii=False), is_error=True)
            path = self.state.run_dir / "pages" / f"p{self.state.page}.json"
            _atomic_text(path, artifact.model_dump_json(indent=2))
            _atomic_text(self.state.page_path, artifact.html)
            self.state.submission = artifact
            return ToolResult(output=f"submitted p{self.state.page}")


class RunJsInput(ToolInput):
    code: str = Field(min_length=1, max_length=_CONFIG.tools.run_js_max_source_chars)


class RunJsTool(BaseTool):
    name = "run_js"
    description = "Run JavaScript in an isolated VM with console output and no host capabilities."
    input_model = RunJsInput

    def __init__(self, state: PageToolState) -> None:
        self.state = state

    async def execute(self, arguments: RunJsInput, context: ToolContext) -> ToolResult:
        del context
        used = int(self.state.tool_state.get("run_js_calls", 0))
        if used >= _CONFIG.tools.run_js_max_calls:
            return ToolResult(output="run_js call budget exhausted", is_error=True)
        self.state.tool_state["run_js_calls"] = used + 1
        wrapper = """'use strict';
const vm = require('node:vm');
const source = %s;
const output = [];
const sandbox = Object.create(null);
sandbox.console = Object.freeze({log: (...xs) => { output.push(xs.map(String).join(' ')); }});
const context = vm.createContext(sandbox, {codeGeneration: {strings: false, wasm: false}});
(async () => {
  const script = new vm.Script(source);
  const value = await Promise.resolve(script.runInContext(context, {timeout: %d}));
  if (value !== undefined) output.push(typeof value === 'string' ? value : JSON.stringify(value));
  process.stdout.write(output.join('\\n'));
})().catch(error => { process.stderr.write(String(error && error.stack || error)); process.exitCode = 1; });
""" % (json.dumps(arguments.code), int(_CONFIG.tools.run_js_timeout_sec * 1000))
        script = self.state.workspace / f"run-{used + 1}.cjs"
        _atomic_text(script, wrapper)
        try:
            process = await asyncio.create_subprocess_exec(
                "node", str(script),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self.state.workspace,
            )
            stdout, stderr = await asyncio.wait_for(
                process.communicate(), timeout=_CONFIG.tools.run_js_timeout_sec
            )
        except TimeoutError:
            return ToolResult(output="run_js timed out", is_error=True)
        text = (stdout + stderr).decode("utf-8", errors="replace")
        text = text[: _CONFIG.tools.run_js_max_output_chars]
        return ToolResult(output=text or "(no output)", is_error=process.returncode != 0)


def root_planner_tools(state: PlannerRootState) -> list[BaseTool]:
    return [PlanTool(state), BlockTool(state)]


def group_planner_tools(state: PlannerGroupState) -> list[BaseTool]:
    return [PagesTool(state), BlockTool(state)]


def builder_tools(state: PageToolState, optional: set[str]) -> list[BaseTool]:
    unknown = sorted(optional - OPTIONAL_PAGE_TOOLS)
    if unknown:
        raise ValueError(f"unknown Builder tools: {unknown}")
    tools: list[BaseTool] = [
        ReadPageTool(state), EditPageTool(state), SubmitPageTool(state), BlockTool(state)
    ]
    if "run_js" in optional:
        tools.append(RunJsTool(state))
    if {"find_image", "make_image"} & optional:
        from notale.tools.media import FindImageTool, MakeImageTool

        if "find_image" in optional:
            tools.append(FindImageTool(state))
        if "make_image" in optional:
            tools.append(MakeImageTool(state))
    return tools
