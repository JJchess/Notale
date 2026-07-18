"""fan-out 原语：一个子任务 = 一次聚焦 LLM 调用（带该 block 家族契约）+ 自校验 + 自修。

对应旧 src/delegate.mjs。只依赖 ports.LLMClient（不知道模型/端点），故可注入 fake 测试。
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Any, cast

from ...ports.llm import LLMClient, Message, ToolCallingLLM
from ...ports.tool import Tool
from ...schema.validate import validate_block
from ...utils.jsonio import parse_json
from ..skills.authoring import AUTHORING_RULES
from ..tool_loop import run_tool_loop

_SYS = (
    "你是 LectureDoc 单个 block 生成器。只输出**一个** block 的 JSON 对象，"
    f"不要代码围栏、不要解释。\n{AUTHORING_RULES}"
)


@dataclass
class BlockResult:
    block: dict[str, Any] | None
    err: str | None = None
    warns: list[str] | None = None


def _contract_str(contract: Any) -> str:
    return (
        contract
        if isinstance(contract, str)
        else json.dumps(contract, ensure_ascii=False, indent=2)
    )


async def generate_block(
    llm: LLMClient,
    *,
    type: str,
    intent: str,
    scene_ctx: str,
    contract: Any,
    material: str = "",
    rounds: int = 3,
    tools: dict[str, Tool] | None = None,
) -> BlockResult:
    """生成并自校验一个 block。初次 + (rounds-1) 次自修。

    tools 非空且 llm 支持 function-calling 时，首轮走 tool-loop——模型可先调工具（如 calc 验证 sim
    表达式）再产出 JSON；骨架流程不变，这只是节点内部能力。
    """
    ctx = f"{scene_ctx + '。' if scene_ctx else ''}本 block 教学意图: {intent}。"
    mat = (
        f"\n\n参考素材（内容/例子/数据据此，别编造脱离素材的事实）：\n{material}"
        if material
        else ""
    )
    messages: list[Message] = [
        {"role": "system", "content": _SYS},
        {
            "role": "user",
            "content": f"生成一个 {type} block。\n契约:\n{_contract_str(contract)}\n\n{ctx}{mat}\n只输出该 block 的 JSON。",
        },
    ]
    for rnd in range(1, rounds + 1):
        last = rnd == rounds
        try:
            use_tools = rnd == 1 and tools and isinstance(llm, ToolCallingLLM)
            if use_tools:
                raw = await run_tool_loop(
                    cast(ToolCallingLLM, llm),
                    cast(list[dict[str, Any]], messages),
                    tools or {},
                    purpose="block:" + type,
                )
            else:
                raw = await llm.complete(
                    messages, purpose=("block:" if rnd == 1 else "repair:") + type
                )
        except Exception as e:  # noqa: BLE001
            if last:
                return BlockResult(None, f"LLM 调用失败: {str(e)[:80]}")
            await asyncio.sleep(1.0)
            continue
        try:
            block = parse_json(raw)
        except Exception:  # noqa: BLE001
            if last:
                return BlockResult(None, "JSON 解析失败")
            continue
        block["type"] = type  # 钉死类型，防漂移
        res = validate_block(block, type)
        if not res.errors:
            return BlockResult(block, warns=res.warnings)
        if last:
            return BlockResult(None, "; ".join(res.errors))
        messages.append({"role": "assistant", "content": json.dumps(block, ensure_ascii=False)})
        messages.append(
            {
                "role": "user",
                "content": "校验未通过:\n"
                + "\n".join(res.errors)
                + "\n修正后只重新输出该 block JSON。",
            }
        )
    return BlockResult(None, "未知失败")
