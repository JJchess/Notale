"""逐页质量审查：以完整 scene + 页 brief 为输入，返回可路由到 block 的问题。

不同于 ppteval 的整档摘要评分，这里不丢公式、图表数据、quiz 解释或兄弟 block；它位于生成
流水线内部，职责是发现并定点回炉，而不只是给实验报一个平均分。
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from typing import Any

from ...ports.llm import LLMClient
from ...utils.jsonio import parse_json

_PAGE_REVIEW_TIMEOUT_S = 360.0


@dataclass
class PageReview:
    score: float = 0.0
    passed: bool = False
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
                limit = 10000
                return value if len(value) <= limit else value[:limit] + f"…[widget HTML truncated; total={len(value)}]"
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
    system = """你是课程页质量门禁，立场严格、具体、可复核。审查完整的一页，而不是只看标题。
按六维逐项检查：
1) 准确性：公式、条件、数值、递推、caption 与解释彼此一致；特例不得冒充一般结论。
   收敛、速率、保证类结论的必要假设（如 L-smooth、凸性、步长范围）必须出现在观众可见的
   headline/lead/formula/caption 中；只藏在 notes、brief 或代码里不算完成。
2) 教学目标：所有 block 共同完成 brief.objective/keyClaim，不能一页塞多条互不依赖的定理。
3) 视觉语义：组件与数据必须真实编码 brief.visualTask；装饰形状不能冒充坐标、轨迹、梯度或因果。
   chart 的 point/arrow 标注坐标必须落在它声称引用的序列点上，除非明确是独立几何向量；由公式命名的合成曲线必须可复算。
   - 箭头/轨迹要结合屏幕坐标映射做一次数值验算；声称“负梯度”时更新位移与梯度的点积必须 < 0。
   - 比喻不能覆盖数学事实：只有真正的局部极大/极小才能标“山顶/谷底”；凸碗上的任意起点应叫山坡初始点，
     不得为了配合下山叙事把非极值点改名为山顶。
   - visualTask 若要求比较多个条件，首帧必须同时看见所有比较对象，或有无需猜测即可切换的明确对照；只显示一个选中状态不算比较。
   - 坐标轴、图例和实际绘制变量必须就是标题/objective 声称解释的量；未经模型推导的 loss/accuracy 不能代替学习率 η(t)。
   - 鞍点/二维曲率结论必须显示至少两个独立方向的相反曲率（或等价二维证据）；单条只向上或只向下的一维切片不能证明鞍点。
   - widget 的公式、参数含义、首帧和关键对照必须在页面上可见并能由 spec/代码复算；漂亮轨迹本身不是证据。
   - widget 不能只验首帧：逐个控件检查初始值、最小值、最大值及关键离散状态；不得出现 NaN/Infinity、空画布、
     越界消失，或因发散极值自动缩放而把教学主体压成不可读的一条线。
4) 证据纪律：未在素材中的论文年份、引语、百分比、基准数字均视为不受支持；示意数据必须明示。
   对 SGD/AdaGrad/RMSProp/Adam/动量等优化器，随手合成的 loss 曲线只能说明“这是一个示意情形”，
   不能据此宣称某方法普遍更快或形成固定性能排名；性能结论必须给出可复算目标、初值与超参数。
   随机梯度噪声在特定条件下可能帮助离开严格鞍点或浅盆地，但不能表述成保证逃离任意局部极小值。
5) 页面密度与语言：主体有足够视觉面积，文字可扫读，无重复；复杂推导若需要多页应报 pageIssue。
   用户可见的 headline/lead/caption/控件应与 doc language 一致；除标准符号和必要专名外，无故中英混排算问题。
6) 测评：quiz 的答案/解释可由页面内容复算，干扰项对应明确误区。

路由纪律：现有 block 内的数据、公式、caption、HTML/JS、箭头方向、坐标映射、首帧状态或文案能修的问题，
一律写 blockIssue 并指向该 block；只有必须改变 block 类型/数量、headline/lead、brief 目标或页面布局时才写 pageIssue。

只输出 JSON：
{"score":0到10,"pass":true或false,
 "blockIssues":[{"blockId":"现有 id","severity":"critical|major|minor","problem":"可验证的问题","instruction":"不改变 block 类型时的具体修法"}],
 "pageIssues":["只有拆页/换页目标/改 block 类型/改布局/改 headline 或 lead 才能解决的问题"]}
pass 仅当六维没有任何 issue（包括 minor）、没有不受支持的具体事实、且达到可直接授课的 9.8/10。每一处扣分都必须给出 blockIssue 或 pageIssue，不能只降分不说明修法。不要虚构外部事实来纠错；不确定时指出需要来源。"""
    payload = {
        "topic": topic,
        "audience": audience,
        "brief": brief,
        "scene": compact_scene(scene),
        "referenceMaterial": material or "[none provided]",
    }
    try:
        raw = parse_json(
            await asyncio.wait_for(
                llm.complete(
                    [
                        {"role": "system", "content": system},
                        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                    ],
                    purpose="quality:page",
                ),
                timeout=_PAGE_REVIEW_TIMEOUT_S,
            )
        )
    except Exception as exc:  # noqa: BLE001 - 质量门应报告失败，不能拖垮整档生成
        return PageReview(page_issues=[f"质量审查失败: {str(exc)[:120]}"])

    issues: list[dict[str, str]] = []
    for item in raw.get("blockIssues") or []:
        if not isinstance(item, dict) or not item.get("blockId"):
            continue
        issues.append(
            {
                "blockId": str(item.get("blockId")),
                "severity": str(item.get("severity") or "major"),
                "problem": str(item.get("problem") or "未说明问题"),
                "instruction": str(item.get("instruction") or "修正问题并保持页目标不变"),
            }
        )
    page_issues = [str(x) for x in (raw.get("pageIssues") or []) if str(x).strip()]
    try:
        score = max(0.0, min(10.0, float(raw.get("score", 0))))
    except (TypeError, ValueError):
        score = 0.0
    if score < 9.8 and not issues and not page_issues:
        page_issues.append("评分低于 9.8，但审查器未给出可执行问题；需要重新审查并说明每一处扣分。")
    passed = bool(raw.get("pass")) and score >= 9.8 and not issues and not page_issues
    return PageReview(score=score, passed=passed, block_issues=issues, page_issues=page_issues)
