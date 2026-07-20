"""`sim.widget` 生成子配方：plan→build→repair 内循环（借鉴 GenUI，见 viewer/schema/SPEC.md §7.1）。

widget 是唯一让 agent **直接产 HTML/JS** 的 block，故它不走 blocks.py 的通用单块循环，而是两阶段：
① 先产结构化契约（先想清楚再写码），② 再按契约写自包含片段，③ 过现有 validate_block，④ 把带路径
的错误喂回 ② 自修（≤rounds）。

与 GenUI 的关键分道：
- **观感钉死在 deck 主题**——片段读运行时注入 iframe 的 `--token`（见 guidelines/interactive.md），
  不像 GenUI 逐组件从 8 项 aesthetic_direction 里选调色板（lecture 要一致性，SPEC §8）。
- **离线零依赖 vanilla**——禁 CDN/图表库；靠 iframe sandbox 隔离而非净化。
- 复用本地 `schema.validate.validate_block`（内走 `_check_widget_html` + 反 slop lint），不新写校验器。

**不注入 AUTHORING_RULES**：那条规则明令「只用 inline-md、禁原始 HTML」，与 widget 的本质（就是产
原始 HTML）相悖——widget 是那条设计意图下受控的例外。
"""

from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path
from typing import Any

from ...ports.llm import LLMClient, Message
from ...schema.validate import validate_block
from ...utils.jsonio import parse_json
from .blocks import BlockResult

# guidelines/ 下四份指引（craft 通则 / 交互实现 / 主题 register / 读 token 的范例片段）。
_GUIDELINE_MD = ("craft-core.md", "interactive.md", "registers.md")
_GUIDELINE_EXAMPLE = "example.html"

_BUILD_SYS = (
    "你是 lecture 互动组件(sim.widget)生成器。只输出**一个自包含 HTML 片段**"
    "（顺序 <style>→markup→<script>）：不要 markdown 代码围栏、不要 JSON、不要任何解释文字。"
    "不要 <!doctype>/<html>/<head>/<body>（运行时会包进 iframe）。"
)
_PLAN_SYS = (
    "你是 lecture 互动组件(sim.widget)的设计规划器。先想清楚结构再写码，本步**不写 HTML**，"
    "只输出一个结构化契约 JSON 对象：不要代码围栏、不要解释。"
)


def load_widget_guidelines(skill_dir: str | Path) -> str:
    """读 create-sim/guidelines/ 下的裁剪版 craft 指引，拼成一份注入 build 提示的 bundle。

    file I/O 留在这个 helper 里（与 skills/registry.py、domain/media/icons.py 同类惯例），
    好让 generate_widget 只吃一个字符串、可用 fake LLM 无 I/O 单测。
    """
    gdir = Path(skill_dir) / "guidelines"
    parts: list[str] = []
    for name in _GUIDELINE_MD:
        p = gdir / name
        if p.exists():
            parts.append(p.read_text(encoding="utf-8").strip())
    ex = gdir / _GUIDELINE_EXAMPLE
    if ex.exists():
        parts.append(
            "## 范例片段（读 token 的阻尼单摆——注意 update()、rAF 动画、颜色全走 --token）\n"
            "```html\n" + ex.read_text(encoding="utf-8").strip() + "\n```"
        )
    return "\n\n---\n\n".join(parts)


def _plan_prompt(*, intent: str, topic: str, material: str) -> str:
    anchor = f"所在讲义课题：「{topic}」。" if topic else ""
    mat = f"\n参考素材（内容/数据据此，别编造）：\n{material}" if material else ""
    return f"""{anchor}本互动组件的教学意图：{intent}。{mat}

想清楚什么让它成为一个好的**演示**而非静态图：对概念/技术题材，学生要能动一下、看见后果；一块静态\
标注图配「点击看文字」是失败模式。CLARITY BEATS RICHNESS——核心概念读得清晰无歧义压倒一切，别加\
让主视觉更难读的多余控件；拿不准就砍。

只返回一个 JSON 对象（无 markdown 围栏）：
{{
  "core_insight": "<一句：用完组件后学生该看懂的那一件事>",
  "render_medium": "svg | canvas",
  "render_medium_reason": "<短：为什么这个介质配这个主视觉；几何/结构→svg，粒子/场/连续运动→canvas>",
  "state_model": [{{"name":"<jsVar>","type":"int|float|bool|string|array","range":"<如 0..0.2>","init":"<具体初值>"}}],
  "interactions": [{{"trigger":"<元素+事件，如 range#damp input>","effect":"<改哪个 state、主视觉如何变>"}}],
  "update": "<一句：单一 update() 从当前 state 重推整幅画面——svg 设哪些命名元素 / canvas 重绘什么>",
  "initial_paint": "<首帧画面（用 state 初值），且是 mid-action：系统已走一步，绝非清零仪表盘或空舞台等点击>"
}}
每个字符串短而具体。state_model 里取的名字**就是**实现时要用的变量名。"""


def _build_prompt(
    *, intent: str, topic: str, theme: str, language: str, contract: str, guidelines: str
) -> str:
    anchor = f"所在讲义课题：「{topic}」。" if topic else ""
    return f"""{anchor}本互动组件的教学意图：{intent}。

用户可见文案（按钮/标签/图注）一律用讲义语言：{language}；代码标识符/JSON 键保持 ASCII。
deck 主题（**观感钉死于此，颜色全从注入的 --token 出**）：{theme}

要忠实实现的结构契约（别重新设计；用契约里的 state 变量名；每个 interaction 接到真实事件 handler；\
所有更新走契约描述的**单一 update()**；按 render_medium 选 svg/canvas）：
{contract}

实现规范（craft 通则 + 交互/canvas/SVG + 主题 register + 范例）：
{guidelines}

硬规则复述：零依赖纯 vanilla（canvas/SVG + 原生 JS，禁 CDN/库）；颜色一律 `var(--token)` 或 canvas 里\
`getComputedStyle(document.documentElement).getPropertyValue('--ink'|'--accent'|'--line'|'--bg'…)`，禁写死色值；\
控件长在片段内；要有动效（transition/animation/requestAnimationFrame）；无自我介绍 `<h1>`；无「提示：」胶囊；\
禁 `@media (prefers-color-scheme)`；填满 iframe 且不出现内部滚动条。

只输出 HTML 片段本身，`<style>` 在前、markup 居中、`<script>` 在后。片段至少含 <div>/<svg>/<canvas>/<style> 之一。"""


def _extract_fragment(raw: str) -> str:
    """从 build 回复里抽出 HTML 片段：容忍模型套 ```html 围栏或（仿 GenUI）<widget_code> 标签。"""
    t = str(raw or "").strip()
    m = re.search(r"<widget_code>\s*([\s\S]*?)\s*</widget_code>", t)
    if m:
        return m.group(1).strip()
    t = re.sub(r"^```[a-zA-Z]*\n?", "", t)
    t = re.sub(r"\n?```$", "", t)
    return t.strip()


async def generate_widget(
    llm: LLMClient,
    *,
    intent: str,
    theme: str,
    language: str = "zh-CN",
    topic: str = "",
    material: str = "",
    guidelines: str = "",
    rounds: int = 3,
) -> BlockResult:
    """两阶段生成一个 `sim.widget` block：① 契约 → ②build/③validate/④repair 循环。"""
    # ① 契约（先想清楚再写码）。产不出合法 JSON 也不致命——退化成无契约，build 仍可工作。
    contract_str = "（本次未产出结构化契约，直接按意图与规范实现）"
    try:
        raw = await llm.complete(
            [
                {"role": "system", "content": _PLAN_SYS},
                {
                    "role": "user",
                    "content": _plan_prompt(intent=intent, topic=topic, material=material),
                },
            ],
            json_mode=True,
            purpose="widget:plan",
        )
        contract = parse_json(raw)
        if isinstance(contract, dict) and contract:
            contract_str = json.dumps(contract, ensure_ascii=False, indent=2)
    except Exception:  # noqa: BLE001 —— 契约是加分项，拿不到就退化，不阻断 build
        pass

    # ②③④ build → validate → repair
    messages: list[Message] = [
        {"role": "system", "content": _BUILD_SYS},
        {
            "role": "user",
            "content": _build_prompt(
                intent=intent,
                topic=topic,
                theme=theme,
                language=language,
                contract=contract_str,
                guidelines=guidelines,
            ),
        },
    ]
    for rnd in range(1, rounds + 1):
        last = rnd == rounds
        try:
            raw = await llm.complete(
                messages, json_mode=False, purpose=("widget:build" if rnd == 1 else "widget:repair")
            )
        except Exception as e:  # noqa: BLE001
            if last:
                return BlockResult(None, f"LLM 调用失败: {str(e)[:80]}")
            await asyncio.sleep(1.0)
            continue

        fragment = _extract_fragment(raw)
        block: dict[str, Any] = {"type": "sim", "engine": "widget", "html": fragment}
        res = validate_block(block, "sim")
        # widget 的 machine-tells（<h1>/无动效/prefers-color-scheme/桩色）是 warning 而非 error——
        # 但它们正是反 slop 质量闸，非末轮一并回炉修（对齐 GenUI validation_repair）；末轮只剩
        # warning 则 best-effort 收下不丢内容（同 blocks.py 的截断处理）。
        issues = res.errors + res.warnings
        if not issues:
            return BlockResult(block, warns=[])
        if last:
            if res.errors:
                return BlockResult(None, "; ".join(res.errors))
            return BlockResult(block, warns=res.warnings)  # 只剩 warning → best-effort 收下
        messages.append({"role": "assistant", "content": fragment})
        messages.append(
            {
                "role": "user",
                "content": "widget 片段有以下问题需修正：\n"
                + "\n".join(issues)
                + "\n修正后只重新输出该 HTML 片段（仍不要围栏/JSON/解释）。",
            }
        )
    return BlockResult(None, "未知失败")
