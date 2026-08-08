"""[3] Per-page fan-out —— 一页一 agent 并联；worker 只写自己那一页。

上下文编译器给每个 worker 编译最小上下文：自身 spec + 锁定 globals + 邻页一句话摘要 +
已覆盖概念 + 绑定资料全文。返工时带全部历史反例（counterexample-ledger 的
activeConstraints）作为强约束——反例制导，不是重试。
"""

from __future__ import annotations

from dataclasses import dataclass, field

from agents.base import render_skills_block
from agents.profiles import BUILDER
from artifacts import Globals, PageArtifact, PageContext, PageSpec, PageStatus, PrepRecord
from llm import LLMClient
from util import extract_json

_BUILDER_SKILL_BLOCK: str | None = None  # 懒加载缓存：skill 文件运行期不变


def _builder_skill_block() -> str:
    """BUILDER 画像渲染出的 skill 块（清单 + SKILL.md 全文），追加到每页 prompt。"""
    global _BUILDER_SKILL_BLOCK
    if _BUILDER_SKILL_BLOCK is None:
        _BUILDER_SKILL_BLOCK = render_skills_block(BUILDER.skills)
    return _BUILDER_SKILL_BLOCK

_PROMPT = """你是讲义页面 builder。只负责这一页，不许涉及其他页的内容。

【页规格】
pageId: {page_id}｜页型: {page_type}
唯一中心信息：{central_message}
学习动作：{learning_action}｜视觉主体：{visual_subject}
时间预算：{time_budget} 秒

【全局约定（锁定，不许改）】
术语：{terminology}
符号：{notation}
风格 token：{style_tokens}
批准组件：{component_api}
视觉方向：{art_direction}

【邻页摘要】上一页：{prev}｜下一页：{next}
【已覆盖概念（不许重复讲）】{covered}

【绑定的备课资料（页面上的东西必须出自这里，找不到出处 = 编的）】
{prep_full}
{constraints}
输出 JSON：
{{
  "designSpec": {{"layout": "…", "density": "…"}},
  "html": "1280×720 单页自包含 HTML 片段（内联 CSS/原生 JS；不要 doctype/html/head/body；禁止 CDN、远程字体、远程图片、fetch/import；运行时不提供 anime/gsap/d3/THREE/BABYLON/PIXI 等第三方全局，动画必须用 Web Animations API、CSS 或原生 requestAnimationFrame；不许用占位文本；不许出现 NaN/undefined）",
  "interactionParams": {{若含交互：对组件模板的参数取值}},
  "boundReferences": ["实际用到的 recordId"],
  "speakerNotes": "讲稿素材"
}}
只输出 JSON。"""

_CONSTRAINT_BLOCK = """
【历史反例（硬约束——下列失败已发生过，本次生成必须全部避开）】
{items}
"""


def compile_context(
    spec: PageSpec,
    globals_: Globals,
    all_specs: list[PageSpec],
    prep_store: dict[str, PrepRecord],
) -> PageContext:
    idx = next(i for i, s in enumerate(all_specs) if s.pageId == spec.pageId)
    neighbor = {
        "prev": all_specs[idx - 1].centralMessage if idx > 0 else "（首页）",
        "next": all_specs[idx + 1].centralMessage if idx < len(all_specs) - 1 else "（末页）",
    }
    covered = [s.centralMessage for s in all_specs[:idx]]
    relevant = [prep_store[rid] for rid in spec.boundPrepRecords if rid in prep_store]
    return PageContext(
        pageSpec=spec,
        globals=globals_,
        neighborSummary=neighbor,
        coveredConcepts=covered,
        relevantPrepRecords=relevant,
    )


@dataclass
class BuildOutput:
    page: PageArtifact
    events: list[dict] = field(default_factory=list)


async def build_page(
    llm: LLMClient,
    context: PageContext,
    active_constraints: list[str] | None = None,
) -> BuildOutput:
    spec = context.pageSpec
    g = context.globals
    prep_full = (
        "\n".join(f"- {r.recordId}: {r.model_dump_json()}" for r in context.relevantPrepRecords)
        or "（本页未绑定资料——只许讲 spec 里的中心信息，不许加断言）"
    )
    constraints = ""
    if active_constraints:
        constraints = _CONSTRAINT_BLOCK.format(
            items="\n".join(f"- {c}" for c in active_constraints)
        )

    out = await llm.complete(
        [
            {
                "role": "user",
                "content": _PROMPT.format(
                    page_id=spec.pageId,
                    page_type=spec.pageType.value,
                    central_message=spec.centralMessage,
                    learning_action=spec.learningAction,
                    visual_subject=spec.visualSubject,
                    time_budget=spec.timeBudgetSec,
                    terminology=g.terminology,
                    notation=g.notation,
                    style_tokens=g.styleTokens,
                    component_api=g.componentAPI,
                    art_direction=g.artDirection,
                    prev=context.neighborSummary.get("prev", ""),
                    next=context.neighborSummary.get("next", ""),
                    covered="、".join(context.coveredConcepts) or "（无）",
                    prep_full=prep_full,
                    constraints=constraints,
                )
                + "\n\n"
                + _builder_skill_block(),
            }
        ],
        purpose=f"build:{spec.pageId}",
    )
    data = extract_json(out)
    events: list[dict] = []

    valid_ids = {r.recordId for r in context.relevantPrepRecords}
    bound = [b for b in data.get("boundReferences", []) if b in valid_ids]
    dropped = set(data.get("boundReferences", [])) - set(bound)
    if dropped:
        events.append(
            {"kind": "page-binding-dropped", "pageId": spec.pageId, "dropped": sorted(dropped)}
        )

    page = PageArtifact(
        pageId=spec.pageId,
        designSpec=data.get("designSpec") or {},
        html=str(data.get("html", "")),
        interactionParams=data.get("interactionParams") or {},
        boundReferences=bound,
        speakerNotes=str(data.get("speakerNotes", "")),
        status=PageStatus.DRAFTED,
    )
    return BuildOutput(page=page, events=events)
