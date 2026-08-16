"""Browser rendering plus one isolated, tool-free visual review per invocation."""

from __future__ import annotations

import base64
import asyncio
import hashlib
import json
import time
import uuid
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from notale.agents.loop import (
    ConversationMessage,
    ImageBlock,
    ModelRequest,
    TextBlock,
    Usage,
    complete_model_request,
    model_request_body,
    request_message_count,
    resolve_client,
)
from notale.core.models import PageArtifact
from notale.style_studio.decoration import page_role_for
from notale.core.stages.page_check import clean_fragment, page_delivery_failures
from notale.core.stages.page_qa import (
    gating_failures,
    QaCheck,
    evaluate_page_qa,
    qa_prompt_block,
    summarize,
    write_qa_report,
)
from notale.tools.base import BaseTool, ToolContext, ToolResult
from notale.utils.config import get_config
from notale.utils.parsing import visible_text
from notale.web.browser import BrowserPageRenderer, RenderedPage
from notale.web.deck import render_slide_document


_CONFIG = get_config()


class _StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class InspectPageInput(_StrictInput):
    revision: int = Field(ge=0)


class InspectionFinding(_StrictInput):
    severity: Literal["critical", "major", "minor"]
    location: str
    problem: str
    fix: str


class InspectionDecision(_StrictInput):
    decision: Literal["success", "revise", "revert"]
    findings: list[InspectionFinding] = Field(default_factory=list)
    html: str

    @property
    def blocking_findings(self) -> list[InspectionFinding]:
        return [f for f in self.findings if f.severity in ("critical", "major")]

    @model_validator(mode="after")
    def validate_decision_payload(self) -> "InspectionDecision":
        if self.decision == "success" and self.blocking_findings:
            raise ValueError("success is not allowed while critical or major findings remain")
        if self.decision == "revise":
            if not self.blocking_findings:
                raise ValueError("revise requires at least one critical or major finding")
            if not self.html.strip():
                raise ValueError("revise must return the complete revised HTML")
        if self.decision == "revert" and self.html.strip():
            raise ValueError("revert must leave html empty")
        return self


def _parse_inspection_decision(raw: str) -> InspectionDecision:
    """Accept the decision object even when a compatible provider prefixes prose.

    Some Responses-compatible gateways do not enforce ``json_schema`` at the wire
    boundary. Claude may therefore explain its visual judgment before emitting the
    requested object, or echo HTML alongside a ``success`` decision. The decision is
    still authoritative: HTML is consumed only for ``revise`` below.
    """

    try:
        return InspectionDecision.model_validate_json(raw)
    except ValidationError as original_error:
        decoder = json.JSONDecoder()
        for offset, character in enumerate(raw):
            if character != "{":
                continue
            try:
                candidate, _ = decoder.raw_decode(raw[offset:])
                return InspectionDecision.model_validate(candidate)
            except (json.JSONDecodeError, ValidationError):
                continue
        raise original_error


def _atomic_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(text, encoding="utf-8")
    temporary.replace(path)


def _atomic_json(path: Path, value: dict[str, Any]) -> None:
    _atomic_text(path, json.dumps(value, ensure_ascii=False, indent=2, default=str))


def _inspection_schema() -> dict[str, Any]:
    """Return the strict, provider-compatible decision schema."""

    schema = InspectionDecision.model_json_schema()

    def clean(value: Any) -> None:
        if isinstance(value, dict):
            value.pop("minItems", None)
            value.pop("maxItems", None)
            for item in value.values():
                clean(item)
        elif isinstance(value, list):
            for item in value:
                clean(item)

    clean(schema)
    return schema


_INSPECTION_SYSTEM_PROMPT = """You are a presentation art director and HTML editor. Treat the
1280×720 screenshot as visual truth and the supplied Style as authoritative.

Severity rubric for findings:
- critical: content clipped by or overflowing the 1280×720 frame, overlapping or unreadable
  text, blank or broken regions, contrast failures, crowding so dense the page is unreadable.
- major: large unbalanced dead space, an overcrowded page — more text regions than the Style's
  recipe allows, fonts or spacing shrunk below the recipe values to fit content, or panels
  filling every margin — misaligned structure, colors or typography that violate the Style
  tokens, a layout that ignores the assigned composition.
- minor: spacing nits and taste-level typography or wording preferences.

Crowding is fixed by removing or merging content, never by shrinking type or spacing.

List every critical and major defect you can see in this round — do not hold problems back
for later rounds — then decide. Return success when no critical or major finding remains —
minor findings alone are never a reason to revise. Return revise only with at least one
critical or major finding, together with one complete replacement HTML fragment (exactly one
data-notale-page root) that fixes all of the listed findings together, not a subset. An
<iframe data-notale-component=...> mount is a sealed, separately rendered managed component:
judge only its size and placement, never its internals, and any revised html must keep that
iframe tag byte-for-byte and must not contain any <script> anywhere on such a page. When a
previous render is supplied and your latest change made the page worse, return revert instead.
On success or revert, set html to "". Return only the requested structured object."""


def _inspection_history_prompt(
    state: Any,
    *,
    round_number: int,
    previous_round: dict[str, Any] | None,
    previous_render: Literal["included", "identical", "unavailable"],
    can_revert: bool,
) -> str:
    used = int(state.tool_state.get("inspector_revisions", 0) or 0)
    maximum = _CONFIG.inspection.maximum_revisions
    lines = [
        f"Inspection round {round_number}. "
        f"Inspector revision budget: {used}/{maximum} used.",
    ]
    if previous_round is None:
        lines.append("Previous round outcome: none — this is the first review of this page.")
        return "\n".join(lines)
    outcome = previous_round.get("outcome") or previous_round.get("decision") or "failed"
    lines.append(f"Previous round outcome: {outcome}.")
    findings = previous_round.get("findings") or []
    if findings:
        lines.append("Findings you reported last round:")
        lines.append(json.dumps(findings, ensure_ascii=False))
        lines.append("Do not re-report a finding you already claimed to fix with the same fix.")
    else:
        lines.append("Findings you reported last round: none.")
    if previous_render == "included":
        lines.append(
            "The first image is the CURRENT render. The second image is the PREVIOUS render. "
            "Compare them before deciding."
        )
    elif previous_render == "identical":
        lines.append(
            "The current render is identical to the previous round's render, so the previous "
            "screenshot is omitted."
        )
    if can_revert:
        lines.append(
            'If your latest revision made the page worse, return "revert" to restore '
            "the page as it was before that revision."
        )
    lines.append(
        "If the findings above are resolved and no critical or major defect remains, "
        'return "success".'
    )
    return "\n".join(lines)


def style_baseline_path(state: Any) -> Path | None:
    """The StylePack specimen this page should read as a sibling of.

    Materializing a pack copies its rendered specimens into ``style_refs``. A
    section break is composed like a cover; everything else like a content page.
    """
    run_dir = getattr(state, "run_dir", None)
    if run_dir is None:
        return None
    page_plan = getattr(state, "page_plan", None)
    page_type = str(getattr(page_plan, "type", "") or "")
    stem = "specimen_cover" if page_type == "section-break" else "specimen_content"
    candidates = [f"{stem}.png", "specimen_content.png", "specimen_cover.png"]
    for name in candidates:
        path = Path(run_dir) / "style_refs" / name
        if path.is_file():
            return path
    return None


def _inspection_user_prompt(state: Any, html: str, history: str, *, baseline: bool) -> str:
    style = getattr(state, "style", None)
    page_plan = getattr(state, "page_plan", None)
    if style is not None and page_plan is not None:
        style_text = style.render(page_plan.composition)
        tokens = style.tokens
    else:
        # Production Builders always provide both. Keeping a narrow fallback makes the tool usable
        # in direct transaction tests without smuggling the outer Builder profile into this call.
        style_text = "# Run design Style\n\nNo run Style was attached to this direct tool invocation."
        tokens = {}
    baseline_note = (
        "\nThe LAST image is the StylePack's own rendered specimen — the established "
        "baseline for this style's palette, type scale, and surface treatment. Judge "
        "whether this page belongs to the same family. It is a reference for visual "
        "language only: do not expect its layout, and never copy its text.\n"
        if baseline
        else ""
    )
    return f"""Make this the best possible 1280×720 presentation page.
{baseline_note}

Authoritative Style Guide and assigned composition:
<style_guide>
{style_text}
</style_guide>

Exact Style tokens:
```json
{json.dumps(tokens, ensure_ascii=False, indent=2)}
```

Current complete HTML fragment:
```html
{html}
```

{history}
"""


async def _inspection_model_call(
    state: Any,
    *,
    round_number: int,
    html: str,
    screenshot_data_url: str,
    history: str,
    previous_screenshot_data_url: str | None = None,
) -> tuple[str, Usage, str]:
    """Run exactly one isolated, tool-free multimodal Inspector request."""

    purpose = f"inspection:p{state.page}"
    candidate = state.llm
    factory = getattr(candidate, "for_agent", None)
    if callable(factory):
        candidate = factory(state=state, purpose=purpose, terminal_tool="")
    baseline_path = style_baseline_path(state)
    baseline_data_url: str | None = None
    if baseline_path is not None:
        encoded = base64.b64encode(baseline_path.read_bytes()).decode("ascii")
        baseline_data_url = f"data:image/png;base64,{encoded}"
    user_prompt = _inspection_user_prompt(
        state, html, history, baseline=baseline_data_url is not None
    )
    prepare = getattr(candidate, "prepare", None)
    if callable(prepare):
        prepare(user_prompt)
    client, model, owns_client = resolve_client(candidate)
    # Both wire serializers flatten a message to one text part followed by its images in
    # order, so image ordering is explained in the history text rather than by labels.
    content: list[TextBlock | ImageBlock] = [
        TextBlock(text=user_prompt),
        ImageBlock(image_url=screenshot_data_url, detail="high"),
    ]
    if previous_screenshot_data_url is not None:
        content.append(ImageBlock(image_url=previous_screenshot_data_url, detail="high"))
    if baseline_data_url is not None:
        content.append(ImageBlock(image_url=baseline_data_url, detail="high"))
    request = ModelRequest(
        model=model,
        messages=[ConversationMessage(role="user", content=content)],
        system_prompt=_INSPECTION_SYSTEM_PROMPT,
        max_tokens=_CONFIG.model.max_output_tokens,
        reasoning_effort=_CONFIG.model.reasoning_effort,
        tools=[],
        response_schema=_inspection_schema(),
        response_schema_name="notale_inspection",
        require_parameters=True,
    )
    body = model_request_body(client, request)
    call_id = uuid.uuid4().hex
    agent_id = purpose
    request_path = (
        state.run_dir / "llm-requests" / f"inspection-p{state.page}"
        / f"turn-{round_number:04d}.json"
    )
    request_payload = {
        "call_id": call_id,
        "agent_id": agent_id,
        "page": state.page,
        "turn": round_number,
        "stage": "visual-review",
        "request": body,
    }
    request_text = json.dumps(request_payload, ensure_ascii=False, indent=2, default=str)
    _atomic_text(request_path, request_text)
    request_raw = request_text.encode("utf-8")
    state.logger.emit(
        "llm.call.started",
        agent_id=agent_id,
        page=state.page,
        call_id=call_id,
        model=model,
        inspection_round=round_number,
        message_count=request_message_count(body),
        tool_count=0,
        max_output_tokens=_CONFIG.model.max_output_tokens,
        reasoning_effort=_CONFIG.model.reasoning_effort,
        request_path=str(request_path.relative_to(state.run_dir)),
        request_sha256=hashlib.sha256(request_raw).hexdigest(),
        request_bytes=len(request_raw),
    )
    started = time.monotonic()
    first_ms: int | None = None
    retry_meta: dict[str, Any] = {}
    try:
        async with asyncio.timeout(_CONFIG.agents.builder.max_duration_sec):
            complete, first_ms, retry_meta = await complete_model_request(
                client,
                request,
                on_retry=lambda attempt, error_class, delay: state.logger.emit(
                    "llm.call.retrying",
                    agent_id=agent_id,
                    page=state.page,
                    call_id=call_id,
                    attempt=attempt,
                    next_attempt=attempt + 1,
                    error_class=error_class,
                    delay_sec=round(delay, 3),
                    inspection_round=round_number,
                ),
            )
    except BaseException as exc:
        state.logger.emit(
            "llm.call.failed",
            agent_id=agent_id,
            page=state.page,
            call_id=call_id,
            duration_ms=round((time.monotonic() - started) * 1000),
            first_event_ms=first_ms,
            inspection_round=round_number,
            error=f"{type(exc).__name__}: {exc}",
            attempts=int(getattr(exc, "attempts", 1)),
            error_class=str(getattr(exc, "error_class", "") or ""),
        )
        raise
    finally:
        if owns_client:
            await client.close()
    duration_ms = round((time.monotonic() - started) * 1000)
    response_path = (
        state.run_dir / "llm-responses" / f"inspection-p{state.page}"
        / f"turn-{round_number:04d}.json"
    )
    _atomic_text(response_path, complete.message.text)
    state.logger.emit(
        "llm.call.completed",
        agent_id=agent_id,
        page=state.page,
        call_id=call_id,
        duration_ms=duration_ms,
        first_event_ms=first_ms,
        attempts=int(retry_meta.get("attempts", 1)),
        inspection_round=round_number,
        response_path=str(response_path.relative_to(state.run_dir)),
    )
    state.logger.emit(
        "agent.turn",
        agent_id=agent_id,
        page=state.page,
        duration_ms=duration_ms,
        inspection_round=round_number,
        input_tokens=complete.usage.input_tokens,
        output_tokens=complete.usage.output_tokens,
    )
    return complete.message.text, complete.usage, str(response_path.relative_to(state.run_dir))


class _HookRenderer:
    """Test adapter that preserves the production renderer contract."""

    def __init__(self, hook: Any, page: int) -> None:
        self.hook = hook
        self.page = page

    async def __aenter__(self) -> "_HookRenderer":
        return self

    async def __aexit__(self, exc_type: Any, exc: Any, traceback: Any) -> None:
        del exc_type, exc, traceback

    async def render(self, document_path: Path, *, measure: bool = False) -> RenderedPage:
        del measure  # a hook supplies measurements only if it has them
        result = await self.hook(document_path=document_path, page=self.page)
        screenshot = result.get("screenshot") or b""
        if isinstance(screenshot, str):
            screenshot = base64.b64decode(screenshot)
        measurements = result.get("measurements")
        return RenderedPage(
            screenshot=bytes(screenshot),
            measurements=measurements if isinstance(measurements, dict) else {},
        )


def _style_type_scale(style: Any) -> dict[str, Any] | None:
    scale = getattr(style, "type_scale", None)
    return scale.model_dump(mode="json") if scale is not None else None


class InspectPageTool(BaseTool):
    name = "inspect_page"
    description = (
        "Render the current revision at exactly 1280x720, run one isolated visual review, and "
        "return success or a new revision. Call it again whenever it returns revised."
    )
    input_model = InspectPageInput

    def __init__(self, state: Any) -> None:
        self.state = state
        self.artifact_dir = state.run_dir / "inspections"
        self.document_path = state.run_dir / "slides" / f".inspect-p{state.page}.html"
        self.report_path = self.artifact_dir / f"p{state.page}.json"
        if self.report_path.is_file():
            self.report = json.loads(self.report_path.read_text(encoding="utf-8"))
        else:
            self.report: dict[str, Any] = {
                "page": state.page,
                "status": "pending",
                "latest_revision": None,
                "rounds": [],
            }

    def _emit(self, kind: str, **payload: Any) -> None:
        self.state.logger.emit(
            kind,
            agent_id=f"builder:p{self.state.page}",
            page=self.state.page,
            **payload,
        )

    def _renderer(self) -> Any:
        hook = getattr(self.state.llm, "render_inspection_page", None)
        return _HookRenderer(hook, self.state.page) if callable(hook) else BrowserPageRenderer()

    def _write_document(self, html: str) -> None:
        _atomic_text(
            self.document_path,
            render_slide_document(
                html,
                page=self.state.page,
                run_dir=self.state.run_dir,
                language=self.state.lecture_language,
                page_role=page_role_for(
                    getattr(getattr(self.state, "page_plan", None), "type", "content"),
                    self.state.page,
                ),
            ),
        )

    def _evaluate_qa(self, rendered: RenderedPage, html: str) -> list[QaCheck]:
        """Judge the render, and record the verdict next to the inspection report."""
        style = getattr(self.state, "style", None)
        checks = evaluate_page_qa(
            rendered.measurements,
            tokens=getattr(style, "tokens", None) or {},
            type_scale=_style_type_scale(style),
            source_text=visible_text(html),
        )
        try:
            write_qa_report(self.state.run_dir, self.state.page, checks)
        except OSError:  # noqa: BLE001 — a report is diagnostics, not the product
            pass
        counts = summarize(checks)
        self._emit(
            "inspection.measured",
            failed=[check.check_id for check in checks if check.status == "fail"],
            **counts,
        )
        return checks

    def _save_render(
        self, round_number: int, revision: int, html: str, rendered: RenderedPage
    ) -> dict[str, Any]:
        prefix = self.artifact_dir / f"p{self.state.page}-round-{round_number}"
        html_path = prefix.with_suffix(".html")
        png_path = prefix.with_suffix(".png")
        _atomic_text(html_path, html)
        png_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = png_path.with_suffix(".png.tmp")
        temporary.write_bytes(rendered.screenshot)
        temporary.replace(png_path)
        return {
            "round": round_number,
            "revision": revision,
            "input_revision": revision,
            "html": str(html_path.relative_to(self.state.run_dir)),
            "screenshot": str(png_path.relative_to(self.state.run_dir)),
            "screenshot_sha256": hashlib.sha256(rendered.screenshot).hexdigest(),
        }

    async def execute(self, arguments: InspectPageInput, context: ToolContext) -> ToolResult:
        async with self.state.lock:
            if self.state.submission is not None:
                return ToolResult(output="page is already submitted", is_error=True)
            if arguments.revision != self.state.revision:
                return ToolResult(
                    output=f"revision conflict: current revision is {self.state.revision}",
                    is_error=True,
                )
            if not self.state.page_path.is_file():
                return ToolResult(output="page is empty; call edit_page first", is_error=True)
            html = clean_fragment(self.state.page_path.read_text(encoding="utf-8"))
            artifact = PageArtifact(html=html)
            failures = await page_delivery_failures(
                artifact,
                page=self.state.page,
                run_dir=self.state.run_dir,
                page_plan=self.state.page_plan,
            )
            if failures:
                self._emit(
                    "inspection.rejected",
                    revision=self.state.revision,
                    failures=failures,
                )
                return ToolResult(
                    output=json.dumps({"failures": failures}, ensure_ascii=False),
                    is_error=True,
                )
            _atomic_text(self.state.page_path, html)
            revision = self.state.revision

        round_number = int(self.state.tool_state.get("inspection_calls", 0)) + 1
        self.state.tool_state["inspection_calls"] = round_number
        self._emit("inspection.started", revision=revision, round=round_number)
        round_record: dict[str, Any] | None = None
        try:
            self._write_document(html)
            async with self._renderer() as renderer:
                rendered = await renderer.render(self.document_path, measure=True)
            if not rendered.screenshot:
                raise RuntimeError("browser returned an empty screenshot")
            qa_checks = self._evaluate_qa(rendered, html)
            blocking = gating_failures(qa_checks)
            if blocking:
                # Unreadable text is not a matter of taste, so the page goes back
                # to the Builder without spending a review on it.
                failures = [check.detail for check in blocking]
                self._emit(
                    "inspection.rejected", revision=revision, failures=failures
                )
                self.report.update({"status": "rejected", "latest_revision": revision})
                _atomic_json(self.report_path, self.report)
                return ToolResult(
                    output=json.dumps({"failures": failures}, ensure_ascii=False),
                    is_error=True,
                )
            round_record = self._save_render(round_number, revision, html, rendered)
            previous_rounds = list(self.report["rounds"])
            self.report.update({"status": "rendered", "latest_revision": revision})
            self.report["rounds"].append(round_record)
            _atomic_json(self.report_path, self.report)
            self._emit(
                "inspection.rendered",
                revision=revision,
                round=round_number,
                screenshot=round_record["screenshot"],
                screenshot_sha256=round_record["screenshot_sha256"],
            )
            async with self.state.lock:
                if self.state.revision != revision:
                    raise RuntimeError(
                        f"page changed while rendering: expected revision {revision}, "
                        f"found {self.state.revision}"
                    )
            previous_round = previous_rounds[-1] if previous_rounds else None
            previous_screenshot_data_url: str | None = None
            previous_render: Literal["included", "identical", "unavailable"] = "unavailable"
            if previous_round is not None:
                previous_sha = previous_round.get("screenshot_sha256")
                previous_path = previous_round.get("screenshot")
                if previous_sha and previous_sha == round_record["screenshot_sha256"]:
                    previous_render = "identical"
                elif previous_sha and previous_path:
                    previous_file = self.state.run_dir / previous_path
                    if previous_file.is_file():
                        encoded = base64.b64encode(previous_file.read_bytes()).decode("ascii")
                        previous_screenshot_data_url = f"data:image/png;base64,{encoded}"
                        previous_render = "included"
            history = _inspection_history_prompt(
                self.state,
                round_number=round_number,
                previous_round=previous_round,
                previous_render=previous_render,
                can_revert=any(
                    record.get("outcome") == "revised" for record in previous_rounds
                ),
            )
            # Measured defects are facts about the render, so they are handed to
            # the inspector rather than hidden behind its judgement. They advise
            # rather than gate: the inspector can see the composited page and is
            # the right party to weigh a soft, deliberate low-contrast ground.
            measured = qa_prompt_block(qa_checks)
            if measured:
                history = history + "\n\n" + measured
            raw_decision, _, response_path = await _inspection_model_call(
                self.state,
                round_number=round_number,
                html=html,
                screenshot_data_url=rendered.screenshot_data_url,
                history=history,
                previous_screenshot_data_url=previous_screenshot_data_url,
            )
            round_record["response"] = response_path
            decision = _parse_inspection_decision(raw_decision)
            round_record.update({
                "decision": decision.decision,
                "findings": [finding.model_dump() for finding in decision.findings],
            })

            if decision.decision == "success":
                async with self.state.lock:
                    if self.state.revision != revision:
                        raise RuntimeError(
                            f"page changed during visual review: expected revision {revision}, "
                            f"found {self.state.revision}"
                        )
                    self.state.tool_state["inspected_revision"] = revision
                    self.state.tool_state["inspection_turn"] = int(
                        context.metadata.get("turn", 0) or 0
                    )
                    self.state.tool_state["inspection_status"] = "success"
                    self.state.tool_state["inspection_error"] = ""
                inspector_revisions = int(
                    self.state.tool_state.get("inspector_revisions", 0) or 0
                )
                round_record["output_revision"] = revision
                self.report.update({"status": "success", "latest_revision": revision})
                _atomic_json(self.report_path, self.report)
                self._emit(
                    "inspection.reviewed",
                    revision=revision,
                    round=round_number,
                    decision="success",
                    inspector_revisions=inspector_revisions,
                )
                return ToolResult(output=json.dumps({
                    "status": "success",
                    "revision": revision,
                    "inspection_round": round_number,
                    "inspector_revisions": inspector_revisions,
                    "instruction": "Call submit_page for this exact revision in the next turn.",
                }, ensure_ascii=False))

            # revert and revise both propose a replacement page. Compute the proposal and
            # every reason to discard it linearly, then share one discard exit and one
            # apply block.
            discard_reasons: list[str] = []
            proposed_html = ""
            if decision.decision == "revert":
                target = next(
                    (
                        record
                        for record in reversed(previous_rounds)
                        if record.get("outcome") == "revised"
                    ),
                    None,
                )
                if target is None:
                    discard_reasons.append(
                        "Inspector returned revert but no inspector revision exists to revert"
                    )
                else:
                    target_path = self.state.run_dir / target["html"]
                    proposed_html = clean_fragment(target_path.read_text(encoding="utf-8"))
            elif (
                int(self.state.tool_state.get("inspector_revisions", 0) or 0)
                >= _CONFIG.inspection.maximum_revisions
            ):
                discard_reasons.append(
                    "Inspector revision budget exhausted; the current page was not changed"
                )
            else:
                proposed_html = clean_fragment(decision.html)
            if not discard_reasons:
                if proposed_html == html:
                    discard_reasons.append(
                        f"Inspector returned {decision.decision} without changing the HTML"
                    )
                else:
                    discard_reasons.extend(await page_delivery_failures(
                        PageArtifact(html=proposed_html),
                        page=self.state.page,
                        run_dir=self.state.run_dir,
                        page_plan=self.state.page_plan,
                    ))

            if discard_reasons:
                round_record.update({
                    "outcome": "discarded",
                    "output_revision": revision,
                    "failures": discard_reasons,
                })
                self.report.update({"status": "rejected", "latest_revision": revision})
                _atomic_json(self.report_path, self.report)
                self._emit(
                    "inspection.rejected",
                    revision=revision,
                    round=round_number,
                    failures=discard_reasons,
                )
                return ToolResult(output=json.dumps({
                    "status": "review_discarded",
                    "revision": revision,
                    "inspection_round": round_number,
                    "inspector_revisions": int(
                        self.state.tool_state.get("inspector_revisions", 0) or 0
                    ),
                    "findings": [finding.model_dump() for finding in decision.findings],
                    "discarded_because": discard_reasons,
                    "instruction": (
                        "The isolated review's proposed change was invalid and has been "
                        "discarded. Your current page is unchanged and already passed "
                        "deterministic checks. Apply the findings yourself with edit_page — "
                        "keep any data-notale-component iframe byte-for-byte and do not add "
                        "any outer <script> — then call inspect_page again."
                    ),
                }, ensure_ascii=False))

            async with self.state.lock:
                if self.state.revision != revision:
                    raise RuntimeError(
                        f"page changed during visual review: expected revision {revision}, "
                        f"found {self.state.revision}"
                    )
                inspector_revisions = int(
                    self.state.tool_state.get("inspector_revisions", 0) or 0
                )
                if decision.decision == "revise":
                    if inspector_revisions >= _CONFIG.inspection.maximum_revisions:
                        raise RuntimeError("Inspector revision budget changed during review")
                    inspector_revisions += 1
                    self.state.tool_state["inspector_revisions"] = inspector_revisions
                _atomic_text(self.state.page_path, proposed_html)
                self.state.revision += 1
                output_revision = self.state.revision
                self.state.tool_state.pop("inspected_revision", None)
                self.state.tool_state.pop("inspection_turn", None)
                outcome = "revised" if decision.decision == "revise" else "reverted"
                self.state.tool_state["inspection_status"] = outcome
                self.state.tool_state["inspection_error"] = ""
            round_record.update({
                "outcome": outcome,
                "output_revision": output_revision,
            })
            self.report.update({"status": outcome, "latest_revision": output_revision})
            _atomic_json(self.report_path, self.report)
            self._emit(
                f"inspection.{outcome}",
                revision=revision,
                output_revision=output_revision,
                round=round_number,
                inspector_revisions=inspector_revisions,
            )
            return ToolResult(output=json.dumps({
                "status": outcome,
                "revision": output_revision,
                "inspection_round": round_number,
                "inspector_revisions": inspector_revisions,
                "instruction": "Call inspect_page again for this new revision.",
            }, ensure_ascii=False))
        except Exception as exc:
            reason = f"{type(exc).__name__}: {exc}"
            self.state.tool_state["inspection_error"] = reason
            self.report.update({"status": "failed", "latest_revision": revision})
            if round_record is None:
                round_record = {
                    "round": round_number,
                    "revision": revision,
                    "input_revision": revision,
                }
                self.report["rounds"].append(round_record)
            round_record["error"] = reason
            _atomic_json(self.report_path, self.report)
            self._emit(
                "inspection.failed",
                revision=revision,
                round=round_number,
                error=reason,
            )
            return ToolResult(output=f"inspection failed: {reason}", is_error=True)
        finally:
            self.document_path.unlink(missing_ok=True)


def mark_inspection_submitted(state: Any) -> None:
    """Mark the latest Inspector-accepted render as the submitted revision."""

    path = state.run_dir / "inspections" / f"p{state.page}.json"
    if path.is_file():
        report = json.loads(path.read_text(encoding="utf-8"))
    else:
        report = {"page": state.page, "rounds": []}
    report.update({"status": "submitted", "latest_revision": state.revision})
    _atomic_json(path, report)
    state.tool_state["inspection_status"] = "submitted"
    state.logger.emit(
        "inspection.accepted",
        agent_id=f"builder:p{state.page}",
        page=state.page,
        revision=state.revision,
        rounds=int(state.tool_state.get("inspection_calls", 0)),
        report=str(path.relative_to(state.run_dir)),
    )
