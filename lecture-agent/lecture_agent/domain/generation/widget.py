"""`sim.widget` 生成子配方：plan→build→repair 内循环（借鉴 GenUI，见 viewer/schema/SPEC.md §7.1）。

widget 是唯一让 agent **直接产 HTML/JS** 的 block，故它不走 blocks.py 的通用单块循环，而是两阶段：
① 先产结构化契约（先想清楚再写码），② 再按契约写自包含片段，③ 过现有 validate_block，④ 把带路径
的错误喂回 ② 自修（≤rounds）。

与 GenUI 的关键分道：
- **观感钉死在 deck 主题**——片段读取运行时注入 iframe 的 `--token`；完整视觉规则来自
  `domain/generation/generative_ui/guidelines/fragments/` 的唯一共享核心，
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
from .generative_ui import (
    build_planning_prompt as genui_planning_prompt,
)
from .generative_ui import (
    build_primary_prompt as genui_primary_prompt,
)
from .generative_ui import (
    build_validation_repair_prompt as genui_validation_repair_prompt,
)
from .generative_ui import (
    infer_widget_type,
    parse_split_response,
    payload_validation_errors,
)

_WIDGET_PLAN_TIMEOUT_S = 120.0
_WIDGET_BUILD_TIMEOUT_S = 240.0
_WIDGET_PLAN_ROUNDS = 2

_BUILD_SYS = (
    "你是 lecture 互动组件(sim.widget)生成器。严格按用户提示输出两部分：先元数据 JSON，再输出"
    "<widget_code> 包裹的自包含 HTML 片段。不要 markdown 围栏或额外解释。"
    "片段不要 <!doctype>/<html>/<head>/<body>（LectureDoc 运行时会包进 iframe）。"
)
_REPAIR_SYS = (
    "你是 lecture 互动组件(sim.widget)代码修复器。只输出一个自包含 HTML 片段："
    "<style>→markup→<script>；不要围栏、JSON、解释或完整 HTML 文档标签。"
)
_PLAN_SYS = (
    "你是 lecture 互动组件(sim.widget)的设计规划器。先想清楚结构再写码，本步**不写 HTML**，"
    "只输出一个结构化契约 JSON 对象：不要代码围栏、不要解释。"
)


def load_widget_guidelines(skill_dir: str | Path) -> str:
    """兼容旧调用点，但不再把旧 craft/register/example 与完整 GenUI bundle 重复注入。

    宿主差异只由本模块的 LectureDoc host adapter 声明；vendored GenUI core 是唯一审美/交互内核。
    ``skill_dir`` 保留在签名中，避免破坏 registry 与第三方调用方。
    """
    _ = skill_dir
    return ""


def _plan_prompt(*, intent: str, topic: str, material: str) -> str:
    anchor = f"所在讲义课题：「{topic}」。" if topic else ""
    query = f"{anchor}本互动组件的教学意图：{intent}。"
    recent = f"参考素材（内容/数据据此，别编造）：\n{material}" if material else ""
    base = genui_planning_prompt(query=query, widget_type="interactive", recent_context=recent)
    return base + """

---

LectureDoc host extension（优先于上面的通用 schema）：返回同一个 JSON 对象，但必须额外加入：
{
  "visible_encodings": [{"quantity":"标题/objective 声称解释的量","mark":"轴/曲线/点/箭头/文本","where":"首帧位置或图例"}],
  "comparison_states": ["若目标要求比较，逐项列出首帧必须同时可见的状态；否则空数组"],
  "interaction_loop": {"action":"学习者的具体操作","model_update":"操作如何改变 state_model","visible_change":"哪一个视觉编码立即变化","history":"如何保留前态/当前态或 before→after 映射","reset":"如何确定性回到同一初态"},
  "math_model": {"formula":"主公式；非数学题写 none","screen_mapping":"数学坐标到屏幕坐标，尤其 y 轴符号","invariants":["必须恒真的关系"]},
  "verification_cases": [{"input":"具体状态/参数","expected":"可复算结果或符号关系"}]
}
并把通用字段 render_contract 同值复制为 update。若 objective/intent 含“比较”，comparison_states 不得为空，
initial_paint 必须同时出现全部状态；不得靠学生拖动滑块后脑补对照。数学题的 screen_mapping、invariants、
verification_cases 均不得为空。所有题型的 interaction_loop 五项和 verification_cases 都不得为空；用例至少覆盖
首帧中间态、一次有效转移、复位，数值控件再覆盖最小/最大边界。声明的整个范围必须保持
有限、非空且可读。发散系统应缩短到有教学意义的范围，不能让极端值把主图压成一条线。只输出完整 JSON 对象。"""


def _contract_problem(contract: Any) -> str:
    """拒绝不可审计的 widget 设计契约；坏契约不能静默降级成自由写码。"""
    if not isinstance(contract, dict):
        return "顶层不是对象"
    for key in ("core_insight", "render_medium", "update", "initial_paint"):
        if not str(contract.get(key) or "").strip():
            return f"缺少 {key}"
    if contract.get("render_medium") not in {"svg", "canvas"}:
        return "render_medium 只能是 svg 或 canvas"
    for key in ("state_model", "interactions", "visible_encodings", "comparison_states", "verification_cases"):
        if not isinstance(contract.get(key), list):
            return f"{key} 必须是数组"
    if not contract["state_model"] or not contract["interactions"] or not contract["visible_encodings"]:
        return "state_model/interactions/visible_encodings 不得为空"
    interaction_loop = contract.get("interaction_loop")
    if not isinstance(interaction_loop, dict):
        return "interaction_loop 必须是对象"
    for key in ("action", "model_update", "visible_change", "history", "reset"):
        if not str(interaction_loop.get(key) or "").strip():
            return f"interaction_loop 缺少 {key}"
    if not contract["verification_cases"]:
        return "verification_cases 不得为空（至少覆盖初态、一次转移与复位）"
    math_model = contract.get("math_model")
    if not isinstance(math_model, dict) or not str(math_model.get("formula") or "").strip():
        return "缺少 math_model.formula（非数学题也要写 none）"
    formula = str(math_model.get("formula") or "").strip().lower()
    if formula != "none":
        if not str(math_model.get("screen_mapping") or "").strip():
            return "数学契约缺少 screen_mapping"
        if not isinstance(math_model.get("invariants"), list) or not math_model["invariants"]:
            return "数学契约缺少 invariants"
    return ""


def _normalize_contract(contract: Any) -> Any:
    """只适配 GenUI 与 LectureDoc 的外层字段名，不改写设计内核。"""
    if not isinstance(contract, dict):
        return contract
    normalized = dict(contract)
    if not normalized.get("update") and normalized.get("render_contract"):
        normalized["update"] = normalized["render_contract"]
    return normalized


def _compile_lecture_host_contract(contract: dict[str, Any]) -> dict[str, Any]:
    """Lower standalone GenUI art directions onto LectureDoc theme tokens."""
    compiled = dict(contract)
    source_direction = str(compiled.get("aesthetic_direction") or "host-calm")
    compiled["source_aesthetic_direction"] = source_direction
    compiled["aesthetic_direction"] = "host-calm"
    compiled["palette"] = [
        "var(--bg)", "var(--bg2)", "var(--ink)", "var(--text2)",
        "var(--accent)", "var(--line)",
    ]
    compiled["direction_reason"] = (
        f"LectureDoc host palette; preserve {source_direction} only in layout, motion, and signature detail"
    )
    return compiled


def compile_interaction_brief(
    brief: Any,
    *,
    profile: str,
    core_insight: str,
) -> tuple[dict[str, Any] | None, str]:
    """Compile the skeleton's compact interaction brief into the full GenUI contract.

    Returning a problem is not fatal: the caller deliberately falls back to ``widget:plan``.
    """
    if not isinstance(brief, dict):
        return None, "interactionBrief 缺失"
    required = (
        "stateModel", "controls", "update", "initialPaint", "visibleEncodings",
        "history", "reset", "verificationCases", "aestheticDirection", "signatureDetail",
    )
    missing = [key for key in required if not brief.get(key)]
    if missing:
        return None, "interactionBrief 缺 " + ", ".join(missing)
    state_model = brief.get("stateModel")
    controls = brief.get("controls")
    visible = brief.get("visibleEncodings")
    cases = brief.get("verificationCases")
    if not isinstance(state_model, list) or not state_model:
        return None, "stateModel 必须是非空数组"
    if not isinstance(controls, list) or not controls:
        return None, "controls 必须是非空数组"
    if not isinstance(visible, list) or not visible:
        return None, "visibleEncodings 必须是非空数组"
    if not isinstance(cases, list) or not cases:
        return None, "stateModel/controls/visibleEncodings/verificationCases 必须是非空数组"
    normalized_cases: list[dict[str, str]] = []
    for index, case in enumerate(cases):
        if isinstance(case, dict):
            case_input = str(case.get("input") or "").strip()
            expected = str(case.get("expected") or "").strip()
        else:
            compact = str(case or "").strip()
            parts = re.split(r"\s*(?:=>|→|:|：)\s*", compact, maxsplit=1)
            case_input = parts[0] if len(parts) == 2 else f"case {index + 1}"
            expected = parts[-1]
        if not case_input or not expected:
            return None, f"verificationCases[{index}] 缺 input/expected"
        normalized_cases.append({"input": case_input, "expected": expected})
    if len(normalized_cases) < 3:
        return None, "verificationCases 至少含三个 input/expected 用例"
    interactions: list[dict[str, str]] = []
    for index, control in enumerate(controls):
        if isinstance(control, dict):
            trigger = str(control.get("trigger") or control.get("action") or "").strip()
            effect = str(control.get("effect") or control.get("update") or brief.get("update") or "").strip()
        else:
            trigger, effect = str(control).strip(), str(brief.get("update") or "").strip()
        if not trigger or not effect:
            return None, f"controls[{index}] 缺 trigger/effect"
        interactions.append({"trigger": trigger, "effect": effect})
    encodings: list[dict[str, str]] = []
    for index, encoding in enumerate(visible):
        if isinstance(encoding, dict):
            normalized = {
                "quantity": str(encoding.get("quantity") or "").strip(),
                "mark": str(encoding.get("mark") or "").strip(),
                "where": str(encoding.get("where") or "").strip(),
            }
        else:
            compact = str(encoding or "").strip()
            if not compact:
                return None, f"visibleEncodings[{index}] 为空"
            normalized = {
                "quantity": compact,
                "mark": "由该描述指定的高亮、形状、连线或读数",
                "where": "主舞台及其相邻读数区",
            }
        if not all(normalized.values()):
            return None, f"visibleEncodings[{index}] 缺 quantity/mark/where"
        encodings.append(normalized)

    raw_math = brief.get("mathModel")
    math_raw: dict[str, Any] = raw_math if isinstance(raw_math, dict) else {}
    formula = str(math_raw.get("formula") or "none")
    screen_mapping = str(
        math_raw.get("screenMapping") or math_raw.get("screen_mapping") or "not applicable"
    )
    invariants = list(math_raw.get("invariants") or [])
    math_model: dict[str, Any] = {
        "formula": formula,
        "screen_mapping": screen_mapping,
        "invariants": invariants,
    }
    if profile == "geometry":
        if formula.strip().lower() == "none":
            return None, "geometry profile 缺 mathModel.formula"
        if screen_mapping.strip().lower() == "not applicable" or not invariants:
            return None, "geometry profile 缺 screenMapping/invariants"
    comparison_states = list(brief.get("comparisonStates") or [])
    comparison_claim = any(token in core_insight.lower() for token in ("compare", "comparison", "比较", "对比"))
    if comparison_claim and not comparison_states:
        return None, "比较目标缺 comparisonStates"
    render_medium = str(brief.get("renderMedium") or "svg").lower()
    if profile == "geometry" and render_medium != "svg":
        return None, "geometry profile 默认必须使用 svg"
    direction = str(brief.get("aestheticDirection") or "host-calm")
    contract: dict[str, Any] = {
        "core_insight": core_insight,
        "render_medium": render_medium,
        "render_medium_reason": "由规划阶段的证据形态确定",
        "aesthetic_direction": direction,
        "direction_reason": f"{profile} evidence profile",
        "palette": ["var(--bg)", "var(--ink)", "var(--accent)", "var(--line)"],
        "signature_detail": str(brief.get("signatureDetail")),
        "layout_pattern": "stage+readout-row",
        "layout_skeleton": "title / compact controls / full-width stage / readout row",
        "state_model": state_model,
        "interactions": interactions,
        "render_contract": str(brief.get("update")),
        "update": str(brief.get("update")),
        "initial_paint": str(brief.get("initialPaint")),
        "visible_encodings": encodings,
        "comparison_states": comparison_states,
        "interaction_loop": {
            "action": "; ".join(item["trigger"] for item in interactions),
            "model_update": str(brief.get("update")),
            "visible_change": "; ".join(item["quantity"] for item in encodings),
            "history": str(brief.get("history")),
            "reset": str(brief.get("reset")),
        },
        "math_model": math_model,
        "verification_cases": normalized_cases,
        "profile": profile,
    }
    problem = _contract_problem(contract)
    return (None, problem) if problem else (contract, "")


def _build_prompt(
    *, intent: str, topic: str, theme: str, language: str, contract: str, guidelines: str
) -> str:
    anchor = f"所在讲义课题：「{topic}」。" if topic else ""
    query = f"{anchor}本互动组件的教学意图：{intent}。用户可见文案语言：{language}。"
    widget_type = infer_widget_type(intent)
    if widget_type in {"chart", "chart_interactive", "mockup"}:
        widget_type = "interactive"  # sim.widget 离线逃生舱，不引入 Chart.js 或业务 UI 假壳
    base = genui_primary_prompt(
        query=query,
        widget_type=widget_type,
        recent_context="",
        plan=contract,
    )
    return base + f"""

---

LectureDoc host adapter（与通用 GenUI 规则冲突时，以这里为准）：
- deck theme 是 `{theme}`。不得实现 GenUI palette 中的十六进制颜色；所有 surface/ink/accent/line 必须映射到
  `var(--bg)`, `var(--bg2)`, `var(--card)`, `var(--ink)`, `var(--text2)`, `var(--accent)`, `var(--line)`。
  canvas 通过 getComputedStyle(document.documentElement) 读取同名 token。aesthetic_direction 只保留结构、字体层级、
  motion 和 signature_detail，不另起一套配色或 `[data-theme=dark]` register。契约里的
  `source_aesthetic_direction` 只是结构特征来源；可执行方向已编译为 host-calm，禁止恢复原方向色板。
- iframe 固定高度且 overflow:hidden：根节点必须 width:100%; height:100%; min-width:0; min-height:0；不得依赖内容撑高，
  不得出现内部滚动条。主舞台优先占据可用高度，控件/读数保持紧凑。
- 纯离线 vanilla，禁 CDN、import、fetch、Chart.js 及任何外部资源。
- 数学/算法视觉必须把 math_model 写成独立纯函数，并用 verification_cases 在初始化时执行 console.assert；
  屏幕映射、箭头方向、曲线变量必须由这些函数生成，不能另画装饰路径。
- 严格实现 interaction_loop：操作必须修改 state_model 并立即调用统一 update()；同屏保留前态/当前态或 before→after，
  只高亮本步变化；离散过程实现单步与确定性 reset，不能只切换说明文字。
- 首帧逐项实现 visible_encodings；comparison_states 非空时全部状态必须同时可见并有清楚图例。
- 每个控件在声明的初始值、最小值和最大值都必须产生 finite、非空、可读的画面；若动力学发散，缩短控件范围、
  固定教学视窗或显式裁切，不能让一个极端轨迹把主体缩成不可读的一条线。
- 所有用户可见文案使用 `{language}`；除标准符号/专名外，不得无故混用另一种语言。
- 仍按通用 GenUI 的两段格式返回；不要只返回裸 HTML。

Lecture 既有补充规范：
{guidelines}
"""


def _extract_fragment(raw: str) -> str:
    """从 build 回复里抽出 HTML 片段：容忍模型套 ```html 围栏或（仿 GenUI）<widget_code> 标签。"""
    t = str(raw or "").strip()
    m = re.search(r"<widget_code>\s*([\s\S]*?)\s*</widget_code>", t)
    if m:
        return m.group(1).strip()
    t = re.sub(r"^```[a-zA-Z]*\n?", "", t)
    t = re.sub(r"\n?```$", "", t)
    return t.strip()


def _compile_host_palette_html(fragment: str, *, render_medium: str) -> str:
    """Lower harmless standalone palette fallbacks and SVG accents to host tokens."""
    compiled = re.sub(
        r"var\(\s*(--(?:bg|bg2|card|ink|text2|accent|line))\s*,\s*#[0-9a-fA-F]{3,8}\s*\)",
        r"var(\1)",
        fragment,
        flags=re.I,
    )
    compiled = re.sub(
        r"(getPropertyValue\(\s*['\"]--(?:bg|bg2|card|ink|text2|accent|line)['\"]\s*\)"
        r"\.trim\(\))\s*\|\|\s*['\"]#[0-9a-fA-F]{3,8}['\"]",
        r"\1",
        compiled,
        flags=re.I,
    )

    def css_token(match: re.Match[str]) -> str:
        prop, color = match.group(1), match.group(2).lower()
        token = "--card" if color in {"fff", "ffffff", "ffffffff"} else "--accent"
        return f"{prop}:var({token})"

    compiled = re.sub(
        r"\b(color|background(?:-color)?|fill|stroke)\s*:\s*#([0-9a-fA-F]{3,8})\b",
        css_token,
        compiled,
        flags=re.I,
    )
    if render_medium == "svg":
        def svg_token(match: re.Match[str]) -> str:
            quote, color = match.group(1), match.group(2).lower()
            token = "--card" if color in {"fff", "ffffff", "ffffffff"} else "--accent"
            return f"{quote}var({token}){quote}"

        compiled = re.sub(
            r"(['\"])#([0-9a-fA-F]{3,8})\1",
            svg_token,
            compiled,
        )
    return compiled


async def generate_widget(
    llm: LLMClient,
    *,
    intent: str,
    theme: str,
    language: str = "zh-CN",
    topic: str = "",
    material: str = "",
    guidelines: str = "",
    preplanned_contract: dict[str, Any] | None = None,
    rounds: int = 3,
) -> BlockResult:
    """Generate a widget, skipping ``widget:plan`` when a compiled contract is valid."""
    # ① 契约（先想清楚再写码）。契约是后续质量门的可审计依据，失败不得退化成自由写码。
    contract_str = ""
    contract_obj: dict[str, Any] | None = None
    last_contract_problem = "未返回契约"
    if preplanned_contract is not None:
        candidate = _normalize_contract(preplanned_contract)
        last_contract_problem = _contract_problem(candidate)
        if not last_contract_problem:
            contract_obj = candidate
            contract_str = json.dumps(candidate, ensure_ascii=False, indent=2)
    if contract_obj is None:
        plan_messages: list[Message] = [
            {"role": "system", "content": _PLAN_SYS},
            {"role": "user", "content": _plan_prompt(intent=intent, topic=topic, material=material)},
        ]
        for attempt in range(_WIDGET_PLAN_ROUNDS):
            try:
                raw = await asyncio.wait_for(
                    llm.complete(plan_messages, json_mode=True, purpose="widget:plan"),
                    timeout=_WIDGET_PLAN_TIMEOUT_S,
                )
                contract = _normalize_contract(parse_json(raw))
                last_contract_problem = _contract_problem(contract)
                if not last_contract_problem:
                    contract_obj = contract
                    contract_str = json.dumps(contract, ensure_ascii=False, indent=2)
                    break
            except Exception as exc:  # noqa: BLE001
                last_contract_problem = str(exc)[:100] or "契约解析失败"
            if attempt + 1 < _WIDGET_PLAN_ROUNDS:
                plan_messages.append(
                    {"role": "assistant", "content": str(raw) if "raw" in locals() else "{}"}
                )
                plan_messages.append(
                    {
                        "role": "user",
                        "content": f"契约不合格：{last_contract_problem}。补齐字段后只输出完整 JSON 对象。",
                    }
                )
    if contract_obj is None:
        return BlockResult(None, f"widget 设计契约失败: {last_contract_problem}")
    contract_obj = _compile_lecture_host_contract(contract_obj)
    contract_str = json.dumps(contract_obj, ensure_ascii=False, indent=2)

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
            raw = await asyncio.wait_for(
                llm.complete(
                    messages,
                    json_mode=False,
                    purpose=("widget:build" if rnd == 1 else "widget:repair"),
                ),
                timeout=_WIDGET_BUILD_TIMEOUT_S,
            )
        except TimeoutError:
            # 底层 provider 可配置 600s×多次重试；一个 widget 不应把整份 deck 挂几十分钟。
            return BlockResult(None, f"widget 构建超时（>{_WIDGET_BUILD_TIMEOUT_S:.0f}s）")
        except Exception as e:  # noqa: BLE001
            if last:
                return BlockResult(None, f"LLM 调用失败: {str(e)[:80]}")
            await asyncio.sleep(1.0)
            continue

        payload = parse_split_response(raw)
        fragment = _compile_host_palette_html(
            str(payload.get("widget_code") or _extract_fragment(raw)),
            render_medium=str(contract_obj.get("render_medium") or "svg"),
        )
        block: dict[str, Any] = {"type": "sim", "engine": "widget", "html": fragment}
        # 保留设计契约供逐页质量门核对“计划中的状态/交互是否真的接上线”；viewer 忽略该字段。
        block["spec"] = contract_obj
        res = validate_block(block, "sim")
        # widget 的 machine-tells（<h1>/无动效/prefers-color-scheme/桩色）是 warning 而非 error——
        # 但它们正是反 slop 质量闸，非末轮一并回炉修（对齐 GenUI validation_repair）；末轮只剩
        # warning 则 best-effort 收下不丢内容（同 blocks.py 的截断处理）。
        genui_issues = payload_validation_errors(payload)
        issues = genui_issues + res.errors + res.warnings
        if not issues:
            return BlockResult(block, warns=[])
        if last:
            if genui_issues or res.errors:
                return BlockResult(None, "; ".join(genui_issues + res.errors))
            return BlockResult(block, warns=res.warnings)  # 只剩 warning → best-effort 收下
        messages.append({"role": "assistant", "content": raw})
        messages.append(
            {
                "role": "user",
                "content": genui_validation_repair_prompt(
                    query=f"课题：{topic}；教学意图：{intent}",
                    widget_type=str(payload.get("widget_type") or infer_widget_type(intent)),
                    recent_context="",
                    broken_payload=payload,
                    validation_errors=issues,
                )
                + "\n继续遵守上一条 LectureDoc host adapter：颜色只用 --token、离线零依赖、固定 iframe 内无滚动。",
            }
        )
    return BlockResult(None, "未知失败")


async def repair_widget(
    llm: LLMClient,
    *,
    current: dict[str, Any],
    issues: str,
    theme: str,
    language: str = "zh-CN",
    topic: str = "",
    guidelines: str = "",
    rounds: int = 2,
) -> BlockResult:
    """质量门针对现有 widget 的代码级修复；复用 spec，避免再次 plan→build 整页重做。"""
    spec = current.get("spec") if isinstance(current.get("spec"), dict) else {}
    fragment = str(current.get("html") or "")
    prompt = f"""所在讲义课题：「{topic}」。用户可见文案语言：{language}；主题：{theme}。
下面是已生成 widget 的设计契约、HTML 与逐页质量门问题。保持核心教学目标和现有控件，不重新规划页面；
直接修正代码/文案/数学映射。所有颜色继续读取 --token。数学问题必须增加或修正纯函数与 console.assert 验证例。

设计契约：
{json.dumps(spec, ensure_ascii=False, indent=2)}

必须修正：
{issues}

现有 HTML：
{fragment}

LectureDoc 宿主硬约束：保持自包含 HTML 片段；零依赖、禁网络/CDN/import/fetch；颜色只读 --token；
根节点填满固定高度 iframe 且无内部滚动。首帧和每个控件的初始/最小/最大状态均须 finite、非空、可读。

调用方额外规范（若有）：
{guidelines}

只输出修正后的完整 HTML 片段，不要围栏/解释。"""
    messages: list[Message] = [
        {"role": "system", "content": _REPAIR_SYS},
        {"role": "user", "content": prompt},
    ]
    for rnd in range(1, rounds + 1):
        try:
            raw = await asyncio.wait_for(
                llm.complete(
                    messages,
                    json_mode=False,
                    purpose="widget:quality-repair" if rnd == 1 else "widget:repair",
                ),
                timeout=_WIDGET_BUILD_TIMEOUT_S,
            )
        except TimeoutError:
            return BlockResult(None, f"widget 质量修复超时（>{_WIDGET_BUILD_TIMEOUT_S:.0f}s）")
        except Exception as exc:  # noqa: BLE001
            if rnd == rounds:
                return BlockResult(None, f"widget 质量修复失败: {str(exc)[:100]}")
            continue
        repaired: dict[str, Any] = {
            "type": "sim",
            "engine": "widget",
            "html": _extract_fragment(raw),
        }
        if spec:
            repaired["spec"] = spec
        result = validate_block(repaired, "sim")
        validation_issues = result.errors + result.warnings
        if not validation_issues or (rnd == rounds and not result.errors):
            return BlockResult(repaired, warns=result.warnings)
        messages.append({"role": "assistant", "content": repaired["html"]})
        messages.append(
            {
                "role": "user",
                "content": "仍有以下结构/主题问题：\n"
                + "\n".join(validation_issues)
                + "\n只输出再次修正后的完整 HTML。",
            }
        )
    return BlockResult(None, "widget 质量修复未收敛")
