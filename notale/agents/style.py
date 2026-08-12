"""One-shot structured generation of a run-local design Style."""

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
    MessageComplete,
    ModelRequest,
    resolve_client,
)
from notale.core.models import StyleOutput
from notale.core.observability import EventLog
from notale.utils.config import SKILLS_PATH, get_config
from notale.utils.skill_catalog import (
    GeneratedDesignSkill,
    create_generated_style,
    write_generated_style,
)


_CONFIG = get_config()


def _provider_style_schema() -> dict[str, Any]:
    """Project Pydantic's schema onto Anthropic's supported JSON Schema subset.

    Array cardinality remains enforced by Pydantic and the semantic validator after
    generation; Anthropic currently rejects minItems values greater than one.
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


async def generate_run_style(
    llm: Any,
    topic: str,
    *,
    run_dir: Path,
    logger: EventLog,
    skill_text: str,
) -> GeneratedDesignSkill:
    """Generate, validate, and persist exactly one logical Style response."""

    factory = getattr(llm, "for_agent", None)
    if callable(factory):
        llm = factory(state=None, purpose="style", terminal_tool="")
    client, model, owns_client = resolve_client(llm)
    request = ModelRequest(
        model=model,
        messages=[ConversationMessage.from_user_text(
            "Create the run-local design Style for this lecture request:\n\n" + topic
        )],
        system_prompt=skill_text,
        max_tokens=_CONFIG.model.max_output_tokens,
        reasoning_effort=_CONFIG.model.reasoning_effort,
        tools=[],
        response_schema=_provider_style_schema(),
        require_parameters=True,
    )
    body = request.to_openai_body()
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
        system_prompt=skill_text,
        task=topic,
        tools=[],
    )
    logger.emit(
        "llm.call.started",
        agent_id="style",
        call_id=call_id,
        model=model,
        message_count=len(body["messages"]),
        tool_count=0,
        max_output_tokens=_CONFIG.model.max_output_tokens,
        reasoning_effort=_CONFIG.model.reasoning_effort,
        **snapshot,
    )
    started = time.monotonic()
    complete: MessageComplete | None = None
    first_ms: int | None = None
    try:
        async with asyncio.timeout(_CONFIG.agents.planner.max_duration_sec):
            async for event in client.stream_message(request):
                if first_ms is None:
                    first_ms = round((time.monotonic() - started) * 1000)
                if isinstance(event, MessageComplete):
                    complete = event
    except BaseException as exc:
        logger.emit(
            "llm.call.failed",
            agent_id="style",
            call_id=call_id,
            duration_ms=round((time.monotonic() - started) * 1000),
            first_event_ms=first_ms,
            error=f"{type(exc).__name__}: {exc}",
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
    )
    if complete is None:
        raise RuntimeError("Style model stream finished without a final message")

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
        arguments = output.generated_style_arguments()
        name = str(arguments["name"])
        if (SKILLS_PATH / name).exists():
            raise ValueError(f"generated style name collides with a packaged Skill: {name}")
        style = create_generated_style(**arguments)
        write_generated_style(run_dir / "skills", style)
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
        "style.created",
        agent_id="style",
        name=style.name,
        sha256=style.sha256,
        description=style.description,
        body_chars=len(style.body),
        token_keys=sorted(style.tokens),
        compositions=[item.id for item in style.compositions],
        duration_ms=duration_ms,
    )
    logger.emit(
        "style.completed",
        agent_id="style",
        duration_ms=duration_ms,
        name=style.name,
        sha256=style.sha256,
        input_tokens=complete.usage.input_tokens,
        output_tokens=complete.usage.output_tokens,
    )
    logger.emit(
        "agent.completed",
        agent_id="style",
        input_tokens=complete.usage.input_tokens,
        output_tokens=complete.usage.output_tokens,
    )
    return style
