"""[0] Intake: one persistent OpenHarness worker submits a CourseBrief."""

from __future__ import annotations

import re
from pathlib import Path

from notale.agents.managed import ManagedAgent
from notale.core.models import CourseBrief
from notale.core.observability import ExperimentLogger
from notale.roles.profiles import INTAKE
from notale.utils.config import get_config

_CONFIG = get_config()


_PROMPT = """Inspect the complete `input/query.txt` with artifact_read. {material_instruction}
Submit topic, audience, priorKnowledge, durationMin, intensity (skim|standard|deep), language,
interactivityAsk, requestedPageCount, and rawQuery through submit_course_brief."""


_PAGE_COUNT = re.compile(r"(?<!\d)(\d{1,3})\s*(?:页|pages?\b)", re.IGNORECASE)
_DURATION = re.compile(r"\d+(?:\.\d+)?\s*(?:分钟|小时|mins?\b|minutes?\b|hours?\b)", re.IGNORECASE)


async def intake(
    llm,
    query: str,
    *,
    run_dir: Path,
    logger: ExperimentLogger | None = None,
) -> CourseBrief:
    page_match = _PAGE_COUNT.search(query)
    explicit_pages = int(page_match.group(1)) if page_match else None

    def validate(payload: dict) -> CourseBrief:
        payload = dict(payload)
        payload["rawQuery"] = query
        if explicit_pages is not None:
            payload["requestedPageCount"] = explicit_pages
            if _DURATION.search(query) is None:
                payload["durationMin"] = _CONFIG.pipeline.default_duration_min
        return CourseBrief.model_validate(payload)

    agent = ManagedAgent(
        run_dir=run_dir,
        stage="intake",
        worker_id="main",
        role=INTAKE,
        objective="Turn the full lecture request into one traceable course brief.",
        acceptance_criteria=[
            "All CourseBrief fields validate.",
            "The full input material was available without prompt truncation.",
            "rawQuery is bound by the harness to the original query.",
        ],
        steps=[
            ("inspect-input", "Read the complete query and optional material."),
            ("resolve-requirements", "Resolve explicit requirements and mark assumptions."),
            ("submit-brief", "Submit the validated structured course brief."),
        ],
        submit_tool="submit_course_brief",
        submit_validator=validate,
        llm=llm,
        logger=logger,
        purpose="intake",
    )
    material_instruction = (
        "An uploaded material exists: read complete `input/material.txt` with artifact_read."
        if (run_dir / "input/material.txt").is_file()
        else "No uploaded material exists; do not call artifact_read for input/material.txt."
    )
    return await agent.run_task(_PROMPT.format(material_instruction=material_instruction))
