"""[4] Verifier 栈 —— fail-closed，便宜的在前。

L0 规则层真实现（成本≈0，确定性）：placeholder / AI 味红旗 / NaN·undefined /
html 非空 / 绑定资料合法性。
L1–L6（执行/学科/交互/视觉/多样性/教学）**未实现**——接口与状态字段预留，
在报告里如实标注，不冒充跑过（宪法 M2：没跑不算过）。

达标是证明不是声称：worker 自报 selfCheckPassed 无效，只有这里的回执算数。
"""

from __future__ import annotations

import re
from artifacts import (
    Globals,
    LayerResult,
    PageArtifact,
    PageSpec,
    PageStatus,
    PrepRecord,
    VerificationReport,
    VerifyStatus,
)
from util import visible_text

MAX_ATTEMPTS = 3  # 返工上限：超限降级安全页 + 人审标记，绝不卡死整本

UNIMPLEMENTED_LAYERS = ["L1", "L2", "L3", "L4", "L5", "L6"]

_PLACEHOLDER = re.compile(r"TODO|FIXME|占位|placeholder|lorem ipsum|待填|xxx+", re.I)
_AI_PHRASES = re.compile(
    r"不是[^，。；]{1,30}而是|本文将探讨|综上所述|赋能|释放潜力|未来已来|众所周知|总而言之"
)
_NAN_UNDEF = re.compile(r"\b(NaN|undefined|null)\b")
_FULL_DOCUMENT = re.compile(r"<!doctype|<\s*(?:html|head|body)\b", re.I)
_REMOTE_ASSET = re.compile(
    r"(?:<\s*(?:script|img|link|source|video|audio)\b[^>]*(?:src|href)\s*=\s*['\"]?https?://|"
    r"@import\s+(?:url\()?\s*['\"]?https?://|url\(\s*['\"]?https?://|"
    r"\b(?:fetch|import)\s*\(\s*['\"]https?://)",
    re.I,
)
_UNAVAILABLE_GLOBAL = re.compile(
    r"\b(?:anime|gsap|d3|THREE|BABYLON|PIXI)\s*(?:\.|\()",
)


def run_l0(page: PageArtifact, valid_record_ids: set[str]) -> LayerResult:
    """规则层：能机器判的绝不给 judge。"""
    failures: list[str] = []
    if not page.html.strip():
        failures.append("html 为空")
    if _FULL_DOCUMENT.search(page.html):
        failures.append("html 必须是单页片段，不能包含 doctype/html/head/body")
    if _REMOTE_ASSET.search(page.html):
        failures.append("html 含远程运行时依赖，离线 deck 无法交付")
    m = _UNAVAILABLE_GLOBAL.search(page.html)
    if m:
        failures.append(f"html 调用了未随 deck 提供的第三方全局：{m.group(0).rstrip('.(')}")
    text = visible_text(page.html)
    if not text:
        failures.append("无可见文本")
    m = _PLACEHOLDER.search(text)
    if m:
        failures.append(f"占位文本：{m.group(0)!r}")
    m = _AI_PHRASES.search(text)
    if m:
        failures.append(f"AI 味红旗：{m.group(0)!r}")
    m = _NAN_UNDEF.search(text)
    if m:
        failures.append(f"可见文本含 {m.group(0)}（运行时值泄漏）")
    unknown = set(page.boundReferences) - valid_record_ids
    if unknown:
        failures.append(f"boundReferences 指向不存在的资料：{sorted(unknown)}")
    return LayerResult(layer="L0", implemented=True, passed=not failures, failures=failures)


def verify_page(
    page: PageArtifact,
    spec: PageSpec,
    globals_: Globals,
    prep_store: dict[str, PrepRecord],
) -> VerificationReport:
    """整栈回执：L0 真跑；L1–L6 如实标 not-implemented。"""
    layers = [run_l0(page, set(prep_store))]
    layers += [
        LayerResult(layer=name, implemented=False, note="未实现——见 quality-report 的如实标注")
        for name in UNIMPLEMENTED_LAYERS
    ]
    implemented_pass = all(l.passed for l in layers if l.implemented)
    status = VerifyStatus.VERIFIED if implemented_pass else VerifyStatus.RETURNED_FOR_REPAIR
    new_failure = [] if implemented_pass else layers[0].failures
    return VerificationReport(
        pageId=page.pageId, layers=layers, status=status, newFailure=new_failure
    )


_FALLBACK_TEMPLATE = """<section class="page fallback" data-page-id="{page_id}">
  <h2>{title}</h2>
  <p>{message}</p>
  {prep_block}
  <p class="fallback-note">⚠ 本页为降级安全页（{reason}），已进人审队列。</p>
</section>"""


def make_fallback_page(spec: PageSpec, prep_store: dict[str, PrepRecord], reason: str) -> PageArtifact:
    """降级安全页：固定模板，丑但正确；标记待人工，绝不静默混入。"""
    prep_block = "\n".join(
        f'<blockquote data-record="{rid}">{prep_store[rid].content}</blockquote>'
        for rid in spec.boundPrepRecords
        if rid in prep_store
    )
    html = _FALLBACK_TEMPLATE.format(
        page_id=spec.pageId,
        title=spec.centralMessage[:40],
        message=spec.centralMessage,
        prep_block=prep_block,
        reason=reason,
    )
    return PageArtifact(
        pageId=spec.pageId,
        designSpec={"layout": "fallback"},
        html=html,
        boundReferences=list(spec.boundPrepRecords),
        status=PageStatus.DEGRADED,
    )
