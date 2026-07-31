"""编排核心：plan → fan-out(逐块生成+自校验+自修) → 组装 → 整档校验+自修 → 备注 → 覆盖度。

对应旧 src/agent.mjs。只依赖 ports.LLMClient 与 domain（禁 import adapters）——换 live/replay/fake 只改注入。
生成器变体（消融轴）由 GeneratorOptions 开关表达：fanout / revise / evolve / plan_perspectives。
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from ..domain.assemble import fill_blocks
from ..domain.evaluation import check_coverage
from ..domain.generation import (
    BlockResult,
    condense_material,
    condense_scene,
    enrich_notes,
    generate_block,
    generate_widget,
    load_widget_guidelines,
)
from ..domain.media import attach_icons
from ..domain.planning import assign_layouts, plan_lecture
from ..domain.skills import AUTHORING_RULES, SkillEntry, load_skills, plan_menu
from ..domain.themes import theme_menu
from ..domain.tools import CalcTool
from ..ports.llm import LLMClient
from ..ports.media import ImageFinder, ImageGenerator
from ..ports.renderer import RenderVerifier
from ..ports.tool import Tool
from ..schema.validate import validate_doc
from ..utils.concurrency import pool

_BLOCK_ERR = re.compile(r"\$\.scenes\[(\d+)\]\.blocks\[(\d+)\]")


def _emit_block_done(
    progress: Callable[[dict[str, Any]], None], block_id: str, scene_id: str | None, err: Any
) -> None:
    """一块完成：出错走 block:err（UI 折成"精修"，不吓用户），否则 docUpdated:done。"""
    if err:
        progress({"type": "block", "blockId": block_id, "sceneId": scene_id, "status": "err"})
    else:
        progress(
            {"type": "docUpdated", "blockId": block_id, "sceneId": scene_id, "status": "done"}
        )


@dataclass
class GeneratorOptions:
    fanout: bool = True
    revise: bool = True
    evolve: bool = False
    plan_perspectives: int = 3
    tools: bool = False  # 开启后 sim 块生成走 tool-loop（模型可用 calc 验证表达式）
    concurrency: int = 4  # fan-out / 修复 / notes 的有界并发（fast 档提到 8）
    sections: bool = True  # 章节分隔页插入（fast 档关，省一次规划调用+少几页）
    media: bool = False  # 封面配图（真调图库/文生图外部服务，默认关——避免每次生成都增加时延/成本）
    record: bool = (
        True  # 记录到 results/ledger.jsonl（能力画像+token+代码指纹，见 app/container.py）
    )
    # 真机渲染验收 → 溢出页回炉精简的最大轮数（需注入 render_verifier 才生效；0=关）
    render_rounds: int = 2


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
    topic: str = "",
    concurrency: int = 4,
    progress: Callable[[dict[str, Any]], None] = lambda _e: None,
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
            sid = doc["scenes"][si].get("id")
            progress({"type": "block", "blockId": cur.get("id"), "sceneId": sid, "status": "err"})
            reg = registry.get(cur.get("type"))
            if not reg:
                return
            if cur.get("type") == "sim" and cur.get("engine") == "widget":
                # widget 修复也走两阶段子配方，别退回一次性 generate_block。
                r = await generate_widget(
                    llm,
                    intent="修正下述校验错误：" + "；".join(errs),
                    theme=str(doc.get("theme") or "cartesian"),
                    language=str(doc.get("language") or "zh-CN"),
                    topic=topic,
                    material=material,
                    guidelines=load_widget_guidelines(reg.dir),
                )
                if r.block:
                    r.block["id"] = cur.get("id")
                    doc["scenes"][si]["blocks"][bi] = r.block
                    progress({"type": "docUpdated", "blockId": cur.get("id"), "sceneId": sid, "status": "done"})
                return
            r = await generate_block(
                llm,
                type=cur["type"],
                intent="修正下述校验错误：" + "；".join(errs),
                scene_ctx=f"当前(有错): {cur}",
                contract=reg.contract,
                topic=topic,
                material=material,
                tools=tools if cur["type"] == "sim" else None,
            )
            if r.block:
                r.block["id"] = cur.get("id")
                doc["scenes"][si]["blocks"][bi] = r.block
                progress({"type": "docUpdated", "blockId": cur.get("id"), "sceneId": sid, "status": "done"})

        await pool(list(targets.items()), concurrency, fix)
    return validate_doc(doc)


async def _attach_hero_image(
    doc: dict[str, Any],
    topic: str,
    image_finder: ImageFinder | None,
    image_generator: ImageGenerator | None,
) -> None:
    """封面配图：先查图库，查无再文生图兜底。两者都缺/都失败就不配图，不阻断生成。"""
    if not image_finder and not image_generator:
        return
    hero = next(
        (
            b
            for s in doc.get("scenes", [])
            for b in (s.get("blocks") or [])
            if b.get("type") == "hero"
        ),
        None,
    )
    if hero is None or hero.get("image"):
        return
    query = " ".join(hero.get("title") or []) or topic
    asset = None
    if image_finder:
        try:
            asset = await image_finder.find_image(query)
        except Exception:  # noqa: BLE001 - 配图失败不阻断整份生成
            asset = None
    if asset is None and image_generator:
        try:
            asset = await image_generator.generate_image(
                f"一张适合作为课程封面配图的插图，主题：{query}"
            )
        except Exception:  # noqa: BLE001
            asset = None
    if asset:
        hero["image"] = asset.data_uri


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
    image_finder: ImageFinder | None = None,
    image_generator: ImageGenerator | None = None,
    render_verifier: RenderVerifier | None = None,
    log: Callable[[str], None] = lambda _m: None,
    progress: Callable[[dict[str, Any]], None] = lambda _e: None,
) -> GenerateResult:
    # progress：结构化进度观测点（供 Web App 的进度视图消费；纯观测，不影响生成）。
    # 事件形如 {"type": "stage"|"skeleton"|"block"|"docUpdated"|"done", ...}；回调不得抛异常。
    opts = options or GeneratorOptions()
    registry, _auto_types = load_skills(skills_dir)
    tool_kit: dict[str, Tool] | None = {"calc": CalcTool()} if opts.tools else None

    mat = await condense_material(llm, material, topic=topic, target_chars=4000) if material else ""

    # ① Plan（STORM 多视角）
    log(f"[plan] 课题: {topic} (~{pages} 页)")
    progress({"type": "stage", "stage": "plan", "status": "start"})
    plan = await plan_lecture(
        llm,
        topic=topic,
        pages=pages,
        theme=theme,
        audience=audience,
        wants=wants,
        extra=extra,
        material=mat,
        type_menu=plan_menu(registry),
        theme_menu=theme_menu(),
        authoring_rules=AUTHORING_RULES,
        perspectives_n=opts.plan_perspectives,
        sections=opts.sections,
        concurrency=opts.concurrency,
    )
    doc = plan.doc
    doc["schemaVersion"] = "1.0"
    doc.setdefault("language", "zh-CN")
    if theme:
        doc["theme"] = theme
    doc.setdefault("id", "lecture")

    placeholders: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for si, s in enumerate(doc.get("scenes", [])):
        s["id"] = s.get("id") or f"s{si}"  # 稳定 scene id：供进度视图 / 版式引用（与 block id 同规）
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
    # 骨架就绪：先发结构（页/块占位）供进度视图搭骨架，再标记规划阶段结束。
    progress(
        {
            "type": "skeleton",
            "doc": {
                "title": doc.get("title"),
                "theme": doc.get("theme"),
                "scenes": [
                    {
                        "id": s.get("id"),
                        "kind": s.get("kind"),
                        "headline": s.get("headline"),
                        "eyebrow": s.get("eyebrow"),
                        "blocks": [
                            {"id": b.get("id"), "type": b.get("type")}
                            for b in (s.get("blocks") or [])
                        ],
                    }
                    for s in doc.get("scenes", [])
                ],
            },
        }
    )
    progress({"type": "stage", "stage": "plan", "status": "done"})

    # ② Fan-out（逐块生成；no_fanout 消融 = 串行）
    conc = opts.concurrency if opts.fanout else 1
    # sim.widget 走独立 plan→build→repair 子配方；预加载一次裁剪版 craft 指引（仅当真有 widget 块）。
    widget_guidelines = ""
    if any(p[0].get("type") == "sim" and p[0].get("engine") == "widget" for p in placeholders):
        sim_reg = registry.get("sim")
        if sim_reg:
            widget_guidelines = load_widget_guidelines(sim_reg.dir)

    progress({"type": "stage", "stage": "fanout", "status": "start", "total": len(placeholders)})

    async def gen(item: tuple[dict[str, Any], dict[str, Any]], _i: int) -> tuple[str, BlockResult]:
        ph, scene = item
        progress(
            {"type": "block", "blockId": ph["id"], "sceneId": scene.get("id"), "status": "active"}
        )
        reg = registry.get(ph["type"])
        if not reg:
            progress({"type": "block", "blockId": ph["id"], "sceneId": scene.get("id"), "status": "err"})
            return ph["id"], BlockResult(None, f"无技能处理 type {ph['type']}")
        if ph["type"] == "sim" and ph.get("engine") == "widget":
            # 逃生舱：直接产 HTML 片段，两阶段（先契约后写码）+ 校验自修，观感钉死 deck 主题。
            r = await generate_widget(
                llm,
                intent=ph.get("intent", ""),
                theme=str(doc.get("theme") or "cartesian"),
                language=str(doc.get("language") or "zh-CN"),
                topic=topic,
                material=mat,
                guidelines=widget_guidelines,
            )
            log(f"  {'✗' if r.err else '✓'} {ph['id']} (sim:widget)")
            _emit_block_done(progress, ph["id"], scene.get("id"), r.err)
            return ph["id"], r
        r = await generate_block(
            llm,
            type=ph["type"],
            intent=ph.get("intent", ""),
            scene_ctx=f"所在页: {scene.get('headline') or scene.get('eyebrow') or scene.get('kind')}",
            contract=reg.contract,
            topic=topic,
            material=mat,
            tools=tool_kit if ph["type"] == "sim" else None,
        )
        log(f"  {'✗' if r.err else '✓'} {ph['id']} ({ph['type']})")
        _emit_block_done(progress, ph["id"], scene.get("id"), r.err)
        return ph["id"], r

    results = await pool(placeholders, conc, gen)
    blocks_by_id = {bid: r.block for bid, r in results}

    # ③ Assemble（回填）
    progress({"type": "stage", "stage": "assemble", "status": "start"})
    dropped = fill_blocks(doc, blocks_by_id)
    attach_icons(doc)  # 确定性收尾：list 项按关键词自动配本地图标（零 LLM/零网络）
    if opts.media:
        await _attach_hero_image(doc, topic, image_finder, image_generator)
    for s in doc.get("scenes", []):  # 每页组装完成 → 转绿
        progress({"type": "docUpdated", "sceneId": s.get("id"), "status": "done"})
    progress({"type": "stage", "stage": "assemble", "status": "done"})

    # ④ 整档校验 + 结构自修（revise 消融可关）
    progress({"type": "stage", "stage": "validate", "status": "start"})
    if opts.revise:
        final = await _doc_repair(
            llm, doc, registry, mat, log, tool_kit, topic=topic,
            concurrency=opts.concurrency, progress=progress,
        )
    else:
        final = validate_doc(doc)
    progress({"type": "docUpdated", "doc": doc, "reason": "validate"})
    progress({"type": "stage", "stage": "validate", "status": "done"})

    # ④.5 讲者备注增强
    if not final.errors:
        progress({"type": "stage", "stage": "notes", "status": "start"})
        await enrich_notes(llm, doc, audience=audience, concurrency=opts.concurrency)
        progress({"type": "stage", "stage": "notes", "status": "done"})

    # ④.7 真机渲染验收 → 溢出页回炉精简（注入了 render_verifier 才跑）
    #
    # 这是流水线唯一的**视觉**反馈点。此前 SPEC 写着「每页 scrollHeight ≤ 720、禁溢出」，
    # 但没有任何东西在执行——溢出的页被渲染器 zoom 到下限后直接裁掉，无人知晓。
    # 注意顺序：必须在 notes 之后，因为回炉会改写 scene 内容，讲者备注要基于最终文本。
    render_report = None
    if render_verifier is not None and opts.render_rounds > 0 and not final.errors:
        progress({"type": "stage", "stage": "render", "status": "start"})
        for rnd in range(1, opts.render_rounds + 1):
            render_report = await render_verifier.verify(json.dumps(doc, ensure_ascii=False))
            bad = {
                int(p["page"]): int(p.get("overflowY") or 0)
                for p in render_report.overflow_pages
                if 0 <= int(p["page"]) < len(doc.get("scenes") or [])
            }
            if not bad:
                log(f"[render] 第 {rnd} 轮: 0 溢出，验收通过")
                break
            log(f"[render] 第 {rnd} 轮: {len(bad)} 页溢出，回炉精简 → {sorted(bad)}")

            async def reflow(item: tuple[int, int], _i: int) -> None:
                idx, px = item
                scene = doc["scenes"][idx]
                progress({"type": "block", "sceneId": scene.get("id"), "status": "err"})
                r = await condense_scene(llm, scene, overflow_px=px, topic=topic)
                if r.scene is not None:
                    doc["scenes"][idx] = r.scene
                    progress({"type": "docUpdated", "sceneId": r.scene.get("id"), "status": "done"})
                else:
                    log(f"[render] 第 {idx} 页精简失败: {r.err}")

            await pool(sorted(bad.items()), opts.concurrency, reflow)
            progress({"type": "docUpdated", "doc": doc, "reason": "reflow"})
        # 回炉后内容变了，重跑整档校验，避免精简引入的结构错逃逸
        final = validate_doc(doc)
        if render_report is not None and render_report.overflow_pages:
            final.warnings.append(
                f"真机渲染仍有 {len(render_report.overflow_pages)} 页溢出（已尽力精简）："
                + ", ".join(f"#{p['page']}({p['overflowY']}px)" for p in render_report.overflow_pages[:8])
            )
        progress({"type": "stage", "stage": "render", "status": "done"})

    # ⑤ 覆盖度审查（opt-in，完成 STORM 闭环）
    cov = None
    if coverage and plan.perspectives and not final.errors:
        progress({"type": "stage", "stage": "coverage", "status": "start"})
        try:
            cov = await check_coverage(llm, doc, plan.perspectives)
        except Exception:  # noqa: BLE001
            pass
        progress({"type": "stage", "stage": "coverage", "status": "done"})

    progress(
        {
            "type": "done",
            "errors": len(final.errors),
            "dropped": len(dropped),
            "coverage": bool(cov),
            "doc": doc,
        }
    )
    return GenerateResult(
        doc=doc,
        errors=final.errors,
        warnings=final.warnings,
        dropped=dropped,
        perspectives=plan.perspectives,
        coverage=cov,
    )
