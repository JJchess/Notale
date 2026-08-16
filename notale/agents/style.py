"""One-shot structured generation of a run-local design Style.

This is the only place the style system calls a model. It produces a validated
``StyleOutput`` and nothing else: turning that into a StylePack, backfilling
whatever the model left thin, and persisting it belong to
``style_studio.build.from_topic``. Keeping generation and persistence apart is
what lets a weak field fall back to the parent pack instead of failing the run.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
import uuid
from pathlib import Path
from typing import Any

from notale.agents.loop import (
    ConversationMessage,
    ModelRequest,
    complete_model_request,
    model_request_body,
    request_message_count,
    resolve_client,
)
from notale.core.models import StyleOutput
from notale.core.observability import EventLog
from notale.utils.config import SKILLS_PATH, get_config
from notale.web.font_catalog import font_catalog_prompt


_CONFIG = get_config()


def _provider_style_schema() -> dict[str, Any]:
    """Project Pydantic's schema onto Anthropic's supported JSON Schema subset.

    Anthropic currently rejects array-cardinality keywords in this schema. Composition count is a
    design judgment rather than an output acceptance target, so remove those keywords and retain
    only structural item validation.
    """

    schema = StyleOutput.model_json_schema()

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


def _atomic_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(value, encoding="utf-8")
    temporary.replace(path)


def _snapshot_request(
    run_dir: Path, call_id: str, body: dict[str, Any]
) -> dict[str, Any]:
    path = run_dir / "llm-requests" / "style" / "turn-0001.json"
    payload = {
        "call_id": call_id,
        "agent_id": "style",
        "turn": 1,
        "request": body,
    }
    text = json.dumps(payload, ensure_ascii=False, indent=2, default=str)
    _atomic_text(path, text)
    raw = text.encode("utf-8")
    return {
        "request_path": str(path.relative_to(run_dir)),
        "request_sha256": hashlib.sha256(raw).hexdigest(),
        "request_bytes": len(raw),
    }


async def generate_style_output(
    llm: Any,
    topic: str,
    *,
    run_dir: Path,
    logger: EventLog,
    skill_text: str,
) -> StyleOutput:
    """Issue exactly one structured Style call and return the validated output."""

    factory = getattr(llm, "for_agent", None)
    if callable(factory):
        llm = factory(state=None, purpose="style", terminal_tool="")
    client, model, owns_client = resolve_client(llm)
    style_prompt = (
        skill_text.rstrip()
        + "\n\n## Installed offline font catalog\n\n"
        + font_catalog_prompt()
    )
    request = ModelRequest(
        model=model,
        messages=[ConversationMessage.from_user_text(
            "Create the run-local design Style for this lecture request:\n\n" + topic
        )],
        system_prompt=style_prompt,
        max_tokens=_CONFIG.model.max_output_tokens,
        reasoning_effort=_CONFIG.model.reasoning_effort,
        tools=[],
        response_schema=_provider_style_schema(),
        response_schema_name="notale_style",
        require_parameters=True,
    )
    body = model_request_body(client, request)
    call_id = uuid.uuid4().hex
    snapshot = _snapshot_request(run_dir, call_id, body)
    logger.emit(
        "style.started",
        agent_id="style",
        model=model,
        request_bytes=snapshot["request_bytes"],
    )
    logger.emit(
        "agent.started",
        agent_id="style",
        raw=True,
        role="style",
        model=model,
        system_prompt=style_prompt,
        task=topic,
        tools=[],
    )
    logger.emit(
        "llm.call.started",
        agent_id="style",
        call_id=call_id,
        model=model,
        message_count=request_message_count(body),
        tool_count=0,
        max_output_tokens=_CONFIG.model.max_output_tokens,
        reasoning_effort=_CONFIG.model.reasoning_effort,
        **snapshot,
    )
    started = time.monotonic()
    retry_meta: dict[str, Any] = {}
    first_ms: int | None = None
    try:
        async with asyncio.timeout(_CONFIG.agents.planner.max_duration_sec):
            complete, first_ms, retry_meta = await complete_model_request(
                client,
                request,
                on_retry=lambda attempt, error_class, delay: logger.emit(
                    "llm.call.retrying",
                    agent_id="style",
                    call_id=call_id,
                    attempt=attempt,
                    next_attempt=attempt + 1,
                    error_class=error_class,
                    delay_sec=round(delay, 3),
                ),
            )
    except BaseException as exc:
        logger.emit(
            "llm.call.failed",
            agent_id="style",
            call_id=call_id,
            duration_ms=round((time.monotonic() - started) * 1000),
            first_event_ms=first_ms,
            error=f"{type(exc).__name__}: {exc}",
            attempts=int(getattr(exc, "attempts", 1)),
            error_class=str(getattr(exc, "error_class", "") or ""),
        )
        logger.emit("style.failed", agent_id="style", error=f"{type(exc).__name__}: {exc}")
        raise
    finally:
        if owns_client:
            await client.close()

    duration_ms = round((time.monotonic() - started) * 1000)
    logger.emit(
        "llm.call.completed",
        agent_id="style",
        call_id=call_id,
        duration_ms=duration_ms,
        first_event_ms=first_ms,
        attempts=int(retry_meta.get("attempts", 1)),
    )

    raw_text = complete.message.text
    response_path = run_dir / "llm-responses" / "style" / "turn-0001.json"
    _atomic_text(response_path, raw_text)
    logger.emit(
        "agent.turn",
        agent_id="style",
        duration_ms=duration_ms,
        message=complete.message.model_dump(mode="json"),
        input_tokens=complete.usage.input_tokens,
        output_tokens=complete.usage.output_tokens,
    )
    try:
        output = StyleOutput.model_validate_json(raw_text)
        if (SKILLS_PATH / output.name).exists():
            raise ValueError(
                f"generated style name collides with a packaged Skill: {output.name}"
            )
    except BaseException as exc:
        logger.emit(
            "style.failed",
            agent_id="style",
            error=f"{type(exc).__name__}: {exc}",
            response_path=str(response_path.relative_to(run_dir)),
        )
        logger.emit(
            "agent.failed",
            agent_id="style",
            error=f"{type(exc).__name__}: {exc}",
            input_tokens=complete.usage.input_tokens,
            output_tokens=complete.usage.output_tokens,
        )
        raise

    logger.emit(
        "style.generated",
        agent_id="style",
        name=output.name,
        description=output.description,
        body_chars=len(output.body),
        token_keys=sorted(output.tokens.model_dump(by_alias=True)),
        compositions=[item.id for item in output.compositions],
        duration_ms=duration_ms,
    )
    logger.emit(
        "agent.completed",
        agent_id="style",
        input_tokens=complete.usage.input_tokens,
        output_tokens=complete.usage.output_tokens,
    )
    return output
