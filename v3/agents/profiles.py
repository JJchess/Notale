"""声明式 agent 画像。实例化与运行见 agents/base.py。"""

from __future__ import annotations

import os

from agents.base import AgentProfile
from agents.fetch_web import FetchWebTool

RESEARCH = AgentProfile(
    name="research",
    system_prompt=(
        "你是备课研究员。引用网络事实前必须先用 fetch_web 工具抓取来源页原文；"
        "凡给出的引文（quote.url + quote.quotedSpan）必须对应你真实抓过的页面和其中的逐字片段，"
        "harness 会对照工具抓取记录做字面子串校验，对不上或没抓过该 url 整条记录作废。"
        "最终只输出用户要求的 JSON。"
    ),
    tools=[FetchWebTool],
    skills=["web-access"],
    max_turns=16,  # 每次 fetch_web 来回算 1 turn，8 不够；真机冒烟已撞上 MaxTurnsExceeded
)

_BUILDER_SKILLS_ALL = [
    "aframe-webxr",
    "animejs",
    "babylonjs-engine",
    "barba-js",
    "canvas-design",
    "d3-viz",
    "design-taste-frontend",
    "frontend-design",
    "frontend-slides",
    "create-sim",
    "create-code-runtime",
]


def _builder_skills() -> list[str]:
    """BUILDER 注入的 skill 子集。V3_BUILDER_SKILLS（逗号分隔）可裁剪（冒烟/降成本用），
    缺省全量。未知名字直接报错（fail-closed）。"""
    raw = os.environ.get("V3_BUILDER_SKILLS", "").strip()
    if not raw:
        return list(_BUILDER_SKILLS_ALL)
    names = [n.strip() for n in raw.split(",") if n.strip()]
    unknown = [n for n in names if n not in _BUILDER_SKILLS_ALL]
    if unknown:
        raise ValueError(f"V3_BUILDER_SKILLS 含未知 skill：{unknown}（可选：{_BUILDER_SKILLS_ALL}）")
    return names


BUILDER = AgentProfile(
    name="builder",
    system_prompt="你是讲义页面 builder，追求克制、有品的前端设计。",
    tools=[],
    skills=_builder_skills(),
)
