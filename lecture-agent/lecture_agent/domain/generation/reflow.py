"""版面回炉：把「真机测出来溢出」的页精简到能放下。

SPEC 的红线是「溢出页 → 按 §5.1 拆页或精简，**而不是缩字号**」。渲染器那侧的 zoom fit
有 0.72/0.6 下限，触底仍溢出就只能裁掉——学生看不到底部。所以真正的解法必须回到内容侧。

本模块实现两条中的「精简」：按真机量出的溢出像素估算要砍多少，让模型在**保持讲授完整性**的
前提下压缩该页。拆页（一页拆两页）会改变页数、scene id 与版式引用，牵动 layout/anchor，
留待后续——现阶段若精简到极限仍溢出，如实报错，不假装修好。

只依赖 ports.LLMClient，可注入 fake 测试。
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from ...ports.llm import LLMClient, Message
from ...schema.validate import validate_doc
from ...utils.jsonio import parse_json

_SYS = (
    "你是 LectureDoc 版面精简器。给你一页（scene）的 JSON 与它在 1280×720 舞台上的实测溢出像素，"
    "把这一页压到能放下。只输出**该 scene 的 JSON 对象**，不要代码围栏、不要解释。\n"
    "硬规则：\n"
    "1) 只能删减/改写内容，**不许**改 scene.id、各 block 的 id 与 type，也不许增删 block 的数量顺序"
    "（版式 layout 按 id 引用它们，动了会散架）。\n"
    "2) 优先做：合并啰嗦句、砍掉重复例子、缩短 list 条目文字、删掉最不关键的 1-2 个 list/timeline 条目。\n"
    "3) 禁止：删掉整个论点、把正文换成占位符、用省略号糊弄、改小字号类字段（titleSize/latexSize 等）。\n"
    "4) 若是公式横向裁切，保持数学等价，但把过长 latex 改写成 aligned/gathered 多行推导或更紧凑的等价式；"
    "不能仅删解释文字，因为那不会改变公式宽度。\n"
    "5) 讲授完整性优先于字数：宁可删一个次要条目，也不要把每条都砍成半句话。"
)


@dataclass
class ReflowResult:
    scene: dict[str, Any] | None
    err: str | None = None


def _shrink_hint(overflow_px: int, stage_px: int = 720) -> str:
    """把溢出像素翻译成模型能照做的量。纯像素对模型没有直觉，给百分比更可执行。"""
    ratio = min(0.6, max(0.08, overflow_px / float(stage_px)))
    return f"约需压缩 {round(ratio * 100)}% 的内容体量（实测溢出 {overflow_px}px / 舞台高 {stage_px}px）"


async def condense_scene(
    llm: LLMClient,
    scene: dict[str, Any],
    *,
    overflow_px: int,
    topic: str = "",
    rounds: int = 2,
) -> ReflowResult:
    """精简一页到能放下。返回新 scene；失败返回 err 并保留原页（绝不返回半成品）。"""
    original = json.dumps(scene, ensure_ascii=False)
    keep_ids = [b.get("id") for b in (scene.get("blocks") or []) if isinstance(b, dict)]
    user = (
        (f"课题：{topic}\n" if topic else "")
        + f"{_shrink_hint(overflow_px)}\n"
        + f"必须原样保留的 block id 与顺序：{keep_ids}\n\n"
        + f"当前 scene JSON：\n{original}"
    )

    last_err = "未知错误"
    for rnd in range(rounds):
        msgs = [Message(role="system", content=_SYS), Message(role="user", content=user)]
        if rnd:
            msgs.append(Message(role="user", content=f"上一轮不合格：{last_err}。请重新输出该 scene。"))
        try:
            raw = await llm.complete(msgs, purpose="quality:reflow")
        except Exception as e:  # noqa: BLE001
            return ReflowResult(None, f"LLM 调用失败: {e}")
        try:
            cand = parse_json(raw)
        except (ValueError, json.JSONDecodeError) as e:
            last_err = f"输出不是合法 JSON: {e}"
            continue
        if not isinstance(cand, dict):
            last_err = "输出不是 JSON 对象"
            continue
        if cand.get("id") != scene.get("id"):
            last_err = "scene.id 被改动"
            continue
        new_ids = [b.get("id") for b in (cand.get("blocks") or []) if isinstance(b, dict)]
        if new_ids != keep_ids:
            last_err = f"block id/顺序被改动（应为 {keep_ids}，得到 {new_ids}）"
            continue
        # 用整档校验器校这一页：把它塞进一个最小 doc 外壳，复用同一套语义闸
        probe = validate_doc({"version": 1, "title": "probe", "scenes": [cand]})
        scene_errs = [e for e in probe.errors if ".scenes[0]" in e]
        if scene_errs:
            last_err = "；".join(scene_errs[:3])
            continue
        return ReflowResult(cand)
    return ReflowResult(None, last_err)
