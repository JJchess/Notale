"""AgentBase —— OpenHarness QueryEngine 的薄封装（无头、全自动、可注入 fake client）。

纪律（docs/openharness-spike.md 验证过的窄路径）：
- 权限必须 FULL_AUTO：permission_prompt=None + DEFAULT 会让 mutating 工具被静默拒绝；
- skill 由 Notale 的受权、分块 skill_read 工具按需加载，不扫描用户目录；
- client=None 时用画像声明的 base_url/model/api_key_env 构造 OpenAICompatibleClient；
  测试注入 ScriptedClient（鸭子实现 SupportsStreamingMessages），全程零网络。
"""

from __future__ import annotations

import os
import json
import hashlib
import time
from dataclasses import dataclass, field
from pathlib import Path
from collections.abc import Callable
from collections import defaultdict, deque
from typing import Any

from openharness.api.openai_client import OpenAICompatibleClient
from openharness.config.settings import PermissionSettings
from openharness.engine.query import MaxTurnsExceeded
from openharness.engine.query_engine import QueryEngine
from openharness.engine.stream_events import (
    AssistantTurnComplete,
    CompactProgressEvent,
    ErrorEvent,
    StatusEvent,
    ToolExecutionCompleted,
    ToolExecutionStarted,
)
from openharness.permissions.checker import PermissionChecker
from openharness.permissions.modes import PermissionMode
from openharness.skills.loader import load_skills_from_dirs
from openharness.tools.base import BaseTool, ToolRegistry
from openharness.services.token_estimation import estimate_tokens
from notale.roles.base import RoleSpec
from notale.core.observability import ExperimentLogger, now
from notale.utils.config import get_config


_RUNTIME_CONFIG = get_config().runtime

SKILLS_ROOT = Path(__file__).resolve().parent.parent / "skills"


@dataclass
class ToolReceipt:
    """一次工具调用的回执——harness 侧审计事实。"""

    name: str
    args: dict[str, Any]
    output: str  # 结果摘要，截断 200 字符
    is_error: bool


@dataclass
class AgentResult:
    text: str  # 最后一个助手回合的最终文本
    tool_receipts: list[ToolReceipt] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    turns: int = 0


def load_skills(names: list[str]):
    """按目录名加载 notale/skills/<name>/SKILL.md。缺 skill 直接报错。"""
    defs = load_skills_from_dirs([SKILLS_ROOT])
    by_name: dict[str, Any] = {}
    for d in defs:
        by_name[d.name] = d
        by_name[d.command_name] = d
    missing = [n for n in names if n not in by_name]
    if missing:
        raise ValueError(f"notale/skills/ 下找不到 skill：{missing}（现有：{sorted(by_name)}）")
    return [by_name[n] for n in names]


def render_skills_block(skills: list[str]) -> str:
    """把 skill 清单（name+description）+ SKILL.md 全文渲染成 system prompt 块。"""
    if not skills:
        return ""
    defs = load_skills(skills)
    parts = ["# 可用技能（清单 + SKILL.md 全文，按需遵循）", ""]
    parts.extend(f"- {d.name}: {d.description}" for d in defs)
    for d in defs:
        parts.append(f"\n## skill: {d.name}\n")
        parts.append(d.content.strip())
    return "\n".join(parts)


class AgentBase:
    """一个无头 agent 实例：画像 → QueryEngine。每次 run 是一次独立上下文对话。"""

    def __init__(
        self, profile: RoleSpec, *, client=None, workspace: Path,
        logger: ExperimentLogger | None = None, identity: str | None = None,
        tools: list[BaseTool] | None = None,
        inline_skills: bool = True,
        checkpoint_callback: Callable[[str], None] | None = None,
        tool_result_callback: Callable[[str, dict[str, Any], str, bool], None] | None = None,
        tool_metadata: dict[str, object] | None = None,
        return_on_max_turns: bool = False,
        terminal_tools: set[str] | None = None,
    ) -> None:
        self.profile = profile
        self.workspace = Path(workspace)
        self.logger = logger
        self.identity = identity or profile.name
        registry = ToolRegistry()
        self.tools: list[BaseTool] = []
        for entry in (profile.tools if tools is None else tools):
            tool = entry() if isinstance(entry, type) else entry
            registry.register(tool)
            self.tools.append(tool)

        if client is None:
            api_key = os.environ.get(profile.api_key_env, "").strip()
            if not api_key:
                raise RuntimeError(f"缺 API key：设环境变量 {profile.api_key_env}（key 永不入配置/日志）")
            client = OpenAICompatibleClient(api_key=api_key, base_url=profile.base_url)

        system_prompt = profile.rendered_system_prompt()
        block = render_skills_block(profile.skills) if inline_skills else ""
        if block:
            system_prompt = f"{system_prompt}\n\n{block}" if system_prompt else block
        self.system_prompt = system_prompt

        # OpenHarness's built-in auto-compact estimator only counts conversation messages.
        # Reserve the system prompt and tool schemas here so the configured threshold means
        # "whole provider request", not merely the mutable message suffix.
        tool_schema = json.dumps(registry.to_api_schema(), ensure_ascii=False, default=str)
        self.context_overhead_tokens = int(
            _RUNTIME_CONFIG.context_token_safety_factor
            * (estimate_tokens(system_prompt) + estimate_tokens(tool_schema))
        )
        message_compact_threshold = max(
            _RUNTIME_CONFIG.minimum_message_compact_threshold_tokens,
            profile.auto_compact_threshold_tokens - self.context_overhead_tokens,
        )

        self.engine = QueryEngine(
            api_client=client,
            tool_registry=registry,
            permission_checker=PermissionChecker(
                PermissionSettings(mode=PermissionMode.FULL_AUTO)  # 无头必须，见模块 docstring
            ),
            cwd=self.workspace,
            model=profile.model,
            system_prompt=system_prompt,
            max_turns=profile.max_turns,
            max_tokens=profile.max_tokens,
            context_window_tokens=profile.context_window_tokens,
            auto_compact_threshold_tokens=message_compact_threshold,
            permission_prompt=None,
            ask_user_prompt=None,
            tool_metadata=tool_metadata,
        )
        self.checkpoint_callback = checkpoint_callback
        self.tool_result_callback = tool_result_callback
        self.return_on_max_turns = return_on_max_turns
        self.terminal_tools = set(terminal_tools or ())
        self._compact_metadata_cursor = 0
        self.last_turn_had_tools = False

    def _record_hidden_compactions(self) -> None:
        """OpenHarness microcompact has no stream event; promote its checkpoint to our audit."""
        checkpoints = self.engine.tool_metadata.get("compact_checkpoints", [])
        if not isinstance(checkpoints, list):
            return
        new = checkpoints[self._compact_metadata_cursor :]
        self._compact_metadata_cursor = len(checkpoints)
        for entry in new:
            if not isinstance(entry, dict):
                continue
            if entry.get("checkpoint") != "query_microcompact_end":
                continue
            if int(entry.get("tokens_freed", 0) or 0) <= 0:
                continue
            if self.logger:
                self.logger.record_control_event(self.identity, self.profile.name, "compact")
                self.logger.append("agent-traces.jsonl", {
                    "ts": now(), "kind": "compact", "agent": self.identity,
                    "event": {"phase": "microcompact_end", **entry},
                })
            self.checkpoint("compact:microcompact_end")

    def load_messages(self, messages: list[Any]) -> None:
        """Restore one worker's run-local OpenHarness conversation."""
        self.engine.load_messages(messages)

    def set_max_turns(self, turns: int) -> None:
        self.engine.set_max_turns(turns)

    def checkpoint(self, reason: str) -> None:
        if self.checkpoint_callback is not None:
            self.checkpoint_callback(reason)

    async def run(self, prompt: str) -> AgentResult:
        """跑一个 agent 回合（可能含多轮工具循环），返回最终文本 + 工具回执 + 用量。

        MaxTurnsExceeded 时若已有积累文本则降级返回（max_turns 是模型乱来的上限，
        不是正常路径；部分结果好过全丢），无文本则原样抛出。"""
        starts: list[ToolExecutionStarted] = []
        completions: list[ToolExecutionCompleted] = []
        pending_inputs: dict[str, deque[dict[str, Any]]] = defaultdict(deque)
        text = ""
        turns = 0
        terminal_error: str | None = None
        turn_started = time.monotonic()
        if self.logger:
            self.logger.append("agent-traces.jsonl", {
                "ts": now(), "kind": "agent-start", "agent": self.identity,
                "role": self.profile.name, "model": self.profile.model,
                "baseUrl": self.profile.base_url, "maxTurns": self.profile.max_turns,
                "maxTokens": self.profile.max_tokens,
                "systemPrompt": self.system_prompt, "prompt": prompt,
            })
            self.logger.summary(self.identity, "agent started", model=self.profile.model)
        try:
            async for event in self.engine.submit_message(prompt):
                self._record_hidden_compactions()
                if isinstance(event, ToolExecutionStarted):
                    starts.append(event)
                    pending_inputs[event.tool_name].append(dict(event.tool_input))
                    if self.logger:
                        self.logger.append("agent-traces.jsonl", {
                            "ts": now(), "kind": "tool-start", "agent": self.identity,
                            "tool": event.tool_name, "input": event.tool_input,
                        })
                elif isinstance(event, ToolExecutionCompleted):
                    completions.append(event)
                    tool_input = (
                        pending_inputs[event.tool_name].popleft()
                        if pending_inputs[event.tool_name]
                        else {}
                    )
                    if self.logger:
                        self.logger.record_tool(
                            self.identity, self.profile.name, event.tool_name,
                            is_error=event.is_error,
                            error_kind=(
                                "external"
                                if event.tool_name in {
                                    "web_search", "fetch_web", "acquire_media", "generate_media"
                                }
                                else "validation"
                                if event.tool_name == "check_page"
                                else "protocol"
                            ),
                        )
                        self.logger.append("agent-traces.jsonl", {
                            "ts": now(), "kind": "tool-end", "agent": self.identity,
                            "tool": event.tool_name, "output": event.output,
                            "isError": event.is_error,
                        })
                    if self.tool_result_callback is not None:
                        self.tool_result_callback(
                            event.tool_name, tool_input, event.output, event.is_error
                        )
                    self.checkpoint("tool-execution")
                    turn_started = time.monotonic()
                    if event.tool_name in self.terminal_tools and not event.is_error:
                        break
                elif isinstance(event, AssistantTurnComplete):
                    turns += 1
                    self.last_turn_had_tools = bool(event.message.tool_uses)
                    if event.message.text:
                        text = event.message.text
                    if self.logger:
                        message = (
                            event.message.model_dump(mode="json")
                            if hasattr(event.message, "model_dump") else str(event.message)
                        )
                        usage = {
                            "input_tokens": event.usage.input_tokens,
                            "output_tokens": event.usage.output_tokens,
                        }
                        duration_sec = round(time.monotonic() - turn_started, 3)
                        context_tokens = event.usage.input_tokens
                        page_type = str(self.engine.tool_metadata.get("pageType") or "") or None
                        self.logger.record_turn(
                            self.identity, self.profile.name, usage,
                            duration_sec=duration_sec, context_tokens=context_tokens,
                            page_type=page_type,
                        )
                        self.logger.append("agent-traces.jsonl", {
                            "ts": now(), "kind": "assistant-turn", "agent": self.identity,
                            "turn": turns, "message": message, "usage": usage,
                        })
                        self.logger.append("llm-calls.jsonl", {
                            "ts": now(), "kind": "openharness-turn", "agent": self.identity,
                            "role": self.profile.name, "model": self.profile.model,
                            "baseUrl": self.profile.base_url, "turn": turns,
                            "durationSec": duration_sec,
                            "messageCount": len(self.engine.messages),
                            "contextHash": hashlib.sha256(json.dumps(
                                [m.model_dump(mode="json") for m in self.engine.messages],
                                ensure_ascii=False, separators=(",", ":"),
                            ).encode("utf-8")).hexdigest(),
                            "contextOverheadTokens": self.context_overhead_tokens,
                            "contextTokens": context_tokens,
                            "usage": usage,
                        })
                    self.checkpoint("assistant-turn")
                    turn_started = time.monotonic()
                elif isinstance(event, CompactProgressEvent):
                    if self.logger:
                        if event.phase in {
                            "compact_end", "context_collapse_end", "session_memory_end"
                        }:
                            self.logger.record_control_event(
                                self.identity, self.profile.name, "compact"
                            )
                        self.logger.append("agent-traces.jsonl", {
                            "ts": now(), "kind": "compact", "agent": self.identity,
                            "event": event.__dict__,
                        })
                    self.checkpoint(f"compact:{event.phase}")
                elif isinstance(event, (ErrorEvent, StatusEvent)):
                    if isinstance(event, ErrorEvent):
                        terminal_error = event.message
                    if self.logger:
                        self.logger.append("agent-traces.jsonl", {
                            "ts": now(), "kind": type(event).__name__,
                            "agent": self.identity, "event": event.__dict__,
                        })
            self._record_hidden_compactions()
        except MaxTurnsExceeded:
            if self.logger:
                self.logger.record_control_event(self.identity, self.profile.name, "max-turns")
                self.logger.append("agent-traces.jsonl", {
                    "ts": now(), "kind": "max-turns", "agent": self.identity,
                    "turns": turns, "partialResponse": text,
                })
            if not text and not self.return_on_max_turns:
                raise
        except BaseException as exc:
            if self.logger:
                import traceback
                self.logger.metrics["errors"] += 1
                self.logger.append("agent-traces.jsonl", {
                    "ts": now(), "kind": "agent-error", "agent": self.identity,
                    "error": {"type": type(exc).__name__, "message": str(exc),
                              "traceback": "".join(traceback.format_exception(exc))},
                })
            raise
        if terminal_error is not None and turns == 0:
            raise RuntimeError(f"OpenHarness query failed before an assistant turn: {terminal_error}")
        receipts = [
            ToolReceipt(
                name=s.tool_name,
                args=dict(s.tool_input),
                output=c.output[: _RUNTIME_CONFIG.tool_receipt_preview_chars],
                is_error=c.is_error,
            )
            for s, c in zip(starts, completions)
        ]
        usage = self.engine.total_usage
        if self.logger:
            self.logger.append("agent-traces.jsonl", {
                "ts": now(), "kind": "agent-end", "agent": self.identity,
                "turns": turns, "inputTokens": usage.input_tokens,
                "outputTokens": usage.output_tokens, "response": text,
                "toolReceipts": [r.__dict__ for r in receipts],
            })
            self.logger.summary(self.identity, "agent complete", turns=turns,
                                tokens=usage.input_tokens + usage.output_tokens)
        return AgentResult(
            text=text,
            tool_receipts=receipts,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            turns=turns,
        )
