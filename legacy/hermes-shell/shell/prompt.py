"""外壳系统提示：**前缀缓存稳定**地拼装（顺序固定、无时间戳/计数/请求 id）。

顺序：角色规则 → 工具一览 → 技能索引 → 冻结记忆快照(USER/MEMORY)。同输入 → 同字节串
→ 既命中 KV-cache、又保 cassette replay（与 CassetteClient 的消息哈希稳定性同一要求）。
时效性内容（当前日期等）只进 user 消息，绝不进本系统提示。
"""

from __future__ import annotations

from ..ports.memory import MemorySnapshot

SHELL_SYSTEM = """你是一个**专做讲义**的 agent（只干这件事，做深做透）。你在一个有界的工具循环里工作：
- 造讲义用 make_lecture（内部走确定性流水线，产物存进语料库，返回摘要而非正文）。
- 要看已产出的内容，用 view_scene / view_block **按需拉单页/单块**——deck 全程在库里，别期待整份进对话。
- 体检用 evaluate（确定性完整性门）；要改用 revise_scene / revise_block。
- 需求含糊、缺关键约束（受众/篇幅/侧重/主题）时，先用 clarify 问清再动手，不要瞎猜。
- 想了解某个内容组件的完整契约，用 skill_view。
完成、或没有下一步动作时，直接输出给用户的最终答复（不再调用工具）即视为本轮结束。
始终诚实报告：失败就说失败并给证据；不要把没做的说成做了。"""


def build_system_prompt(
    *,
    snapshot: MemorySnapshot,
    skill_index: str,
    tool_names: list[str],
    craft: str = SHELL_SYSTEM,
) -> str:
    """按固定顺序拼系统提示；snapshot 是会话开始冻结的记忆（整会话不变）。"""
    return "\n\n".join(
        [
            craft.strip(),
            "## 可用工具\n" + " · ".join(tool_names),
            "## 内容组件索引\n" + (skill_index.strip() or "（暂无）"),
            "## 讲者画像（USER）\n" + (snapshot.user_md.strip() or "（暂无）"),
            "## 制作笔记（MEMORY）\n" + (snapshot.memory_md.strip() or "（暂无）"),
        ]
    )
