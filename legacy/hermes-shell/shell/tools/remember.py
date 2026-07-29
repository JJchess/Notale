"""remember —— 低风险自动记忆：把讲者偏好/制作经验写穿透到 MemoryStore。

写立即落盘（持久），但**不改当前会话的冻结快照** → 只在下次会话生效（保 prefix-cache/replay 稳定）。
高风险的技能/契约改动不走这里——那要经 evolve 人工 gate（C 组）。
"""

from __future__ import annotations

from typing import Any

from ...ports.memory import MemoryStore
from ...ports.tool import ToolSpec


class RememberTool:
    def __init__(self, memory: MemoryStore) -> None:
        self._memory = memory

    @property
    def spec(self) -> ToolSpec:
        return {
            "name": "remember",
            "description": (
                "记住一条**低风险**长期信息：kind='user' 记讲者偏好（受众/主题/密度习惯等），"
                "kind='memory' 记制作经验/约定。写入下次会话生效，不影响本轮。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "kind": {"type": "string", "enum": ["user", "memory"]},
                    "note": {"type": "string", "description": "要记住的一句话"},
                },
                "required": ["kind", "note"],
            },
        }

    async def run(self, args: dict[str, Any]) -> str:
        note = str(args.get("note", "")).strip()
        kind = str(args.get("kind", "")).strip()
        if not note:
            return "ERROR: 缺 note"
        if kind == "user":
            self._memory.append_user(note)
        elif kind == "memory":
            self._memory.append_memory(note)
        else:
            return "ERROR: kind 必须是 'user' 或 'memory'"
        return f"已记入 {kind}：「{note[:40]}」（下次会话生效）"
