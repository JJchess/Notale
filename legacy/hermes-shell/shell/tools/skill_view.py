"""skill_view —— 技能渐进披露的“取全文”一环。

系统提示只放紧凑技能索引（family+描述，见 domain.context.build_skill_index）；模型要看某个
block 类型的完整契约时，才调 skill_view 把它拉进上下文。无参 = 回索引；给 type = 回该类型契约。
只读已加载的 registry（不新做文件 I/O）。
"""

from __future__ import annotations

import json
from typing import Any

from ...domain.skills import SkillEntry, plan_menu
from ...ports.tool import ToolSpec


class SkillViewTool:
    def __init__(self, registry: dict[str, SkillEntry]) -> None:
        self._registry = registry

    @property
    def spec(self) -> ToolSpec:
        return {
            "name": "skill_view",
            "description": (
                "查看可用的内容组件（技能）。不传参→返回家族索引（描述+可选类型）；"
                "传 type→返回该 block 类型的完整生成契约。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "type": {"type": "string", "description": "可选：某个 block 类型名，取其契约"},
                },
            },
        }

    async def run(self, args: dict[str, Any]) -> str:
        btype = str(args.get("type", "") or "").strip()
        if not btype:
            menu = plan_menu(self._registry)
            lines = [f"- {skill}（{', '.join(types)}）：{desc}" for skill, desc, types in menu]
            return "可用内容组件家族：\n" + "\n".join(lines)
        entry = self._registry.get(btype)
        if not entry:
            return f"ERROR: 无 block 类型 '{btype}'（用 skill_view 无参看索引）"
        contract = entry.contract
        body = contract if isinstance(contract, str) else json.dumps(contract, ensure_ascii=False, indent=2)
        return f"# {btype}（家族 {entry.skill}）\n{entry.description}\n\n契约：\n{body}"
