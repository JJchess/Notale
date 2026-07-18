"""内容规划（移植自 Stanford STORM 的 pre-writing：多视角提问 → 覆盖清单 → 综合骨架）。

对应旧 src/plan.mjs。省略了 UI-only 的流式增量抽取（makePlanPump）；正确性由流末 parse_json 保证，
这里用原子调用。只依赖 ports.LLMClient。来源: github.com/stanford-oval/storm。
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass, field
from typing import Any

from ..ports.llm import LLMClient, Message
from ..utils.jsonio import parse_json

_PERSPECTIVE_SCHEMA = (
    '{ "perspectives": [ { "name":"视角名(如 重直觉的入门讲法 / 重推导的理论派 / 重工程实践 / 爱追问的学生)", '
    '"focus":"这个视角最在意什么(一句)", "mustCover":["必须讲到的要点"], "questions":["常见疑问/误区"] } ] }'
)


@dataclass
class PlanResult:
    doc: dict[str, Any]
    perspectives: list[dict[str, Any]] = field(default_factory=list)


async def _discover_coverage(
    llm: LLMClient, *, topic: str, audience: str, extra: str, material: str, n: int
) -> list[dict[str, Any]]:
    """STORM 阶段一：发现互补教学视角 + 每视角的必讲点与常见疑问。"""
    if n <= 1:
        return []
    sys = (
        f"你是课程设计专家。用多视角提问扩大一节讲义的覆盖面：对给定课题，列出 3-4 个**互补**的教学视角，"
        f"每个视角给出必须讲到的要点与学生常见疑问/误区。视角要真的不同，别重复。"
        f"{'**必讲点要从下面的参考素材里提炼。**' if material else ''}只输出 JSON：\n{_PERSPECTIVE_SCHEMA}"
    )
    user = (
        f"课题: {topic}"
        + (f"\n受众: {audience}" if audience else "")
        + (f"\n额外要求: {extra}" if extra else "")
        + (f"\n\n参考素材：\n{material}" if material else "")
        + "\n输出 perspectives JSON。"
    )
    try:
        data = parse_json(
            await llm.complete(
                [{"role": "system", "content": sys}, {"role": "user", "content": user}],
                purpose="plan:perspectives",
            )
        )
        ps = data.get("perspectives") if isinstance(data, dict) else None
        return ps[:4] if isinstance(ps, list) else []
    except Exception:  # noqa: BLE001
        return []


def _skeleton_spec(
    pages: int, auto_types: list[str], theme_hint: str, wants: str, authoring_rules: str
) -> str:
    return f"""骨架结构:
{{ "id":"kebab-id","title":"...","subtitle":"...(可选)","language":"zh-CN","audience":"...","theme":"cartesian|cobalt-grid|lab|slate",
  "tutor":{{"suggestions":["建议问题"],"kb":[{{"pattern":"关键词|同义词","answer":"本地应答(inline-md)"}}]}},
  "scenes":[
    {{"id":"cover","kind":"hero","notes":"讲者备注","blocks":[{{"id":"b_cover","type":"hero","intent":"封面：标题+一句副题"}}]}},
    {{"id":"...","kind":"content","eyebrow":"小节标签(可选)","headline":"页标题","lead":"一句陈述式导语(可选)","notes":"讲者备注","blocks":[{{"id":"b1","type":"list","intent":"这一块要讲清什么(一句)"}}]}},
    {{"id":"...","kind":"quiz","headline":"随堂检验","notes":"...","blocks":[{{"id":"bq","type":"quiz","intent":"考察点"}}]}}
  ]}}
规则:
- **页数严格控制在 {pages} 页左右（±1）**。第一页 kind:hero(封面, 恰含一个 hero block)。页数少(≤4)时省掉回顾/收尾页。
- scene.kind: hero(封面/收尾,一个 hero block) | content(常规) | quiz(含一个 quiz block) | statement(含一个 statement block) | section(章节分隔页,含一个 statement block)。
- 每个 block 是占位 {{id(全局唯一), type, intent}}。**type 只能从这个清单里选，禁止新造类型名**。timeline 只用于有明确时间点的编年序列；无时间点的步骤/流程一律用 flow。可用 type: {", ".join(auto_types)}。
- **一页 1-2 个 block，叙事由浅入深**；大块（compare、大 table、>5 事件 timeline）优先独占一页。
- **交互按题材选，别硬塞**：只有可量化/可模拟的题材才用 sim；人文/艺术/历史/思辨类绝不硬塞 sim。建议每课至少 1 个 quiz。{"用户点名的交互: " + wants if wants else ""}
- 主题按气质选({"用户指定: " + theme_hint if theme_hint else "cartesian 克制人文 / cobalt-grid 研究公报 / lab 暗仪表台 / slate 冷灰编辑工程"})。
- **notes 是有料的讲者稿**：每页至少 2-3 句，写关键点展开/直觉/误区/衔接；禁没信息量的占位。
- **AI 助教**：tutor.suggestions 给 3-4 个贴具体知识点的问题；tutor.kb 覆盖主要术语 4-6 条，pattern 用 `关键词|同义词`。
{authoring_rules}"""


async def insert_sections(llm: LLMClient, doc: dict[str, Any]) -> int:
    """章节分隔页确定性插入：仅长讲义（内容页≥5）判定 2-3 个大部分边界并在各部分首页前插 section。"""
    scenes = doc.get("scenes", [])
    content_idx = [(s, i) for i, s in enumerate(scenes) if s.get("kind") == "content"]
    if len(content_idx) < 5:
        return 0
    if any(s.get("kind") == "section" for s in scenes):
        return 0
    listing = "\n".join(
        f"{k + 1}. {s.get('headline') or s.get('eyebrow') or '(无题)'}"
        for k, (s, _) in enumerate(content_idx)
    )
    sys = (
        "你是讲义编排师。下面是一节课按顺序的内容页标题。判断它们是否自然分成 2-3 个连贯的大部分(part)。"
        "只有确实存在清晰主题分界时才分；牵强或本就单一主题就返回空。每个 part 给：start(起始页序号)、"
        'title(4-12字)、thesis(一句话主旨,≤30字)。只输出 JSON：{ "parts": [ { "start": 1, "title": "…", "thesis": "…" } ] }。'
    )
    user = f"内容页标题（共 {len(content_idx)} 页）：\n{listing}\n\n输出 parts JSON。"
    try:
        parts = (
            parse_json(
                await llm.complete(
                    [{"role": "system", "content": sys}, {"role": "user", "content": user}],
                    purpose="plan:sections",
                )
            ).get("parts")
            or []
        )
    except Exception:  # noqa: BLE001
        return 0
    if not isinstance(parts, list) or len(parts) < 2:
        return 0
    if len(parts) > -(-len(content_idx) // 2):  # 分隔页数 > 内容页半数 → 过度打点
        return 0
    seen: set[int] = set()
    targets = []
    for p in parts:
        k = int(p.get("start", 0) or 0) - 1
        if k < 0 or k >= len(content_idx):
            continue
        title, thesis = str(p.get("title", "")).strip(), str(p.get("thesis", "")).strip()
        if not title or not thesis:
            continue
        scene_index = content_idx[k][1]
        if scene_index in seen:
            continue
        seen.add(scene_index)
        targets.append((scene_index, title, thesis))
    n = 0
    for scene_index, title, thesis in sorted(targets, key=lambda t: -t[0]):  # 降序插入避免错位
        scenes.insert(
            scene_index,
            {
                "id": f"section-{scene_index}",
                "kind": "section",
                "headline": title,
                "notes": f"章节分隔：{title}。{thesis}",
                "blocks": [
                    {
                        "id": f"sec{scene_index}s",
                        "type": "statement",
                        "intent": f"本部分「{title}」一句话主旨：{thesis}",
                    }
                ],
            },
        )
        n += 1
    return n


def assign_layouts(doc: dict[str, Any]) -> int:
    """确定性版式分配：天然多段(≥3 block)内容页兜底改 index；恰 2 块末块 callout 改 compose/sidenote。

    规划器实测常年只产竖排；这里打破整份 flow 单调。每类至多 2 页、不相邻。渲染器对失效引用有回落。
    """

    def label(intent: str, i: int) -> str:
        first = re.split(r"[：:（(，,。、\n]", str(intent))[0].strip()
        s = first[:14]
        return (first[:14] + "…" if len(first) > 14 else s) if s else f"第 {i + 1} 节"

    scenes = doc.get("scenes", [])
    cands = sorted(
        (
            (s, i)
            for i, s in enumerate(scenes)
            if s.get("kind") == "content"
            and not s.get("layout")
            and len(s.get("blocks") or []) >= 3
        ),
        key=lambda si: -len(si[0]["blocks"]),
    )
    used, taken = 0, set()
    for s, i in cands:
        if used >= 2:
            break
        if (i - 1) in taken or (i + 1) in taken:
            continue
        s["layout"] = {
            "kind": "index",
            "steps": [
                {"label": label(b.get("intent", ""), k), "blockIds": [b["id"]]}
                for k, b in enumerate(s["blocks"])
            ],
        }
        taken.add(i)
        used += 1
    side = 0
    for s in scenes:
        if side >= 2:
            break
        blocks = s.get("blocks") or []
        if (
            s.get("kind") == "content"
            and not s.get("layout")
            and len(blocks) == 2
            and blocks[1].get("type") == "callout"
        ):
            s["layout"] = {"kind": "compose", "preset": "sidenote"}
            side += 1
    return used + side


async def plan_lecture(
    llm: LLMClient,
    *,
    topic: str,
    pages: int = 12,
    theme: str = "",
    audience: str = "",
    wants: str = "",
    extra: str = "",
    material: str = "",
    auto_types: list[str],
    authoring_rules: str,
    perspectives_n: int = 3,
) -> PlanResult:
    """STORM 两阶段：多视角覆盖 → 综合连贯递进的 skeleton。骨架单点失败重试 2 次。"""
    perspectives = await _discover_coverage(
        llm, topic=topic, audience=audience, extra=extra, material=material, n=perspectives_n
    )
    coverage = ""
    if perspectives:
        coverage = (
            "下面是多个教学视角提炼的**覆盖清单**（在骨架里系统覆盖、组织成连贯递进的线）：\n"
            + "\n".join(
                f"【{p.get('name')}·{p.get('focus')}】\n  必讲: {'；'.join(p.get('mustCover') or [])}\n  疑问: {'；'.join(p.get('questions') or [])}"
                for p in perspectives
            )
        )
    sys = (
        "你是讲义(LectureDoc)总编排器。只输出一个 JSON 对象(骨架)，不要代码围栏、不要解释。\n"
        + _skeleton_spec(pages, auto_types, theme, wants, authoring_rules)
    )
    user = (
        f"课题: {topic}"
        + (f"\n受众: {audience}" if audience else "")
        + (f"\n主题: {theme}" if theme else "")
        + (f"\n要的交互: {wants}" if wants else "")
        + (f"\n额外要求: {extra}" if extra else "")
        + (f"\n\n参考素材（据此取材，别脱离/编造）：\n{material}" if material else "")
        + f"\n\n{coverage}\n\n产出骨架 JSON。"
    )
    msgs: list[Message] = [{"role": "system", "content": sys}, {"role": "user", "content": user}]

    last_err: Exception | None = None
    for attempt in range(1, 4):
        try:
            doc = parse_json(await llm.complete(msgs, purpose="plan:skeleton"))
            await insert_sections(llm, doc)
            return PlanResult(doc=doc, perspectives=perspectives)
        except Exception as e:  # noqa: BLE001
            last_err = e
            if attempt < 3:
                await asyncio.sleep(3.0 * attempt)
    raise RuntimeError(f"骨架生成失败（网络/限流/解析）: {str(last_err)[:100]}")
