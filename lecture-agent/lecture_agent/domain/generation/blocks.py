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
from ..evaluation.completeness import block_issues
from ..skills.authoring import AUTHORING_RULES
from ..tool_loop import run_tool_loop

_SYS = (
    "你是 LectureDoc 单个 block 生成器。只输出**一个** block 的 JSON 对象，"
    "不要代码围栏、不要解释。你必须服从页级 brief，并把当前 block 当作同页协作中的一个角色，不能自立新主题。"
    "任何精确数字、引文、论文归因或真实世界统计，必须来自提供的素材；否则只能使用可复算推导，"
    "或明确标注为「示意/合成数据」。禁止为了显得具体而编造来源。图形类型必须真实编码 visualTask 的关系，"
    "不能用装饰形状冒充坐标、轨迹、梯度或因果关系。同页 sibling blocks 是并发生成的："
    "不得臆测兄弟块会采用的具体衰减因子、阈值、步数或数据；若共享数值未在页 brief/intent 明定，"
    f"就使用符号描述或不举数值例子，避免跨块互相矛盾。\n{AUTHORING_RULES}"
)
_BLOCK_INITIAL_TIMEOUT_S = 360.0
_BLOCK_REPAIR_TIMEOUT_S = 240.0


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
    topic: str = "",
    material: str = "",
    rounds: int = 3,
    tools: dict[str, Tool] | None = None,
) -> BlockResult:
    """生成并自校验一个 block。初次 + (rounds-1) 次自修。

    topic 是**全局课题锚**：块生成器只看到本块意图与所在页，若不注入 topic，封面/收尾这类"标题+副题"
    的通用意图会与课题脱钩而跑题（且同 namespace 内跨题 prompt-hash 相同还会缓存串用）。故强制紧扣。

    tools 非空且 llm 支持 function-calling 时，首轮走 tool-loop——模型可先调工具（如 calc 验证 sim
    表达式）再产出 JSON；骨架流程不变，这只是节点内部能力。
    """
    anchor = (
        f"本讲义课题: 「{topic}」——本 block 所有内容必须紧扣此课题，"
        f"标题/副题/示例严禁写成其它主题。"
        if topic
        else ""
    )
    ctx = f"{anchor}{scene_ctx + '。' if scene_ctx else ''}本 block 教学意图: {intent}。"
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
        call_timeout = _BLOCK_INITIAL_TIMEOUT_S if rnd == 1 else _BLOCK_REPAIR_TIMEOUT_S
        try:
            use_tools = rnd == 1 and tools and isinstance(llm, ToolCallingLLM)
            if use_tools:
                raw = await asyncio.wait_for(
                    run_tool_loop(
                        cast(ToolCallingLLM, llm),
                        cast(list[dict[str, Any]], messages),
                        tools or {},
                        purpose="block:" + type,
                    ),
                    timeout=call_timeout,
                )
            else:
                raw = await asyncio.wait_for(
                    llm.complete(
                        messages, purpose=("block:" if rnd == 1 else "repair:") + type
                    ),
                    timeout=call_timeout,
                )
        except TimeoutError:
            # provider 自己可能配置 600s×4 次重试；编排层必须有更短的任务级截止时间，
            # 否则六个失败页会把一次生成拖成数小时。超时不在同一 block 内盲目重试。
            return BlockResult(None, f"block {type} 调用超时（>{call_timeout:.0f}s）")
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
            trunc = block_issues(block)
            if not trunc or last:  # 干净，或最后一轮（best-effort 保留，不丢内容）
                return BlockResult(block, warns=(res.warnings or []) + trunc)
            # schema 过但语义截断/占位 → 回炉补全
            messages.append({"role": "assistant", "content": json.dumps(block, ensure_ascii=False)})
            messages.append(
                {
                    "role": "user",
                    "content": "内容不完整（截断/占位）:\n"
                    + "\n".join(trunc)
                    + "\n请补全被截断的文本/公式、去掉占位，只重新输出该 block JSON。",
                }
            )
            continue
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
