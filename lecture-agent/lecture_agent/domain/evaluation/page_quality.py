"""逐页质量审查：以完整 scene + 页 brief 为输入，返回可路由到 block 的问题。

不同于 ppteval 的整档摘要评分，这里不丢公式、图表数据、quiz 解释或兄弟 block；它位于生成
流水线内部，职责是发现并定点回炉，而不只是给实验报一个平均分。
"""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass, field
from typing import Any

from ...ports.llm import LLMClient, Message
from ...utils.jsonio import parse_json

_PAGE_REVIEW_TIMEOUT_S = 360.0
_PAGE_PASS_SCORE = 8.5


@dataclass
class PageReview:
    score: float = 0.0
    passed: bool = False
    available: bool = True
    failure: str = ""
    block_issues: list[dict[str, str]] = field(default_factory=list)
    page_issues: list[str] = field(default_factory=list)


def compact_scene(scene: dict[str, Any]) -> dict[str, Any]:
    """保留可审的语义/数据，裁掉对审查无帮助的大 HTML/图片。"""

    def compact(value: Any, key: str = "") -> Any:
        if isinstance(value, dict):
            return {str(k): compact(v, str(k)) for k, v in value.items() if k != "image"}
        if isinstance(value, list):
            return [compact(v, key) for v in value]
        if isinstance(value, str):
            if key == "html":
                # CSS dominates most generated widgets but contributes little to semantic review.
                # Removing it preserves the controls, model and final initial-render call; the old
                # first-10k truncation usually sent only CSS and made the reviewer guess at behavior.
                semantic = re.sub(
                    r"<style\b[^>]*>[\s\S]*?</style>",
                    "<!-- STYLE PRESENT IN ORIGINAL; OMITTED ONLY FROM SEMANTIC REVIEW -->",
                    value,
                    flags=re.I,
                )
                limit = 18000
                if len(semantic) <= limit:
                    return semantic
                half = limit // 2
                return (
                    semantic[:half]
                    + f"…[widget middle omitted; semantic={len(semantic)}, original={len(value)}]…"
                    + semantic[-half:]
                )
            limit = 2200 if key in {"source", "computeJs"} else 3200
            return value if len(value) <= limit else value[:limit] + "…[truncated]"
        return value

    result = compact(scene)
    if not isinstance(result, dict):  # scene 入口恒为 dict；显式收窄也守住类型契约
        return {}
    return result


async def review_page(
    llm: LLMClient,
    *,
    topic: str,
    scene: dict[str, Any],
    brief: dict[str, str],
    audience: str = "",
    material: str = "",
) -> PageReview:
    """审查一页并把可修问题定位到 block id；解析失败按不通过处理。"""
    system = """你是跨学科课程页的语义质量门禁，立场严格、具体、可复核。审查完整的一页，而不是只看标题。
按六维逐项检查：
1) 准确性：公式、条件、数值、代码、图中编码、caption 与解释彼此一致；特例不得冒充一般结论。
   任何保证、因果或比较结论的必要条件必须出现在观众可见内容中；只藏在 notes/brief 不算完成。
2) 教学目标：所有 block 共同完成 brief.objective/keyClaim，不能一页塞多条互不依赖的定理。
   必须检查 brief.learningAction 与 requiredEvidence：页面应让学生执行声明的动作并看见或产出相应证据。
   只读 code 不能证明 implement/run/debug；没有可操作输入的静态图不能证明 manipulate/experiment。
   若目标是实现算法，runnable 的可见 starter 必须暴露要学习/修改的核心决策；把核心算法完整藏进
   pythonPreamble/jsPreamble、只让学生改测试数据，不算“实现”。preamble 只应承载数据、I/O、绘图和脚手架。
3) 视觉语义：组件与数据必须真实编码 brief.visualTask；装饰形状不能冒充坐标、轨迹、梯度或因果。
   - 状态序列/结构变换必须由 state-sim 呈现可步进前后态；精确关系用 diagram/graph；定量证据用 chart；
     参数因果用 model-sim；执行结果用 runnable。media 不能替代这些证据能力。
   - visualTask 若要求比较多个条件，首帧必须同时看见所有比较对象，或提供清晰且可复验的切换对照。
   - 坐标轴、图例、节点/边、状态高亮和实际变量必须就是标题/objective 声称解释的量。
   - widget 的状态模型、参数含义、初态、转移、复位和关键验证应能由保留的 HTML/JS 复算。
     像素裁切、空首帧、控件失效由后续真实浏览器门负责；不要因为代码被明确标注为中段省略就凭空判错。
4) 证据纪律：未在素材中的论文年份、引语、百分比、基准数字均视为不受支持；示意数据必须明示。
   合成数据/示意模型只能说明该设定下的现象，不能据此声称普遍性能排名或真实世界事实。
5) 页面密度与语言：主体有足够视觉面积，文字可扫读，无重复；复杂推导若需要多页应报 pageIssue。
   用户可见的 headline/lead/caption/控件应与 doc language 一致；除标准符号和必要专名外，无故中英混排算问题。
   artboard 的 col/row 是 CSS Grid 线坐标，不是占用格编号：12 行网格的合法线范围是 1..13，
   因此 row:[12,13] 合法。不要仅凭布局 JSON 猜测裁切或越界；像素溢出由后续真实浏览器门判断。
6) 测评：quiz 的答案/解释可由页面内容复算，干扰项对应明确误区。

路由纪律：现有 block 内的数据、公式、caption、HTML/JS、箭头方向、坐标映射、首帧状态或文案能修的问题，
一律写 blockIssue 并指向该 block；只有必须改变 block 类型/数量、headline/lead、brief 目标或页面布局时才写 pageIssue。

只输出 JSON：
{"score":0到10,"pass":true或false,
 "blockIssues":[{"blockId":"现有 id","severity":"critical|major|minor","problem":"可验证的问题","instruction":"不改变 block 类型时的具体修法"}],
 "pageIssues":["只有拆页/换页目标/改 block 类型/改布局/改 headline 或 lead 才能解决的问题"]}
pass 表示达到可直接授课的 8.5/10：不得有 critical/major 或 pageIssue；最多允许两个不妨碍学习证据的 minor。
每一处实质扣分都必须给出 blockIssue 或 pageIssue，不能只降分不说明修法。不要虚构外部事实来纠错；不确定时指出需要来源。"""
    payload = {
        "topic": topic,
        "audience": audience,
        "brief": brief,
        "scene": compact_scene(scene),
        "referenceMaterial": material or "[none provided]",
    }
    messages: list[Message] = [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]
    try:
        raw_text = await asyncio.wait_for(
            llm.complete(messages, purpose="quality:page"),
            timeout=_PAGE_REVIEW_TIMEOUT_S,
        )
        try:
            raw = parse_json(raw_text)
        except (ValueError, json.JSONDecodeError):
            # Models occasionally put an unescaped LaTeX backslash in issue
            # prose. Preserve the judgment and repair only its JSON encoding.
            repair_messages: list[Message] = [
                *messages,
                {"role": "assistant", "content": raw_text},
                {
                    "role": "user",
                    "content": (
                        "上条不是合法 JSON。保持 score/pass、blockId、severity、问题和修法含义不变，"
                        "正确转义反斜杠，只输出合法 JSON 对象。"
                    ),
                },
            ]
            repaired_text = await asyncio.wait_for(
                llm.complete(
                    repair_messages,
                    purpose="quality:page-json-repair",
                ),
                timeout=_PAGE_REVIEW_TIMEOUT_S,
            )
            raw = parse_json(repaired_text)
        if not isinstance(raw, dict) or "score" not in raw:
            raise ValueError("质量审查 JSON 缺少 score")
    except Exception as exc:  # noqa: BLE001 - 质量门应报告失败，不能拖垮整档生成
        detail = str(exc).strip() or type(exc).__name__
        return PageReview(available=False, failure=f"质量审查失败: {detail[:120]}")

    issues: list[dict[str, str]] = []
    for item in raw.get("blockIssues") or []:
        if not isinstance(item, dict) or not item.get("blockId"):
            continue
        severity = str(item.get("severity") or "major").strip().lower()
        if severity not in {"critical", "major", "minor"}:
            severity = "major"
        issues.append(
            {
                "blockId": str(item.get("blockId")),
                "severity": severity,
                "problem": str(item.get("problem") or "未说明问题"),
                "instruction": str(item.get("instruction") or "修正问题并保持页目标不变"),
            }
        )
    page_issues = [str(x) for x in (raw.get("pageIssues") or []) if str(x).strip()]
    try:
        score = max(0.0, min(10.0, float(raw.get("score", 0))))
    except (TypeError, ValueError):
        score = 0.0
    if score < _PAGE_PASS_SCORE and not issues and not page_issues:
        page_issues.append(
            f"评分低于 {_PAGE_PASS_SCORE:.1f}，但审查器未给出可执行问题；需要重新审查并说明扣分。"
        )
    blocking = [item for item in issues if item["severity"] in {"critical", "major"}]
    minor_count = sum(item["severity"] == "minor" for item in issues)
    passed = score >= _PAGE_PASS_SCORE and not blocking and not page_issues and minor_count <= 2
    return PageReview(score=score, passed=passed, block_issues=issues, page_issues=page_issues)
