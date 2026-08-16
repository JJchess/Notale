"""Shared no-tool model-call transport for generated Builder tools."""

from __future__ import annotations

import asyncio
import hashlib
import json
import re
import time
import uuid
from pathlib import Path
from typing import Any

from notale.agents.loop import (
    ConversationMessage,
    ModelRequest,
    Usage,
    complete_model_request,
    model_request_body,
    request_message_count,
    resolve_client,
)
from notale.core.observability import EventLog
from notale.utils.config import get_config


_CONFIG = get_config()


def _atomic_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(value, encoding="utf-8")
    temporary.replace(path)


def _provider_schema(model: type[Any]) -> dict[str, Any]:
    schema = model.model_json_schema()

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


async def component_model_call(
    llm: Any,
    *,
    state: Any,
    logger: EventLog,
    run_dir: Path,
    page: int,
    kind: str,
    stage: str,
    turn: int,
    system_prompt: str,
    user_prompt: str,
    response_model: type[Any] | None = None,
) -> tuple[str, Usage]:
    """Run one isolated component-model request with no callable tools."""

    purpose = f"component:p{page}:{kind}-{stage}"
    candidate = llm
    factory = getattr(candidate, "for_agent", None)
    if callable(factory):
        candidate = factory(state=state, purpose=purpose, terminal_tool="")
    prepare = getattr(candidate, "prepare", None)
    if callable(prepare):
        prepare(user_prompt)
    client, model, owns_client = resolve_client(candidate)
    agent_id = f"component:p{page}:{kind}"
    request = ModelRequest(
        model=model,
        messages=[ConversationMessage.from_user_text(user_prompt)],
        system_prompt=system_prompt,
        max_tokens=_CONFIG.components.max_output_tokens,
        reasoning_effort=_CONFIG.model.reasoning_effort,
        tools=[],
        response_schema=_provider_schema(response_model) if response_model is not None else None,
        response_schema_name=f"notale_{kind.replace('-', '_')}_{stage.replace('-', '_')}",
        require_parameters=response_model is not None,
    )
    body = model_request_body(client, request)
    call_id = uuid.uuid4().hex
    safe_agent = re.sub(r"[^A-Za-z0-9_.-]+", "-", agent_id).strip("-")
    request_path = run_dir / "llm-requests" / safe_agent / f"turn-{turn:04d}.json"
    request_payload = {
        "call_id": call_id,
        "agent_id": agent_id,
        "page": page,
        "turn": turn,
        "stage": stage,
        "request": body,
    }
    request_text = json.dumps(request_payload, ensure_ascii=False, indent=2, default=str)
    _atomic_text(request_path, request_text)
    logger.emit(
        "llm.call.started",
        agent_id=agent_id,
        page=page,
        call_id=call_id,
        model=model,
        component_kind=kind,
        component_stage=stage,
        message_count=request_message_count(body),
        tool_count=0,
        max_output_tokens=_CONFIG.components.max_output_tokens,
        reasoning_effort=_CONFIG.model.reasoning_effort,
        request_path=str(request_path.relative_to(run_dir)),
        request_sha256=hashlib.sha256(request_text.encode()).hexdigest(),
        request_bytes=len(request_text.encode()),
    )
    started = time.monotonic()
    first_ms: int | None = None
    retry_meta: dict[str, Any] = {}
    try:
        async with asyncio.timeout(_CONFIG.agents.builder.max_duration_sec):
            complete, first_ms, retry_meta = await complete_model_request(
                client,
                request,
                on_retry=lambda attempt, error_class, delay: logger.emit(
                    "llm.call.retrying",
                    agent_id=agent_id,
                    page=page,
                    call_id=call_id,
                    attempt=attempt,
                    next_attempt=attempt + 1,
                    error_class=error_class,
                    delay_sec=round(delay, 3),
                    component_kind=kind,
                    component_stage=stage,
                ),
            )
    except BaseException as exc:
        logger.emit(
            "llm.call.failed",
            agent_id=agent_id,
            page=page,
            call_id=call_id,
            duration_ms=round((time.monotonic() - started) * 1000),
            component_kind=kind,
            component_stage=stage,
            error=f"{type(exc).__name__}: {exc}",
            attempts=int(getattr(exc, "attempts", 1)),
            error_class=str(getattr(exc, "error_class", "") or ""),
        )
        raise
    finally:
        if owns_client:
            await client.close()
    duration_ms = round((time.monotonic() - started) * 1000)
    response_path = run_dir / "llm-responses" / safe_agent / f"turn-{turn:04d}.txt"
    _atomic_text(response_path, complete.message.text)
    logger.emit(
        "llm.call.completed",
        agent_id=agent_id,
        page=page,
        call_id=call_id,
        duration_ms=duration_ms,
        first_event_ms=first_ms,
        attempts=int(retry_meta.get("attempts", 1)),
        component_kind=kind,
        component_stage=stage,
        response_path=str(response_path.relative_to(run_dir)),
    )
    logger.emit(
        "agent.turn",
        agent_id=agent_id,
        page=page,
        duration_ms=duration_ms,
        component_kind=kind,
        component_stage=stage,
        input_tokens=complete.usage.input_tokens,
        output_tokens=complete.usage.output_tokens,
    )
    return complete.message.text, complete.usage
