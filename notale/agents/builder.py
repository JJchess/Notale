"""One autonomous Builder agent loop per page."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from notale.agents.loop import AgentLoop
from notale.core.models import LecturePlan, PageArtifact
from notale.core.observability import EventLog
from notale.roles.profiles import BUILDER
from notale.tools.agent_tools import PageToolState, builder_tools
from notale.utils.skill_catalog import GeneratedDesignSkill

def compile_context(plan: LecturePlan, number: int) -> dict[str, Any]:
    page = plan.pages[number - 1]
    chapter = None
    position = number
    for candidate in plan.chapters:
        if position <= candidate.pages:
            chapter = candidate
            break
        position -= candidate.pages
    if chapter is None:
        raise ValueError(f"page {number} is not assigned to a chapter")
    return {
        "page": {
            "number": number,
            "type": page.type.value,
            "composition": page.composition,
            "claim": page.claim,
            "learning_action": page.learning_action,
        },
        "narrative": {
            "throughline": plan.throughline,
            "chapter": {
                "id": chapter.id,
                "title": chapter.title,
                "goal": chapter.goal,
                "entry": chapter.entry,
                "payoff": chapter.payoff,
            },
            "role": page.narrative_role,
            "links": [link.model_dump(mode="json") for link in page.links],
        },
    }


class BuilderWorker:
    def __init__(
        self,
        *,
        llm: Any,
        run_dir: Path,
        plan: LecturePlan,
        page: int,
        style: GeneratedDesignSkill,
        logger: EventLog,
    ) -> None:
        self.plan = plan
        self.page = page
        spec = plan.pages[page - 1]
        self.context = compile_context(plan, page)
        skill_text = style.render(spec.composition)
        optional_tools = set(spec.tools)
        self.state = PageToolState(
            run_dir=run_dir,
            page=page,
            logger=logger,
            page_plan=spec,
            lecture_language=plan.language,
            style=style,
            llm=llm,
        )
        self.agent = AgentLoop(
            role=BUILDER,
            state=self.state,
            tools=builder_tools(self.state, optional_tools),
            terminal_tool="submit_page",
            llm=llm,
            logger=logger,
            agent_id=f"builder:p{page}",
            page=page,
            skill_text=skill_text,
            purpose=f"build:p{page}",
        )

    async def build(self) -> PageArtifact:
        task = f"""Build page {self.page} of {len(self.plan.pages)} for an audience of {self.plan.audience}.
The lecture language is {self.plan.language}. This JSON is the complete page boundary:

```json
{json.dumps(self.context, ensure_ascii=False, indent=2)}
```

The page workspace starts empty at revision 0. Do not call read_page before the first successful
edit_page. The first page-file operation must be edit_page with mode="replace" and revision=0;
assigned non-file tools may run first. After that, you may read and revise the page across multiple
turns. Use only the tools present in this session. After the initial implementation, call
inspect_page(revision). It renders the exact 1280×720 page and runs one isolated visual review
without inheriting this Builder conversation or tools. If it returns revised or reverted, it has
already saved the page at the returned revision; call inspect_page again for that revision. If it
returns success, finish with submit_page(revision, notes) in the next turn. If it returns
review_discarded, your page is unchanged: apply the returned findings with edit_page, then call
inspect_page again. If it returns any other error, fix what the error describes and retry."""
        return await self.agent.run(task)


async def build_page(worker: BuilderWorker) -> PageArtifact:
    return await worker.build()
