"""[3] One persistent, skill-equipped OpenHarness worker per lecture page."""

from __future__ import annotations

import json
import re
from pathlib import Path

from notale.agents.managed import ManagedAgent
from notale.core.models import (
    BuilderPlan,
    BuilderNarrativeContext,
    BuilderPageBrief,
    BuilderSource,
    Globals,
    NarrativeChapterContext,
    Outline,
    PageArtifact,
    PageContext,
    PageSpec,
    PageStatus,
    PageType,
    PrepRecord,
    SourceGuardrails,
)
from notale.core.observability import ExperimentLogger
from notale.roles.profiles import BUILDER


def _mentions(text: str, key: str) -> bool:
    key = key.strip()
    if not key:
        return False
    if re.fullmatch(r"[A-Za-z0-9_]+", key):
        return re.search(
            rf"(?<![A-Za-z0-9_]){re.escape(key)}(?![A-Za-z0-9_])", text, re.I
        ) is not None
    return key.lower() in text.lower()


def compile_context(
    spec: PageSpec,
    globals_: Globals,
    all_specs: list[PageSpec],
    prep_store: dict[str, PrepRecord],
    builder_plan: BuilderPlan,
    outline: Outline | None = None,
) -> PageContext:
    idx = next(i for i, item in enumerate(all_specs) if item.pageId == spec.pageId)
    skills = builder_plan.assignments_for(spec.pageId)
    unauthorized = sorted(
        {item.name for item in skills} - set(BUILDER.authorized_skills)
    )
    if unauthorized:
        raise ValueError(f"Builder plan contains unauthorized skills: {unauthorized}")
    records = [prep_store[rid] for rid in spec.boundPrepRecords if rid in prep_store]
    source_text = json.dumps(
        [
            {
                "content": record.content,
                "invariants": record.invariants,
                "validRange": record.validRange,
                "knownInaccuracies": record.knownInaccuracies,
                "nonPhysicalVisualMappings": record.nonPhysicalVisualMappings,
            }
            for record in records
        ],
        ensure_ascii=False,
        sort_keys=True,
    )
    convention_text = "\n".join(
        (spec.centralMessage, spec.learningAction, spec.narrativeRole, source_text)
    )
    terminology = {
        key: value for key, value in globals_.terminology.items()
        if _mentions(convention_text, key)
    }
    notation = {
        key: value for key, value in globals_.notation.items()
        if _mentions(convention_text, key)
    }

    chapter_context = NarrativeChapterContext()
    throughline = ""
    if outline is not None:
        throughline = outline.throughline
        position = idx + 1
        chapter = next(
            (
                candidate for candidate in outline.chapters
                if candidate.pageRange[0] <= position <= candidate.pageRange[1]
            ),
            None,
        )
        if chapter is not None:
            chapter_context = NarrativeChapterContext(
                title=chapter.title,
                goal=chapter.narrativeGoal,
            )

    return PageContext(
        page=BuilderPageBrief(
            id=spec.pageId,
            type=spec.pageType,
            claim=spec.centralMessage,
            learningAction=spec.learningAction,
            terminology=terminology,
            notation=notation,
        ),
        narrative=BuilderNarrativeContext(
            throughline=throughline,
            chapter=chapter_context,
            pageRole=spec.narrativeRole or f"推进本页命题：{spec.centralMessage}",
            links=spec.continuity,
        ),
        sources=[
            BuilderSource(
                id=record.recordId,
                content=record.content,
                guardrails=SourceGuardrails(
                    invariants=record.invariants,
                    validRange=record.validRange,
                    limitations=record.knownInaccuracies,
                    visualMappings=record.nonPhysicalVisualMappings,
                ),
                citationUrl=record.evidence.url if record.evidence else None,
            )
            for record in records
        ],
        skills=skills,
    )


_PROMPT = """Build only page {page_id}. Call context_read until nextOffset=EOF for the complete compiled context.
The context field `skills` is the complete and exact optional skill assignment for this worker. It may
be empty. When it is not empty, read every item in order with skill_read until nextOffset=EOF. Never
derive, guess, or invent another skill name from the page type.
Preserve `page.claim`, the page-local conventions, `narrative`, and `sources`. Skill profile and
assignment instruction are internal composition constraints, never visible page copy. Narrative links
are internal continuity constraints: do not expose page IDs, relation names, or planning cues as
visible copy. Write one self-contained 1280x720 fragment whose single root has `data-notale-page`.
Use the locked `--notale-*` visual tokens supplied by the shared runtime; do not redefine them.
When the complete page is ready, call submit_page once with `html`, `designSpec`,
`boundReferences`, and `speakerNotes`. The harness writes and checks the page, then accepts it in
the same tool execution. The page file itself is the workspace, so do not create a second planning
or HTML copy. Use `sources` as the complete factual basis and preserve every source guardrail.
The fragment may contain inline CSS/native JS but no document shell, CDN, remote font/image,
fetch/import, placeholder, NaN, or undefined. If submit_page returns a concrete validation failure,
use page_patch for the smallest exact repair; the patch is automatically rechecked and submitted.
Use page_read or page_search only when the failure location is unknown. Harness events maintain the
task ledger. Prose is not a submission."""


class BuilderWorker:
    """One persistent page worker; tool failures are repaired inside its own loop."""

    def __init__(
        self,
        *,
        llm,
        run_dir: Path,
        context: PageContext,
        logger: ExperimentLogger | None = None,
    ) -> None:
        self.context = context
        page_brief = context.page
        role = BUILDER
        valid_ids = context.source_ids

        def validate(payload: dict) -> PageArtifact:
            payload = dict(payload)
            payload["pageId"] = page_brief.id
            payload["status"] = PageStatus.DRAFTED.value
            references = [str(item) for item in payload.get("boundReferences", [])]
            if not references:
                raise ValueError("page must cite at least one record from its compiled context")
            if len(references) != len(set(references)):
                raise ValueError("page boundReferences must not contain duplicates")
            payload["boundReferences"] = references
            unknown = sorted(set(references) - valid_ids)
            if unknown:
                raise ValueError(f"page binds records outside compiled context: {unknown}")
            return PageArtifact.model_validate(payload)

        self.agent = ManagedAgent(
            run_dir=run_dir,
            stage="builder",
            worker_id=page_brief.id,
            role=role,
            objective=f"构建讲义单页 {page_brief.id}：{page_brief.claim}",
            acceptance_criteria=[
                "仅实现本页的唯一中心信息。",
                "遵守已装配 skills、叙事、资料边界与离线运行约束。",
                "若含教学性交互，状态由真实领域模型执行产生，界面只投影模型结果。",
                "页面 schema 有效，并通过 submit_page 提交。",
            ],
            steps=[
                ("load-context", "读取完整页面上下文并加载需要的 skill。"),
                ("implement-check", "实现页面，由 Harness 执行确定性可交付性检查。"),
                ("submit-page", "通过原子 submit_page 写入、检查并提交页面。"),
            ],
            submit_tool="submit_page",
            submit_validator=validate,
            llm=llm,
            logger=logger,
            validation_context={
                "valid_record_ids": sorted(valid_ids),
                "page_id": page_brief.id,
                "page_type": page_brief.type.value,
                "context_path": f"page-contexts/{page_brief.id}.json",
            },
            purpose=f"build:{page_brief.id}",
            assigned_skills=context.skills,
        )

    async def build(self) -> PageArtifact:
        page = await self.agent.run_task(
            _PROMPT.format(page_id=self.context.page.id)
        )
        return PageArtifact.model_validate(page)


async def build_page(worker: BuilderWorker) -> PageArtifact:
    """Small compatibility surface used by the deterministic orchestrator."""
    return await worker.build()
