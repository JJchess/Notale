"""Planner orchestration: one root decision, then optional parallel chapter groups."""

from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path
from typing import Any

from notale.agents.loop import AgentLoop
from notale.core.models import LecturePlan, SkillAssignment
from notale.core.observability import EventLog
from notale.roles.profiles import BUILDER, PLANNER
from notale.tools.agent_tools import (
    OPTIONAL_PAGE_TOOLS,
    ChapterPages,
    PlanChapter,
    PlanInput,
    PlannerGroupState,
    PlannerRootState,
    assemble_plan,
    group_planner_tools,
    root_planner_tools,
)
from notale.utils.config import SKILLS_PATH
from notale.utils.skill_catalog import (
    GeneratedDesignSkill,
    SkillCatalog,
    load_skill_catalog,
    write_generated_style,
)


SKILL_CATALOG = load_skill_catalog(BUILDER, SKILLS_PATH)
PLANNER_SKILL_CATALOG = load_skill_catalog(PLANNER, SKILLS_PATH)
GROUP_PAGE_TARGET = 20


def group_chapters(
    chapters: list[PlanChapter], target: int = GROUP_PAGE_TARGET
) -> list[list[PlanChapter]]:
    """Greedily pack the most consecutive whole chapters under a soft target."""

    groups: list[list[PlanChapter]] = []
    current: list[PlanChapter] = []
    current_estimate = 0
    for chapter in chapters:
        if current and current_estimate + chapter.pages > target:
            groups.append(current)
            current = []
            current_estimate = 0
        current.append(chapter)
        current_estimate += chapter.pages
    if current:
        groups.append(current)
    return groups


def _save_plan(run_dir: Path, plan: LecturePlan) -> None:
    path = run_dir / "plan.json"
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(plan.model_dump_json(indent=2), encoding="utf-8")
    tmp.replace(path)


async def _plan_group(
    llm: Any,
    *,
    root: PlanInput,
    group: int,
    assigned: list[PlanChapter],
    run_dir: Path,
    logger: EventLog,
    catalog: SkillCatalog,
    menu: str,
    style: GeneratedDesignSkill,
) -> tuple[list[ChapterPages], int]:
    agent_id = f"planner:g{group}"
    state = PlannerGroupState(
        run_dir=run_dir,
        group=group,
        chapters=tuple(assigned),
        all_chapters=tuple(root.chapters),
        catalog=catalog,
        logger=logger,
    )
    outline = root.model_dump(mode="json", exclude={"chapter_pages"})
    task = f"""Expand the assigned whole chapters into page plans.

Global lecture contract:
```json
{json.dumps(outline, ensure_ascii=False)}
```

Assigned chapters, in required order:
```json
{json.dumps([item.model_dump(mode='json') for item in assigned], ensure_ascii=False)}
```

Available Builder capabilities:
```json
{menu}
```

Call `pages` once with every assigned chapter. Give each chapter at least one page, but treat
`pages` only as a soft workload estimate: use the page count the content actually needs. Use
symbolic chapter entry/exit links; do not invent numeric page positions. Preserve the root
throughline, chapter entry/payoff, and cross-chapter links. Do not print the plan as prose."""
    estimates = {chapter.id: chapter.pages for chapter in assigned}
    started = time.monotonic()
    logger.emit(
        "planner.group.started",
        agent_id=agent_id,
        group=group,
        chapters=[chapter.id for chapter in assigned],
        chapter_span=[assigned[0].id, assigned[-1].id],
        page_estimates=estimates,
        estimated_pages=sum(estimates.values()),
    )
    agent = AgentLoop(
        role=PLANNER,
        state=state,
        tools=group_planner_tools(state),
        terminal_tool="pages",
        llm=llm,
        logger=logger,
        agent_id=agent_id,
        purpose=f"plan:g{group}",
        skill_text=style.render(),
    )
    try:
        submission = await agent.run(task)
    except BaseException as exc:
        logger.emit(
            "planner.group.failed",
            agent_id=agent_id,
            group=group,
            duration_ms=round((time.monotonic() - started) * 1000),
            error=f"{type(exc).__name__}: {exc}",
        )
        raise
    duration_ms = round((time.monotonic() - started) * 1000)
    logger.emit(
        "planner.group.completed",
        agent_id=agent_id,
        group=group,
        duration_ms=duration_ms,
        chapters=[chapter.id for chapter in assigned],
        page_estimates=estimates,
        pages=sum(len(item.pages) for item in submission.chapters),
    )
    return submission.chapters, duration_ms


async def plan_lecture(
    llm: Any,
    topic: str,
    *,
    run_dir: Path,
    logger: EventLog,
    catalog: SkillCatalog = SKILL_CATALOG,
    planner_catalog: SkillCatalog = PLANNER_SKILL_CATALOG,
) -> LecturePlan:
    menu = catalog.planner_menu(OPTIONAL_PAGE_TOOLS)
    state = PlannerRootState(run_dir=run_dir, catalog=catalog, logger=logger)
    task = f"""Plan one coherent lecture deck for this request:

{topic}

Available Builder capabilities:
```json
{menu}
```

First derive one concrete visual system for this topic and audience, then call `style` exactly
once. Wait for its success result. On the next model turn call `plan` exactly once; `plan` has no
design field because the system binds the accepted run Skill. Include complete `chapter_pages` when
the whole plan fits comfortably in this call—around twenty pages normally does. Leave
`chapter_pages` empty only when a substantially larger lecture benefits from parallel chapter
expansion. This is your semantic decision; there is no code-side page threshold. Any page count in
the request is a flexible scope hint, never an acceptance target.
Keep chapters whole, give each a stable id plus goal/entry/payoff contract, and use
symbolic chapter entry/exit links rather than numeric page positions. Every chapter after the first
must contain at least one page link to an earlier chapter. Do not print the plan as prose."""
    root_started = time.monotonic()
    logger.emit("planner.root.started", agent_id="planner")
    root_agent = AgentLoop(
        role=PLANNER,
        state=state,
        tools=root_planner_tools(state),
        terminal_tool="plan",
        llm=llm,
        logger=logger,
        agent_id="planner",
        purpose="plan",
        skill_text=planner_catalog.render([SkillAssignment(name="style-studio")]),
    )
    root = await root_agent.run(task)
    style = state.style
    if style is None:
        raise RuntimeError("Planner completed without creating a run design Skill")
    grouped = not bool(root.chapter_pages)
    root_ms = round((time.monotonic() - root_started) * 1000)
    logger.emit(
        "planner.root.completed",
        agent_id="planner",
        duration_ms=root_ms,
        grouped=grouped,
        chapters=len(root.chapters),
        estimated_pages=sum(chapter.pages for chapter in root.chapters),
        pages=sum(len(item.pages) for item in root.chapter_pages),
    )

    parallel_ms = 0
    slowest_group_ms = 0
    if grouped:
        groups = group_chapters(root.chapters)
        parallel_started = time.monotonic()
        results = await asyncio.gather(
            *(
                _plan_group(
                    llm,
                    root=root,
                    group=index,
                    assigned=assigned,
                    run_dir=run_dir,
                    logger=logger,
                    catalog=catalog,
                    menu=menu,
                    style=style,
                )
                for index, assigned in enumerate(groups, 1)
            )
        )
        parallel_ms = round((time.monotonic() - parallel_started) * 1000)
        slowest_group_ms = max(duration for _, duration in results)
        chapter_pages = [item for pages, _ in results for item in pages]
        logger.emit(
            "planner.parallel.completed",
            groups=len(groups),
            duration_ms=parallel_ms,
            slowest_group_ms=slowest_group_ms,
        )
    else:
        chapter_pages = root.chapter_pages

    plan = assemble_plan(root, chapter_pages, catalog, style.reference)
    write_generated_style(run_dir / "skills", style)
    _save_plan(run_dir, plan)
    logger.emit(
        "planner.plan.completed",
        grouped=grouped,
        root_duration_ms=root_ms,
        parallel_duration_ms=parallel_ms,
        slowest_group_ms=slowest_group_ms,
        planning_wall_ms=root_ms + parallel_ms,
        chapters=len(plan.chapters),
        pages=len(plan.pages),
    )
    return plan
