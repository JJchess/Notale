"""组合根（L5）· Pipeline B —— 专能 Hermes 外壳（对话式做讲义）。

装配 LLM/记忆/工具集，跑一轮 ReAct 外壳。只依赖 `shell/` + adapters，**不 import `engine` 的
A 侧胶水、不 import `app/generate.py`**（流水线解耦）；共享装配走 `.build`。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, cast

from omegaconf import DictConfig

from ..adapters.io import CliUserPort
from ..adapters.memory import FsMemoryStore, LedgerRecall
from ..adapters.render import StructuralVerifier
from ..adapters.sandbox import FakeSandbox, SubprocessSandbox
from ..adapters.store import FilesystemStore, ProposalStore
from ..domain.context import LoopBudget
from ..domain.skills import load_skills
from ..ports.llm import ToolCallingLLM
from ..shell.delegate import DelegateTool
from ..shell.review import run_review
from ..shell.shell import ShellResult
from ..shell.shell import run_shell as _run_shell
from ..shell.tools import (
    ClarifyTool,
    EvaluateTool,
    ExecuteCodeTool,
    MakeLectureTool,
    ProposeSkillTool,
    RecallTool,
    RememberTool,
    RenderTool,
    ReviseBlockTool,
    ReviseSceneTool,
    SkillViewTool,
    ViewBlockTool,
    ViewSceneTool,
)
from ..utils.env import load_env
from ..utils.logging import get_logger
from ..utils.seed import seed_everything
from .build import build_llm, build_options


async def run_shell(cfg: DictConfig) -> ShellResult:
    """组合根：装配专能 Hermes 外壳（注入 LLM/记忆/工具集），跑一轮对话式生成。

    request=... 为用户诉求（缺省退回 topic=...）。记忆走文件系统 memory/，clarify 走交互式 CLI。
    """
    load_env()
    seed_everything(int(cfg.get("seed", 0)))
    request = str(cfg.get("request") or cfg.get("topic") or "").strip()
    if not request:
        raise ValueError("请提供 request=...（或 topic=...）作为本轮诉求")
    log = get_logger()
    llm = build_llm(cfg)
    store = FilesystemStore(Path(cfg.get("out_dir", "data/corpus")))
    memory = FsMemoryStore(str(cfg.get("memory_dir", "memory")))
    registry, _ = load_skills()
    user = CliUserPort()
    options = build_options(cfg)
    tc_llm = cast(ToolCallingLLM, llm)
    tools: dict[str, Any] = {
        "make_lecture": MakeLectureTool(llm, store, options=options),
        "view_scene": ViewSceneTool(store),
        "view_block": ViewBlockTool(store),
        "skill_view": SkillViewTool(registry),
        "evaluate": EvaluateTool(store),
        "render": RenderTool(store, StructuralVerifier()),
        "revise_block": ReviseBlockTool(llm, store, registry),
        "revise_scene": ReviseSceneTool(llm, store, registry),
        "clarify": ClarifyTool(user),
        "remember": RememberTool(memory),
        "recall": RecallTool(LedgerRecall()),
        "propose_skill": ProposeSkillTool(ProposalStore()),
    }
    # delegate 拿 tools 活引用，调用时按黑名单过滤（禁递归/禁写记忆/禁 clarify）
    tools["delegate"] = DelegateTool(tc_llm, tools, concurrency=int(cfg.get("delegate_concurrency", 4)))
    # execute_code：默认真进程隔离；实验/replay 用 sandbox=fake 换成确定的 FakeSandbox
    sandbox = FakeSandbox() if str(cfg.get("sandbox", "subprocess")) == "fake" else SubprocessSandbox()
    tools["execute_code"] = ExecuteCodeTool(sandbox, tools)
    res = await _run_shell(
        tc_llm,
        user_request=request,
        tools=tools,
        registry=registry,
        memory=memory,
        budget=LoopBudget(max_rounds=int(cfg.get("shell_max_rounds", 8))),
        log=log.info,
    )
    # 会话末自演化环（opt-in，默认关——省一次 LLM）：复盘 → 记忆/技能提案入待审队列
    if bool(cfg.get("review", False)):
        digest = f"用户诉求：{request}\n工具序列：{res.tool_sequence}\n结果：{res.final}"
        rev = await run_review(
            tc_llm, digest=digest, eval_scores={}, memory=memory, queue=ProposalStore()
        )
        log.info(f"[review] 复盘动作：{rev.tool_sequence}")
    return res
