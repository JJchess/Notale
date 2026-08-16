"""Offline streaming fixtures for Notale's local agent loop."""

from __future__ import annotations

import asyncio
import base64
import json
import socket
from collections import deque
from contextlib import contextmanager
from typing import Any, AsyncIterator, TypedDict

from notale.agents.loop import (
    ConversationMessage,
    MessageComplete,
    ModelEvent,
    ModelRequest,
    TextBlock,
    TextDelta,
    ToolUseBlock,
    Usage,
)
from notale.utils.parsing import extract_json


class Message(TypedDict):
    role: str
    content: str


class FakeClient:
    def __init__(
        self,
        queue: list[str] | None = None,
        by_purpose: dict[str, str] | None = None,
        default: str = "{}",
        delay: float = 0,
    ) -> None:
        self._queue = deque(queue or [])
        self._by_purpose = by_purpose or {}
        self._default = default
        self.delay = delay
        self.calls: list[tuple[str, list[Message]]] = []
        self.active = 0
        self.peak_active = 0

    async def complete(self, messages: list[Message], *, purpose: str) -> str:
        self.calls.append((purpose, messages))
        if purpose in self._by_purpose:
            return self._by_purpose[purpose]
        if self._queue:
            return self._queue.popleft()
        return self._default

    def for_agent(self, *, state: Any, purpose: str, terminal_tool: str):
        return _FixtureAdapter(self, state, purpose, terminal_tool)

    async def render_inspection_page(self, *, document_path: Any, page: int):
        del document_path, page
        return {
            "screenshot": base64.b64decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAE/wJ/l4Z7WQAAAABJRU5ErkJggg=="
            ),
        }


class _FixtureAdapter:
    def __init__(
        self,
        inner: FakeClient,
        state: Any,
        purpose: str,
        terminal_tool: str,
    ) -> None:
        self.inner = inner
        self.state = state
        self.purpose = purpose
        self.terminal_tool = terminal_tool
        self.prompts: list[str] = []
        self.fixture: dict[str, Any] | None = None

    def prepare(self, prompt: str) -> None:
        self.prompts.append(prompt)

    async def _load(self) -> dict[str, Any]:
        if self.fixture is None:
            raw = await self.inner.complete(
                [{"role": "user", "content": "\n".join(self.prompts)}],
                purpose=self.purpose,
            )
            self.fixture = dict(extract_json(raw))
        return self.fixture

    async def stream_message(
        self, request: ModelRequest
    ) -> AsyncIterator[ModelEvent]:
        self.inner.active += 1
        self.inner.peak_active = max(self.inner.peak_active, self.inner.active)
        try:
            if self.inner.delay:
                await asyncio.sleep(self.inner.delay)
            if self.purpose.startswith(("component:", "inspection:")):
                messages = [
                    {"role": item.get("role", ""), "content": str(item.get("content") or "")}
                    for item in request.to_openai_body()["messages"]
                ]
                raw = await self.inner.complete(messages, purpose=self.purpose)
                if self.purpose.startswith("inspection:") and raw.strip() == "{}":
                    raw = json.dumps({"decision": "success", "findings": [], "html": ""})
                message = text_msg(raw)
            else:
                fixture = await self._load()
                if self.purpose == "style":
                    payload = fixture if fixture.get("name") else _default_style()
                    message = text_msg(json.dumps(payload, ensure_ascii=False))
                elif self.terminal_tool == "plan":
                    payload = (
                        {key: value for key, value in fixture.items() if key != "style"}
                        if "chapter_pages" in fixture
                        else _final_plan_to_root(fixture)
                    )
                    message = tool_call_msg("plan", payload)
                elif self.terminal_tool == "pages":
                    message = tool_call_msg("pages", fixture)
                elif self.terminal_tool == "submit_page":
                    if fixture.get("block"):
                        message = tool_call_msg("block", {"reason": fixture["block"]})
                    elif self.state.tool_state.get("inspection_error"):
                        message = tool_call_msg(
                            "block",
                            {"reason": str(self.state.tool_state["inspection_error"])},
                        )
                    elif self.state.revision == 0:
                        message = tool_call_msg(
                            "edit_page",
                            {"mode": "replace", "revision": 0, "html": fixture["html"]},
                        )
                    elif self.state.tool_state.get("inspected_revision") != self.state.revision:
                        message = tool_call_msg(
                            "inspect_page",
                            {"revision": self.state.revision},
                        )
                    else:
                        message = tool_call_msg(
                            "submit_page",
                            {
                                "revision": self.state.revision,
                                "notes": fixture.get("notes", ""),
                            },
                        )
                else:
                    raise AssertionError(f"unknown terminal tool: {self.terminal_tool}")
            yield MessageComplete(
                message=message,
                usage=Usage(input_tokens=10, output_tokens=5),
                stop_reason="tool_calls",
            )
        finally:
            self.inner.active -= 1


def _final_plan_to_root(fixture: dict[str, Any]) -> dict[str, Any]:
    """Translate concise final-plan fixtures into the current Planner wire format."""

    final_chapters = list(fixture["chapters"])
    final_pages = list(fixture["pages"])
    ids = [str(chapter.get("id") or f"c{index}") for index, chapter in enumerate(final_chapters, 1)]
    ranges: list[tuple[dict[str, Any], int, int]] = []
    cursor = 1
    for chapter in final_chapters:
        end = cursor + int(chapter["pages"]) - 1
        ranges.append((chapter, cursor, end))
        cursor = end + 1

    def target_chapter(number: int) -> tuple[str, str]:
        for chapter_id, (_, start, end) in zip(ids, ranges):
            if start <= number <= end:
                anchor = "entry" if number == start else "exit"
                return chapter_id, anchor
        raise ValueError(f"fixture link target is outside chapters: {number}")

    chapters: list[dict[str, Any]] = []
    chapter_pages: list[dict[str, Any]] = []
    for chapter_id, (chapter, start, end) in zip(ids, ranges):
        chapters.append(
            {
                "id": chapter_id,
                "title": chapter["title"],
                "goal": chapter["goal"],
                "entry": chapter.get("entry") or chapter["goal"],
                "payoff": chapter.get("payoff") or chapter["goal"],
                "pages": end - start + 1,
            }
        )
        drafted: list[dict[str, Any]] = []
        for page in final_pages[start - 1 : end]:
            item = {key: value for key, value in page.items() if key != "links"}
            item["links"] = [
                {
                    "chapter": target_chapter(int(link["target"]))[0],
                    "anchor": target_chapter(int(link["target"]))[1],
                    "relation": link["relation"],
                    "cue": link["cue"],
                }
                for link in page.get("links", [])
            ]
            drafted.append(item)
        chapter_pages.append({"id": chapter_id, "pages": drafted})

    return {
        "title": fixture["title"],
        "language": fixture["language"],
        "audience": fixture["audience"],
        "throughline": fixture["throughline"],
        "chapters": chapters,
        "chapter_pages": chapter_pages,
    }


def _default_style() -> dict[str, Any]:
    return {
        "name": "pathways-field-guide",
        "description": "A diagram-led field guide whose paths accumulate into one argument.",
        "body": """# Pathways Field Guide

## Visual thesis
Treat each idea as a marked route whose accumulated traces reveal the lecture's argument.

## Identity
Use strong ink, quiet paper-like fields, precise lines, and a humanist sans-serif hierarchy.

## Spatial grammar
Give one route, diagram, or evidence object the dominant scale; attach concise labels directly.

## Scale and spacing recipe
On 1280×720, use 54–76px display statements, 34–46px ordinary titles, 20–26px body,
14–18px annotations, 52–76px outer margins, 28–44px major gaps, and 12–20px minor gaps.
Let the route or evidence carrier own roughly 58–72% of the useful field; these are visual
recommendations, not acceptance thresholds.

## Component grammar
Crop authentic evidence decisively when it is the carrier and give it at least half the field;
use hairline route marks and direct labels instead of card chrome. Documents sit on one quiet
surface, diagrams share the route-line language, and controls form one compact working strip.
Avoid thumbnail galleries, equal panels, dashboard cards, and mixed corner treatments.

## Semantic encoding
Blue marks the active path, amber marks alternatives, and muted ink preserves prior state.

## Recurring motif
A single route line grows, branches, and returns as the narrative develops.

## Media treatment
Frame evidence cleanly and annotate it with the same line language without falsifying it.

## Motion and interaction
Use tracing, comparison, and reordering only when backed by real changing state.

## Continuity and controlled variation
Keep palette, line semantics, and hierarchy fixed while allowing the dominant carrier to vary.

## Avoid
Avoid generic card grids, decorative gradients, ambiguous accents, and ornamental motion.""",
        "tokens": {
            "bg": "#f5f1e8",
            "surface": "#fffdf7",
            "ink": "#17202a",
            "muted": "#66727c",
            "accent": "#176b87",
            "accent-2": "#c46a28",
            "accent-3": "#4f7d5d",
            "line": "#a8b1b5",
            "font-display": "space-grotesk",
            "font-body": "noto-sans-sc",
            "font-mono": "jetbrains-mono",
        },
        "compositions": _default_compositions(),
    }


def _default_compositions() -> list[dict[str, Any]]:
    all_types = [
        "formula-derivation", "sim-explorable", "code-runnable", "quiz-check",
        "worked-example", "section-break", "narrative-scene",
    ]
    common = {
        "use_when": "The claim needs this carrier and reading path.",
        "spatial_logic": "Use the full fixed canvas with one deliberate reading path.",
        "dominant_carrier": "One subject-specific visual object.",
        "text_role": "Concise labels support rather than surround the carrier.",
        "variation": "Scale and orientation may change while the carrier stays dominant.",
        "avoid": "Do not fall back to a title bar, generic content panel, and bottom controls.",
    }
    return [
        {"id": "route-field", "name": "Route Field", "primary": "focal-object",
         "secondary": "process-path", "page_types": list(all_types), **common},
        {"id": "forked-ledger", "name": "Forked Ledger", "primary": "asymmetric-split",
         "secondary": "comparison", "page_types": list(all_types), **common},
        {"id": "evidence-sheet", "name": "Evidence Sheet", "primary": "document-led",
         "secondary": None, "page_types": list(all_types), **common},
        {"id": "decision-bench", "name": "Decision Bench", "primary": "interactive-workbench",
         "secondary": "layered-reveal", "page_types": list(all_types), **common},
        {"id": "system-map", "name": "System Map", "primary": "spatial-map",
         "secondary": None, "page_types": list(all_types), **common},
        {"id": "threshold-data", "name": "Threshold Data", "primary": "data-led",
         "secondary": None, "page_types": list(all_types), **common},
    ]


@contextmanager
def no_network():
    def boom(*args, **kwargs):
        raise RuntimeError("test attempted network access")

    original = (socket.socket.connect, socket.create_connection, socket.getaddrinfo)
    socket.socket.connect = boom  # type: ignore[method-assign]
    socket.create_connection = boom  # type: ignore[assignment]
    socket.getaddrinfo = boom  # type: ignore[assignment]
    try:
        yield
    finally:
        socket.socket.connect, socket.create_connection, socket.getaddrinfo = original  # type: ignore[misc]


def text_msg(text: str) -> ConversationMessage:
    return ConversationMessage(role="assistant", content=[TextBlock(text=text)])


def tool_call_msg(name: str, tool_input: dict[str, Any]) -> ConversationMessage:
    return ConversationMessage(
        role="assistant",
        content=[ToolUseBlock(name=name, input=tool_input)],
    )


class ScriptedClient:
    def __init__(
        self,
        script: list[ConversationMessage],
        *,
        delay: float = 0,
        inspection_script: list[str] | None = None,
    ) -> None:
        self._script = deque(script)
        self._inspection_script = deque(inspection_script or [])
        self.delay = delay
        self.requests: list[ModelRequest] = []
        self.inspection_requests: list[ModelRequest] = []

    async def render_inspection_page(self, *, document_path: Any, page: int):
        del document_path, page
        return {
            "screenshot": base64.b64decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAE/wJ/l4Z7WQAAAABJRU5ErkJggg=="
            ),
        }

    async def stream_message(
        self, request: ModelRequest
    ) -> AsyncIterator[ModelEvent]:
        if self.delay:
            await asyncio.sleep(self.delay)
        if request.response_schema_name == "notale_inspection":
            self.inspection_requests.append(request)
            raw = (
                self._inspection_script.popleft()
                if self._inspection_script
                else json.dumps({"decision": "success", "findings": [], "html": ""})
            )
            message = text_msg(raw)
        else:
            self.requests.append(request)
            if not self._script:
                raise RuntimeError("script exhausted")
            message = self._script.popleft()
        for block in message.content:
            if isinstance(block, TextBlock) and block.text:
                yield TextDelta(block.text)
        yield MessageComplete(
            message=message,
            usage=Usage(input_tokens=1, output_tokens=1),
            stop_reason="tool_calls" if message.tool_uses else "stop",
        )
