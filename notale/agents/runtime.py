"""AgentBase —— OpenHarness QueryEngine 的薄封装（无头、全自动、可注入 fake client）。

纪律（docs/openharness-spike.md 验证过的窄路径）：
- 权限必须 FULL_AUTO：permission_prompt=None + DEFAULT 会让 mutating 工具被静默拒绝；
- skill 不走 SkillTool（每次调用重扫 ~/.openharness，有副作用）——这里把 skills/<name>/SKILL.md
  的清单 + 全文直接拼进 system prompt（skill 都小）；
- client=None 时用画像声明的 base_url/model/api_key_env 构造 OpenAICompatibleClient；
  测试注入 ScriptedClient（鸭子实现 SupportsStreamingMessages），全程零网络。
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from openharness.api.openai_client import OpenAICompatibleClient
from openharness.config.settings import PermissionSettings
from openharness.engine.query import MaxTurnsExceeded
from openharness.engine.query_engine import QueryEngine
from openharness.engine.stream_events import (
    AssistantTurnComplete,
    ToolExecutionCompleted,
    ToolExecutionStarted,
)
from openharness.permissions.checker import PermissionChecker
from openharness.permissions.modes import PermissionMode
from openharness.skills.loader import load_skills_from_dirs
from openharness.tools.base import BaseTool, ToolRegistry
from notale.roles.base import RoleSpec

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

    def __init__(self, profile: RoleSpec, *, client=None, workspace: Path) -> None:
        self.profile = profile
        self.workspace = Path(workspace)
        registry = ToolRegistry()
        self.tools: list[BaseTool] = []
        for entry in profile.tools:
            tool = entry() if isinstance(entry, type) else entry
            registry.register(tool)
            self.tools.append(tool)

        if client is None:
            api_key = os.environ.get(profile.api_key_env, "").strip()
            if not api_key:
                raise RuntimeError(f"缺 API key：设环境变量 {profile.api_key_env}（key 永不入配置/日志）")
            client = OpenAICompatibleClient(api_key=api_key, base_url=profile.base_url)

        system_prompt = profile.system_prompt
        block = render_skills_block(profile.skills)
        if block:
            system_prompt = f"{system_prompt}\n\n{block}" if system_prompt else block

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
            permission_prompt=None,
            ask_user_prompt=None,
        )

    async def run(self, prompt: str) -> AgentResult:
        """跑一个 agent 回合（可能含多轮工具循环），返回最终文本 + 工具回执 + 用量。

        MaxTurnsExceeded 时若已有积累文本则降级返回（max_turns 是模型乱来的上限，
        不是正常路径；部分结果好过全丢），无文本则原样抛出。"""
        starts: list[ToolExecutionStarted] = []
        completions: list[ToolExecutionCompleted] = []
        text = ""
        turns = 0
        try:
            async for event in self.engine.submit_message(prompt):
                if isinstance(event, ToolExecutionStarted):
                    starts.append(event)
                elif isinstance(event, ToolExecutionCompleted):
                    completions.append(event)
                elif isinstance(event, AssistantTurnComplete):
                    turns += 1
                    if event.message.text:
                        text = event.message.text
        except MaxTurnsExceeded:
            if not text:
                raise
        receipts = [
            ToolReceipt(
                name=s.tool_name,
                args=dict(s.tool_input),
                output=c.output[:200],
                is_error=c.is_error,
            )
            for s, c in zip(starts, completions)
        ]
        usage = self.engine.total_usage
        return AgentResult(
            text=text,
            tool_receipts=receipts,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            turns=turns,
        )
