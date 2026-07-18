"""tool-loop：给节点内一次 LLM 调用配上工具，跑有界 think→call→observe 循环，返回最终文本。

只依赖 ports（ToolCallingLLM + Tool），不碰 adapters——换实现只改注入。骨架流程（plan→fanout→…）
不受影响：这是**节点内部**的能力，不是新的控制流。用 OpenAI 线消息格式（与项目既有 chat 格式一致）。
"""

from __future__ import annotations

import json
from typing import Any

from ..ports.llm import ToolCallingLLM
from ..ports.tool import Tool


async def run_tool_loop(
    llm: ToolCallingLLM,
    messages: list[dict[str, Any]],
    tools: dict[str, Tool],
    *,
    max_rounds: int = 4,
    purpose: str = "tools",
) -> str:
    """跑最多 max_rounds 回合工具循环；返回模型最终 content。工具返回值也进对话供模型观察。"""
    specs = [t.spec for t in tools.values()]
    msgs: list[dict[str, Any]] = [dict(m) for m in messages]
    for _ in range(max_rounds):
        turn = await llm.complete_tools(msgs, specs, purpose=purpose)
        if not turn.tool_calls:
            return turn.content or ""
        msgs.append(
            {
                "role": "assistant",
                "content": turn.content or "",
                "tool_calls": [
                    {
                        "id": c.id,
                        "type": "function",
                        "function": {
                            "name": c.name,
                            "arguments": json.dumps(c.arguments, ensure_ascii=False),
                        },
                    }
                    for c in turn.tool_calls
                ],
            }
        )
        for c in turn.tool_calls:
            tool = tools.get(c.name)
            obs = await tool.run(c.arguments) if tool is not None else f"ERROR: 未知工具 {c.name}"
            msgs.append({"role": "tool", "tool_call_id": c.id, "content": obs})
    # 轮次用尽：最后再问一次，逼出最终答复
    final = await llm.complete_tools(msgs, specs, purpose=purpose)
    return final.content or ""
