"""Notale's model/tool agent loop.

The message conversion, streaming tool-call assembly, and query-cycle behavior
are a Notale-specific pruning of OpenHarness v0.1.9 (MIT), pinned at commit
``a0f8552c69d0b25d613af288823212a8b6b59a``.  MCP, permissions, hooks,
coordinator state, memory, session continuation, image messages, and automatic
conversation compaction are deliberately absent.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import time
import uuid
from dataclasses import dataclass
from typing import Any, AsyncIterator, Literal
from urllib.parse import urlsplit, urlunsplit

from openai import AsyncOpenAI
from pydantic import BaseModel, Field, PrivateAttr

from notale.core.observability import EventLog
from notale.roles.base import RoleSpec
from notale.tools.base import BaseTool, ToolContext, ToolRegistry
from notale.utils.config import get_config


_CONFIG = get_config()
_MAX_SAFE_COMPLETION_TOKENS = 128_000
_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)
_THINK_OPEN_TAG = "<think>"


class AgentBlocked(RuntimeError):
    pass


@dataclass(frozen=True)
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0

    def __add__(self, other: "Usage") -> "Usage":
        return Usage(
            input_tokens=self.input_tokens + other.input_tokens,
            output_tokens=self.output_tokens + other.output_tokens,
        )


class TextBlock(BaseModel):
    type: Literal["text"] = "text"
    text: str


class ToolUseBlock(BaseModel):
    type: Literal["tool_use"] = "tool_use"
    id: str = Field(default_factory=lambda: f"toolu_{uuid.uuid4().hex}")
    name: str
    input: dict[str, Any] = Field(default_factory=dict)


class ToolResultBlock(BaseModel):
    type: Literal["tool_result"] = "tool_result"
    tool_use_id: str
    content: str
    is_error: bool = False


ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock


class ConversationMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: list[ContentBlock] = Field(default_factory=list)
    _reasoning: str = PrivateAttr(default="")

    @classmethod
    def from_user_text(cls, text: str) -> "ConversationMessage":
        return cls(role="user", content=[TextBlock(text=text)])

    @property
    def text(self) -> str:
        return "".join(
            block.text for block in self.content if isinstance(block, TextBlock)
        )

    @property
    def tool_uses(self) -> list[ToolUseBlock]:
        return [
            block for block in self.content if isinstance(block, ToolUseBlock)
        ]

    def is_effectively_empty(self) -> bool:
        for block in self.content:
            if isinstance(block, TextBlock) and block.text.strip():
                return False
            if isinstance(block, (ToolUseBlock, ToolResultBlock)):
                return False
        return True


@dataclass(frozen=True)
class ModelRequest:
    model: str
    messages: list[ConversationMessage]
    system_prompt: str
    max_tokens: int
    reasoning_effort: str
    tools: list[dict[str, Any]]

    def to_openai_body(self) -> dict[str, Any]:
        body: dict[str, Any] = {
            "model": self.model,
            "messages": _convert_messages_to_openai(
                self.messages, self.system_prompt
            ),
            "stream": True,
        }
        body.update(_token_limit_param(self.model, self.max_tokens))
        body["extra_body"] = {
            "reasoning": {"effort": self.reasoning_effort},
        }
        if self.tools:
            body["tools"] = _convert_tools_to_openai(self.tools)
        else:
            body["stream_options"] = {"include_usage": True}
        return body


@dataclass(frozen=True)
class TextDelta:
    text: str


@dataclass(frozen=True)
class MessageComplete:
    message: ConversationMessage
    usage: Usage = Usage()
    stop_reason: str | None = None


ModelEvent = TextDelta | MessageComplete


def _normalize_openai_base_url(base_url: str | None) -> str | None:
    if not base_url or not base_url.strip():
        return None
    trimmed = base_url.strip()
    parts = urlsplit(trimmed)
    if not parts.scheme or not parts.netloc:
        return trimmed.rstrip("/")
    path = parts.path.rstrip("/") or "/v1"
    return urlunsplit((parts.scheme, parts.netloc, path, parts.query, parts.fragment))


def _token_limit_param(model: str, max_tokens: int) -> dict[str, int]:
    normalized = model.strip().lower().rsplit("/", 1)[-1]
    key = (
        "max_completion_tokens"
        if normalized.startswith(("gpt-5", "o1", "o3", "o4"))
        else "max_tokens"
    )
    return {key: max(1, min(int(max_tokens), _MAX_SAFE_COMPLETION_TOKENS))}


def _convert_tools_to_openai(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool.get("description", ""),
                "parameters": tool.get("input_schema", {}),
            },
        }
        for tool in tools
    ]


def _convert_messages_to_openai(
    messages: list[ConversationMessage],
    system_prompt: str,
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    if system_prompt:
        result.append({"role": "system", "content": system_prompt})
    for message in messages:
        if message.role == "assistant":
            text = "".join(
                block.text
                for block in message.content
                if isinstance(block, TextBlock)
            )
            tool_uses = message.tool_uses
            item: dict[str, Any] = {
                "role": "assistant",
                "content": text or None,
            }
            if message._reasoning:
                item["reasoning_content"] = message._reasoning
            elif tool_uses:
                item["reasoning_content"] = ""
            if tool_uses:
                item["tool_calls"] = [
                    {
                        "id": call.id,
                        "type": "function",
                        "function": {
                            "name": call.name,
                            "arguments": json.dumps(call.input),
                        },
                    }
                    for call in tool_uses
                ]
            result.append(item)
            continue

        tool_results = [
            block
            for block in message.content
            if isinstance(block, ToolResultBlock)
        ]
        user_text = "".join(
            block.text for block in message.content if isinstance(block, TextBlock)
        )
        for block in tool_results:
            result.append(
                {
                    "role": "tool",
                    "tool_call_id": block.tool_use_id,
                    "content": block.content,
                }
            )
        if user_text.strip():
            result.append({"role": "user", "content": user_text})
        elif not tool_results:
            result.append({"role": "user", "content": ""})
    return result


def _strip_think_blocks(buffer: str) -> tuple[str, str]:
    cleaned = _THINK_RE.sub("", buffer)
    open_index = cleaned.find(_THINK_OPEN_TAG)
    if open_index != -1:
        return cleaned[:open_index], cleaned[open_index:]
    max_prefix = min(len(cleaned), len(_THINK_OPEN_TAG) - 1)
    for size in range(max_prefix, 0, -1):
        if _THINK_OPEN_TAG.startswith(cleaned[-size:]):
            return cleaned[:-size], cleaned[-size:]
    return cleaned, ""


class OpenAICompatibleClient:
    """Small streaming transport for the OpenAI-compatible Chat API."""

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str,
        timeout: float,
        model: str,
    ) -> None:
        self.model = model
        self._client = AsyncOpenAI(
            api_key=api_key,
            base_url=_normalize_openai_base_url(base_url),
            timeout=timeout,
            max_retries=3,
        )

    async def close(self) -> None:
        await self._client.close()

    async def stream_message(
        self, request: ModelRequest
    ) -> AsyncIterator[ModelEvent]:
        stream = await self._client.chat.completions.create(
            **request.to_openai_body()
        )
        content = ""
        reasoning = ""
        tool_calls: dict[int, dict[str, str]] = {}
        finish_reason: str | None = None
        usage = Usage()
        think_buffer = ""

        async for chunk in stream:
            if chunk.usage:
                usage = Usage(
                    input_tokens=int(chunk.usage.prompt_tokens or 0),
                    output_tokens=int(chunk.usage.completion_tokens or 0),
                )
            if not chunk.choices:
                continue
            choice = chunk.choices[0]
            if choice.finish_reason:
                finish_reason = choice.finish_reason
            delta = choice.delta
            reasoning_piece = getattr(delta, "reasoning_content", None) or ""
            reasoning += reasoning_piece
            if delta.content:
                think_buffer += delta.content
                visible, think_buffer = _strip_think_blocks(think_buffer)
                if visible:
                    content += visible
                    yield TextDelta(visible)
            if delta.tool_calls:
                for part in delta.tool_calls:
                    item = tool_calls.setdefault(
                        part.index,
                        {"id": "", "name": "", "arguments": ""},
                    )
                    if part.id:
                        item["id"] = part.id
                    if part.function:
                        if part.function.name:
                            item["name"] = part.function.name
                        if part.function.arguments:
                            item["arguments"] += part.function.arguments

        blocks: list[ContentBlock] = []
        if content:
            blocks.append(TextBlock(text=content))
        for index in sorted(tool_calls):
            call = tool_calls[index]
            if not call["name"]:
                continue
            try:
                arguments = json.loads(call["arguments"])
            except (json.JSONDecodeError, TypeError):
                arguments = {}
            blocks.append(
                ToolUseBlock(
                    id=call["id"] or f"toolu_{uuid.uuid4().hex}",
                    name=call["name"],
                    input=arguments,
                )
            )
        message = ConversationMessage(role="assistant", content=blocks)
        message._reasoning = reasoning
        yield MessageComplete(message, usage, finish_reason)


def _client(llm: Any) -> tuple[Any, str, bool]:
    if llm is not None and hasattr(llm, "stream_message"):
        return llm, getattr(llm, "model", _CONFIG.model.name), False
    inner = getattr(llm, "inner", llm) if llm is not None else None
    base_url = getattr(inner, "base_url", _CONFIG.model.base_url)
    model = getattr(inner, "model", _CONFIG.model.name)
    api_key_env = getattr(inner, "api_key_env", _CONFIG.model.api_key_env)
    api_key = (os.environ.get(api_key_env) or "").strip()
    if not api_key:
        raise RuntimeError(f"missing API key: set {api_key_env}")
    timeout = float(getattr(inner, "timeout", _CONFIG.model.http_timeout_sec))
    return (
        OpenAICompatibleClient(
            api_key,
            base_url=base_url,
            timeout=timeout,
            model=model,
        ),
        model,
        True,
    )


class AgentLoop:
    """One autonomous Planner or Builder loop ending at a terminal tool."""

    def __init__(
        self,
        *,
        role: RoleSpec,
        state: Any,
        tools: list[BaseTool],
        terminal_tool: str,
        llm: Any,
        logger: EventLog,
        agent_id: str,
        page: int | None = None,
        skill_text: str = "",
        purpose: str = "",
        auto_terminal: bool = False,
    ) -> None:
        self.role = role
        self.state = state
        self.tools = tools
        self.terminal_tool = terminal_tool
        self.logger = logger
        self.agent_id = agent_id
        self.page = page
        self.auto_terminal = auto_terminal
        self.registry = ToolRegistry()
        for tool in tools:
            if tool.name not in role.allowed_tools:
                raise ValueError(
                    f"role {role.name} does not authorize tool {tool.name}"
                )
            self.registry.register(tool)
        if self.registry.get(terminal_tool) is None:
            raise ValueError(f"terminal tool is not registered: {terminal_tool}")

        factory = getattr(llm, "for_agent", None)
        if callable(factory):
            llm = factory(
                state=state,
                purpose=purpose or role.name,
                terminal_tool=terminal_tool,
            )
        self.client, self.model, self._owns_client = _client(llm)
        self.system_prompt = role.rendered_system_prompt()
        if skill_text:
            self.system_prompt += "\n\n# Assigned Skills\n\n" + skill_text
        self.total_usage = Usage()

    def _request_snapshot(
        self,
        *,
        turn: int,
        call_id: str,
        body: dict[str, Any],
    ) -> dict[str, Any]:
        started = time.monotonic()
        safe_agent = re.sub(r"[^A-Za-z0-9_.-]+", "-", self.agent_id).strip("-")
        directory = self.logger.run_dir / "llm-requests" / (safe_agent or "agent")
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"turn-{turn:04d}.json"
        payload = {
            "call_id": call_id,
            "agent_id": self.agent_id,
            "page": self.page,
            "turn": turn,
            "request": body,
        }
        text = json.dumps(payload, ensure_ascii=False, indent=2, default=str)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(path)
        data = text.encode("utf-8")
        return {
            "request_path": str(path.relative_to(self.logger.run_dir)),
            "request_sha256": hashlib.sha256(data).hexdigest(),
            "request_bytes": len(data),
            "request_write_ms": round((time.monotonic() - started) * 1000),
        }

    async def _model_turn(
        self,
        messages: list[ConversationMessage],
        turn: int,
    ) -> MessageComplete:
        request = ModelRequest(
            model=self.model,
            messages=list(messages),
            system_prompt=self.system_prompt,
            max_tokens=_CONFIG.model.max_output_tokens,
            reasoning_effort=_CONFIG.model.reasoning_effort,
            tools=self.registry.to_api_schema(),
        )
        body = request.to_openai_body()
        call_id = uuid.uuid4().hex
        snapshot = self._request_snapshot(
            turn=turn,
            call_id=call_id,
            body=body,
        )
        started = time.monotonic()
        first_ms: int | None = None
        self.logger.emit(
            "llm.call.started",
            agent_id=self.agent_id,
            page=self.page,
            call_id=call_id,
            model=self.model,
            message_count=len(body["messages"]),
            tool_count=len(body.get("tools", [])),
            max_output_tokens=_CONFIG.model.max_output_tokens,
            reasoning_effort=_CONFIG.model.reasoning_effort,
            **snapshot,
        )
        complete: MessageComplete | None = None
        try:
            async for event in self.client.stream_message(request):
                if first_ms is None:
                    first_ms = round((time.monotonic() - started) * 1000)
                if isinstance(event, MessageComplete):
                    complete = event
        except BaseException as exc:
            self.logger.emit(
                "llm.call.failed",
                agent_id=self.agent_id,
                page=self.page,
                call_id=call_id,
                duration_ms=round((time.monotonic() - started) * 1000),
                error=f"{type(exc).__name__}: {exc}",
                first_event_ms=first_ms,
            )
            raise
        self.logger.emit(
            "llm.call.completed",
            agent_id=self.agent_id,
            page=self.page,
            call_id=call_id,
            duration_ms=round((time.monotonic() - started) * 1000),
            first_event_ms=first_ms,
        )
        if complete is None:
            raise RuntimeError("model stream finished without a final message")
        return complete

    async def _execute_tool(self, call: ToolUseBlock, turn: int) -> ToolResultBlock:
        tool = self.registry.get(call.name)
        if tool is None:
            return ToolResultBlock(
                tool_use_id=call.id,
                content=f"Unknown tool: {call.name}",
                is_error=True,
            )
        try:
            arguments = tool.input_model.model_validate(call.input)
        except Exception as exc:
            return ToolResultBlock(
                tool_use_id=call.id,
                content=f"Invalid input for {call.name}: {exc}",
                is_error=True,
            )
        result = await tool.execute(
            arguments,
            ToolContext(
                cwd=self.state.workspace,
                metadata={
                    "role": self.role.name,
                    "agent_id": self.agent_id,
                    "page": self.page,
                    "turn": turn,
                },
            ),
        )
        return ToolResultBlock(
            tool_use_id=call.id,
            content=result.output,
            is_error=result.is_error,
        )

    async def _execute_calls(
        self, calls: list[ToolUseBlock], turn: int
    ) -> list[ToolResultBlock]:
        for call in calls:
            self.logger.emit(
                "tool.started",
                agent_id=self.agent_id,
                page=self.page,
                tool=call.name,
                arguments=call.input,
            )
        serial = any(call.name in {"style", "plan"} for call in calls)
        if len(calls) == 1 or serial:
            results = []
            for call in calls:
                try:
                    results.append(await self._execute_tool(call, turn))
                except BaseException as exc:
                    results.append(
                        ToolResultBlock(
                            tool_use_id=call.id,
                            content=(
                                f"Tool {call.name} failed: "
                                f"{type(exc).__name__}: {exc}"
                            ),
                            is_error=True,
                        )
                    )
        else:
            raw = await asyncio.gather(
                *(self._execute_tool(call, turn) for call in calls),
                return_exceptions=True,
            )
            results = []
            for call, item in zip(calls, raw):
                if isinstance(item, BaseException):
                    item = ToolResultBlock(
                        tool_use_id=call.id,
                        content=(
                            f"Tool {call.name} failed: "
                            f"{type(item).__name__}: {item}"
                        ),
                        is_error=True,
                    )
                results.append(item)
        for call, result in zip(calls, results):
            self.logger.emit(
                "tool.completed",
                agent_id=self.agent_id,
                page=self.page,
                tool=call.name,
                arguments=call.input,
                output=result.content,
                is_error=result.is_error,
            )
        return results

    async def _run_loop(self, task: str) -> None:
        messages = [ConversationMessage.from_user_text(task)]
        turn_started = time.monotonic()
        for turn in range(1, self.role.settings.max_turns + 1):
            complete = await self._model_turn(messages, turn)
            self.total_usage = self.total_usage + complete.usage
            message = complete.message
            messages.append(message)
            self.logger.emit(
                "agent.turn",
                agent_id=self.agent_id,
                page=self.page,
                duration_ms=round((time.monotonic() - turn_started) * 1000),
                message=message.model_dump(mode="json"),
                input_tokens=complete.usage.input_tokens,
                output_tokens=complete.usage.output_tokens,
            )
            turn_started = time.monotonic()
            if message.is_effectively_empty():
                self.logger.emit(
                    "agent.error",
                    agent_id=self.agent_id,
                    page=self.page,
                    error="model returned an empty assistant message",
                )
                return
            calls = message.tool_uses
            if not calls:
                return
            results = await self._execute_calls(calls, turn)
            if getattr(self.state, "submission", None) is not None or getattr(
                self.state, "blocked", ""
            ):
                return
            messages.append(ConversationMessage(role="user", content=results))
        raise RuntimeError(f"{self.agent_id} exceeded max turns")

    async def _auto_submit(self) -> Any:
        terminal = self.registry.get(self.terminal_tool)
        if terminal is None:
            return None
        required = [
            name
            for name, field in terminal.input_model.model_fields.items()
            if field.is_required()
        ]
        if required:
            return None
        arguments = terminal.input_model()
        self.logger.emit(
            "tool.started",
            agent_id=self.agent_id,
            page=self.page,
            tool=self.terminal_tool,
            arguments={},
            source="natural_end",
        )
        result = await terminal.execute(
            arguments,
            ToolContext(
                cwd=self.state.workspace,
                metadata={
                    "role": self.role.name,
                    "agent_id": self.agent_id,
                    "page": self.page,
                },
            ),
        )
        self.logger.emit(
            "tool.completed",
            agent_id=self.agent_id,
            page=self.page,
            tool=self.terminal_tool,
            arguments={},
            output=result.output,
            is_error=result.is_error,
            source="natural_end",
        )
        return getattr(self.state, "submission", None)

    async def run(self, task: str) -> Any:
        prepare = getattr(self.client, "prepare", None)
        if callable(prepare):
            prepare(task)
        self.logger.emit(
            "agent.started",
            agent_id=self.agent_id,
            page=self.page,
            raw=True,
            role=self.role.name,
            model=self.model,
            system_prompt=self.system_prompt,
            task=task,
            tools=self.registry.to_api_schema(),
        )
        try:
            async with asyncio.timeout(self.role.settings.max_duration_sec):
                await self._run_loop(task)
        except TimeoutError as exc:
            error = f"{self.agent_id} exceeded max duration"
            self.logger.emit(
                "agent.failed",
                agent_id=self.agent_id,
                page=self.page,
                error=error,
                input_tokens=self.total_usage.input_tokens,
                output_tokens=self.total_usage.output_tokens,
            )
            raise RuntimeError(error) from exc
        except BaseException as exc:
            self.logger.emit(
                "agent.failed",
                agent_id=self.agent_id,
                page=self.page,
                error=f"{type(exc).__name__}: {exc}",
                input_tokens=self.total_usage.input_tokens,
                output_tokens=self.total_usage.output_tokens,
            )
            raise
        finally:
            if self._owns_client:
                await self.client.close()

        if getattr(self.state, "blocked", ""):
            self.logger.emit(
                "agent.blocked",
                agent_id=self.agent_id,
                page=self.page,
                reason=str(self.state.blocked),
                input_tokens=self.total_usage.input_tokens,
                output_tokens=self.total_usage.output_tokens,
            )
            raise AgentBlocked(str(self.state.blocked))
        submission = getattr(self.state, "submission", None)
        if submission is None and self.auto_terminal:
            submission = await self._auto_submit()
        if submission is None:
            error = f"{self.agent_id} ended without calling {self.terminal_tool}"
            self.logger.emit(
                "agent.failed",
                agent_id=self.agent_id,
                page=self.page,
                error=error,
                input_tokens=self.total_usage.input_tokens,
                output_tokens=self.total_usage.output_tokens,
            )
            raise RuntimeError(error)
        self.logger.emit(
            "agent.completed",
            agent_id=self.agent_id,
            page=self.page,
            input_tokens=self.total_usage.input_tokens,
            output_tokens=self.total_usage.output_tokens,
        )
        return submission
