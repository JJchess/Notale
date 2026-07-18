"""编排核心：plan → fan-out(逐块生成+自校验+自修) → 组装 → 整档校验+自修 → 备注 → 覆盖度。

对应旧 src/agent.mjs。只依赖 ports.LLMClient 与 domain（禁 import adapters）——换 live/replay/fake 只改注入。
生成器变体（消融轴）由 GeneratorOptions 开关表达：fanout / revise / evolve / plan_perspectives。
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from ..domain.assemble import fill_blocks
from ..domain.evaluation import check_coverage
from ..domain.generation import BlockResult, condense_material, enrich_notes, generate_block
from ..domain.planning import assign_layouts, plan_lecture
from ..domain.skills import AUTHORING_RULES, SkillEntry, load_skills
from ..domain.tools import CalcTool
from ..ports.llm import LLMClient
from ..ports.tool import Tool
from ..schema.validate import validate_doc
from ..utils.concurrency import pool

_CONC = 4
_BLOCK_ERR = re.compile(r"\$\.scenes\[(\d+)\]\.blocks\[(\d+)\]")


@dataclass
class GeneratorOptions:
    fanout: bool = True
    revise: bool = True
    evolve: bool = False
    plan_perspectives: int = 3
    tools: bool = False  # 开启后 sim 块生成走 tool-loop（模型可用 calc 验证表达式）


@dataclass
class GenerateResult:
    doc: dict[str, Any]
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    dropped: list[str] = field(default_factory=list)
    perspectives: list[dict[str, Any]] = field(default_factory=list)
    coverage: dict[str, Any] | None = None


async def _doc_repair(
    llm: LLMClient,
    doc: dict[str, Any],
    registry: dict[str, SkillEntry],
    material: str,
    log: Callable[[str], None],
    tools: dict[str, Tool] | None = None,
    rounds: int = 2,
) -> Any:
    """整档校验 → 把 block 级错误路由回对应子代理自修（保留块 id 供版式引用）。"""
    res = validate_doc(doc)
    for rnd in range(1, rounds + 1):
        res = validate_doc(doc)
        if not res.errors:
            return res
        targets: dict[tuple[int, int], list[str]] = {}
        for e in res.errors:
            m = _BLOCK_ERR.search(e)
            if m:
                targets.setdefault((int(m.group(1)), int(m.group(2))), []).append(e)
        if not targets:
            return res  # 剩 scene 级结构错：交报告，不硬修
        log(f"[repair] 第 {rnd} 轮: {len(res.errors)} 错，回炉 {len(targets)} 处 block")

        async def fix(item: tuple[tuple[int, int], list[str]], _i: int) -> None:
            (si, bi), errs = item
            cur = doc["scenes"][si]["blocks"][bi]
            reg = registry.get(cur.get("type"))
            if not reg:
                return
            r = await generate_block(
                llm,
                type=cur["type"],
                intent="修正下述校验错误：" + "；".join(errs),
                scene_ctx=f"当前(有错): {cur}",
                contract=reg.contract,
                material=material,
                tools=tools if cur["type"] == "sim" else None,
            )
            if r.block:
                r.block["id"] = cur.get("id")
                doc["scenes"][si]["blocks"][bi] = r.block

        await pool(list(targets.items()), _CONC, fix)
    return validate_doc(doc)


async def generate_lecture(
    llm: LLMClient,
    *,
    topic: str,
    pages: int = 12,
    theme: str = "",
    audience: str = "",
    wants: str = "",
    extra: str = "",
    material: str = "",
    coverage: bool = False,
    options: GeneratorOptions | None = None,
    skills_dir: str | None = None,
    log: Callable[[str], None] = lambda _m: None,
) -> GenerateResult:
    opts = options or GeneratorOptions()
    registry, auto_types = load_skills(skills_dir)
    tool_kit: dict[str, Tool] | None = {"calc": CalcTool()} if opts.tools else None

    mat = await condense_material(llm, material, topic=topic, target_chars=4000) if material else ""

    # ① Plan（STORM 多视角）
    log(f"[plan] 课题: {topic} (~{pages} 页)")
    plan = await plan_lecture(
        llm,
        topic=topic,
        pages=pages,
        theme=theme,
        audience=audience,
        wants=wants,
        extra=extra,
        material=mat,
        auto_types=auto_types,
        authoring_rules=AUTHORING_RULES,
        perspectives_n=opts.plan_perspectives,
    )
    doc = plan.doc
    doc["schemaVersion"] = "1.0"
    doc.setdefault("language", "zh-CN")
    if theme:
        doc["theme"] = theme
    doc.setdefault("id", "lecture")

    placeholders: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for si, s in enumerate(doc.get("scenes", [])):
        for bi, b in enumerate(s.get("blocks") or []):
            b["id"] = b.get("id") or f"s{si}b{bi}"
            if b.get("type") not in registry:  # 防幻觉类型丢内容
                log(f'[plan] 未知 type "{b.get("type")}"，回退 list')
                b["type"] = "list"
            placeholders.append((b, s))

    assign_layouts(doc)
    log(
        f"[plan] {len(doc.get('scenes', []))} 页 / {len(placeholders)} block；theme={doc.get('theme')}"
    )

    # ② Fan-out（逐块生成；no_fanout 消融 = 串行）
    conc = _CONC if opts.fanout else 1

    async def gen(item: tuple[dict[str, Any], dict[str, Any]], _i: int) -> tuple[str, BlockResult]:
        ph, scene = item
        reg = registry.get(ph["type"])
        if not reg:
            return ph["id"], BlockResult(None, f"无技能处理 type {ph['type']}")
        r = await generate_block(
            llm,
            type=ph["type"],
            intent=ph.get("intent", ""),
            scene_ctx=f"所在页: {scene.get('headline') or scene.get('eyebrow') or scene.get('kind')}",
            contract=reg.contract,
            material=mat,
            tools=tool_kit if ph["type"] == "sim" else None,
        )
        log(f"  {'✗' if r.err else '✓'} {ph['id']} ({ph['type']})")
        return ph["id"], r

    results = await pool(placeholders, conc, gen)
    blocks_by_id = {bid: r.block for bid, r in results}

    # ③ Assemble（回填）
    dropped = fill_blocks(doc, blocks_by_id)

    # ④ 整档校验 + 结构自修（revise 消融可关）
    if opts.revise:
        final = await _doc_repair(llm, doc, registry, mat, log, tool_kit)
    else:
        final = validate_doc(doc)

    # ④.5 讲者备注增强
    if not final.errors:
        await enrich_notes(llm, doc, audience=audience)

    # ⑤ 覆盖度审查（opt-in，完成 STORM 闭环）
    cov = None
    if coverage and plan.perspectives and not final.errors:
        try:
            cov = await check_coverage(llm, doc, plan.perspectives)
        except Exception:  # noqa: BLE001
            pass

    return GenerateResult(
        doc=doc,
        errors=final.errors,
        warnings=final.warnings,
        dropped=dropped,
        perspectives=plan.perspectives,
        coverage=cov,
    )
