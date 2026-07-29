"""revise_block / revise_scene —— 定点重生成 deck 里的块/页并写回库。

复用生成流水线的块子配方（generate_block / sim:widget 走 generate_widget），改完 validate_doc
把关：绝不把非法 deck 落库（改坏就回滚，返回错误摘要）。只回摘要，不回正文。
"""

from __future__ import annotations

from typing import Any

from ...domain.generation import generate_block, generate_widget, load_widget_guidelines
from ...domain.skills import SkillEntry
from ...ports.llm import LLMClient
from ...ports.store import CorpusStore
from ...ports.tool import ToolSpec
from ...schema.validate import validate_doc


async def _regen_block(
    llm: LLMClient,
    doc: dict[str, Any],
    block: dict[str, Any],
    scene: dict[str, Any],
    registry: dict[str, SkillEntry],
    instruction: str,
    topic: str,
) -> dict[str, Any] | None:
    reg = registry.get(str(block.get("type")))
    if not reg:
        return None
    ctx = f"所在页: {scene.get('headline') or scene.get('eyebrow') or scene.get('kind')}"
    if block.get("type") == "sim" and block.get("engine") == "widget":
        r = await generate_widget(
            llm,
            intent=instruction,
            theme=str(doc.get("theme") or "cartesian"),
            language=str(doc.get("language") or "zh-CN"),
            topic=topic,
            material="",
            guidelines=load_widget_guidelines(reg.dir),
        )
    else:
        r = await generate_block(
            llm,
            type=str(block["type"]),
            intent=instruction,
            scene_ctx=f"{ctx}；当前块: {block}",
            contract=reg.contract,
            topic=topic,
            material="",
        )
    if r.block:
        r.block["id"] = block.get("id")
    return r.block


class ReviseBlockTool:
    def __init__(self, llm: LLMClient, store: CorpusStore, registry: dict[str, SkillEntry]) -> None:
        self._llm, self._store, self._registry = llm, store, registry

    @property
    def spec(self) -> ToolSpec:
        return {
            "name": "revise_block",
            "description": "按指令重生成某份 deck 里的单个 block 并写回；改坏（校验不过）则回滚。返回摘要。",
            "parameters": {
                "type": "object",
                "properties": {
                    "deck_id": {"type": "string"},
                    "block_id": {"type": "string"},
                    "instruction": {"type": "string", "description": "怎么改这个块"},
                    "topic": {"type": "string", "description": "可选：课题，帮生成器锚定"},
                },
                "required": ["deck_id", "block_id", "instruction"],
            },
        }

    async def run(self, args: dict[str, Any]) -> str:
        did = str(args.get("deck_id"))
        try:
            doc = self._store.load_deck(did)
        except KeyError:
            return f"ERROR: 无此 deck '{did}'"
        bid = str(args.get("block_id"))
        found = None
        for s in doc.get("scenes", []):
            for b in s.get("blocks") or []:
                if b.get("id") == bid:
                    found = (s, b)
                    break
            if found:
                break
        if not found:
            return f"ERROR: deck '{did}' 内无 block '{bid}'"
        scene, block = found
        before = len(validate_doc(doc).errors)
        new = await _regen_block(
            self._llm, doc, block, scene, self._registry,
            str(args.get("instruction", "")), str(args.get("topic", "") or ""),
        )
        if not new:
            return f"ERROR: 无法重生成 block '{bid}'（无对应技能或生成失败），deck 未改"
        block.clear()
        block.update(new)
        res = validate_doc(doc)
        if res.errors:
            return f"✗ 改后校验不过（{len(res.errors)} 错），未落库：{res.errors[0]}"
        self._store.save_deck(did, doc)
        return f"✓ block '{bid}' 已重生成并写回 · 整档校验 {before}→0 错"


class ReviseSceneTool:
    def __init__(self, llm: LLMClient, store: CorpusStore, registry: dict[str, SkillEntry]) -> None:
        self._llm, self._store, self._registry = llm, store, registry

    @property
    def spec(self) -> ToolSpec:
        return {
            "name": "revise_scene",
            "description": "按指令重生成某份 deck 第 index 页的所有 block 并写回；改坏则回滚。返回摘要。",
            "parameters": {
                "type": "object",
                "properties": {
                    "deck_id": {"type": "string"},
                    "index": {"type": "integer"},
                    "instruction": {"type": "string"},
                    "topic": {"type": "string"},
                },
                "required": ["deck_id", "index", "instruction"],
            },
        }

    async def run(self, args: dict[str, Any]) -> str:
        did = str(args.get("deck_id"))
        try:
            doc = self._store.load_deck(did)
        except KeyError:
            return f"ERROR: 无此 deck '{did}'"
        scenes = doc.get("scenes", [])
        i = int(args.get("index", -1))
        if not (0 <= i < len(scenes)):
            return f"ERROR: index {i} 越界（共 {len(scenes)} 页）"
        scene = scenes[i]
        instr, topic = str(args.get("instruction", "")), str(args.get("topic", "") or "")
        n = 0
        for block in scene.get("blocks") or []:
            new = await _regen_block(self._llm, doc, block, scene, self._registry, instr, topic)
            if new:
                block.clear()
                block.update(new)
                n += 1
        res = validate_doc(doc)
        if res.errors:
            return f"✗ 第 {i} 页改后校验不过（{len(res.errors)} 错），未落库：{res.errors[0]}"
        self._store.save_deck(did, doc)
        return f"✓ 第 {i} 页 {n} 个 block 已重生成并写回 · 整档校验通过"
