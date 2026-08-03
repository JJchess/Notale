"""技能加载器——扫 skills/<name>/：SKILL.md（frontmatter）+ 可选 contracts.json（type→契约）。

产出 registry: block 类型 → SkillEntry，供编排器按类型路由到对应家族契约。对应旧 src/skills.mjs。
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# 逃生舱类型：注册但不进"自动规划菜单"。runnable 曾在此列（因"每 deck 至多一个"的运行时
# 单例约束），viewer 已支持多实例挂载（各自独立 portal/CodeMirror + 共享 Pyodide/每块命名空间），
# 约束解除，规划器现在可以自动产出它。
#
# freeform 也已移出：它此前既被排除在规划菜单外（规划器根本选不到）、又被渲染成"⚠ 未分类内容"，
# 等于把唯一能表达"schema 没预先建模的视觉关系"的出口彻底堵死。现在树/DAG 有了一等的 graph 块，
# freeform 回到它该在的位置——长尾兜底，可达但不常用。embed 仍排除（依赖外部产物，非自足）。
AUTO_EXCLUDE = frozenset(["embed"])

_FM = re.compile(r"^---\n(.*?)\n---", re.S)
_KV = re.compile(r"^(\w[\w-]*):\s*(.*)$")


@dataclass
class SkillEntry:
    skill: str
    dir: str
    description: str
    contract: Any  # 契约模板（字符串或结构；喂 LLM 前 stringify）
    affordances: tuple[str, ...] = ()
    learner_actions: tuple[str, ...] = ()
    evidence_outputs: tuple[str, ...] = ()
    limitations: tuple[str, ...] = ()


def default_skills_dir() -> Path:
    """项目根下的 skills/（lecture_agent/domain/skills/registry.py → 上溯 3 层到项目根）。"""
    return Path(__file__).resolve().parents[3] / "skills"


def _parse_frontmatter(md: str) -> dict[str, str]:
    fm: dict[str, str] = {}
    m = _FM.match(md)
    if m:
        for line in m.group(1).split("\n"):
            kv = _KV.match(line)
            if kv:
                fm[kv.group(1)] = kv.group(2).strip().strip("\"'")
    return fm


def _parse_list(value: str) -> tuple[str, ...]:
    """解析 frontmatter 的单行列表；保持 loader 无第三方 YAML 依赖。"""
    raw = value.strip().strip("[]")
    return tuple(part.strip().strip("\"'") for part in raw.split(",") if part.strip())


def load_skills(skills_dir: str | Path | None = None) -> tuple[dict[str, SkillEntry], list[str]]:
    d = Path(skills_dir) if skills_dir else default_skills_dir()
    registry: dict[str, SkillEntry] = {}
    for name in sorted(p.name for p in d.iterdir() if p.is_dir()):
        sdir = d / name
        sk = sdir / "SKILL.md"
        if not sk.exists():
            continue
        fm = _parse_frontmatter(sk.read_text(encoding="utf-8"))
        cpath = sdir / "contracts.json"
        if cpath.exists():
            contracts = json.loads(cpath.read_text(encoding="utf-8"))
            for btype, contract in contracts.items():
                if btype in registry:
                    raise ValueError(f'block 类型 "{btype}" 被多个技能声明——一个类型只能归一个家族')
                registry[btype] = SkillEntry(
                    skill=fm.get("name", name),
                    dir=str(sdir),
                    description=fm.get("description", ""),
                    contract=contract,
                    affordances=_parse_list(fm.get("affordances", "")),
                    learner_actions=_parse_list(fm.get("learner-actions", "")),
                    evidence_outputs=_parse_list(fm.get("evidence-outputs", "")),
                    limitations=_parse_list(fm.get("limitations", "")),
                )
    auto_types = [t for t in registry if t not in AUTO_EXCLUDE]
    return registry, auto_types


_DESC_TAIL = re.compile(r"\s*Produces schema-valid[^.]*\.\s*$")


def _trim_desc(desc: str) -> str:
    """去掉描述尾部对规划无用的 `Produces schema-valid … JSON.` boilerplate。"""
    return _DESC_TAIL.sub("", desc).strip()


def _decision_description(entry: SkillEntry) -> str:
    """把 Skill 自声明的能力契约编译进规划菜单，而非在中心 prompt 按学科写特判。"""
    parts = [_trim_desc(entry.description)]
    if entry.affordances:
        parts.append("Affordances: " + ", ".join(entry.affordances) + ".")
    if entry.learner_actions:
        parts.append("Learner actions: " + ", ".join(entry.learner_actions) + ".")
    if entry.evidence_outputs:
        parts.append("Evidence outputs: " + ", ".join(entry.evidence_outputs) + ".")
    if entry.limitations:
        parts.append("Limitations: " + ", ".join(entry.limitations) + ".")
    return " ".join(part for part in parts if part)


def plan_menu(registry: dict[str, SkillEntry]) -> list[tuple[str, str, list[str]]]:
    """把 registry 按 skill 家族分组成规划器的「描述 → 可选类型」菜单。

    **描述即路由决策面**：规划器据每个家族自己的 `description` 判断何时调用哪个组件，
    而不是靠中心 prompt 里手写的启发式（那套会屏蔽描述、又把互动组件劝退）。加一个组件家族=
    写好它的 description 即自动可被选中。排除 AUTO_EXCLUDE（逃生舱不进自动菜单）。顺序稳定
    （registry 插入序），供 prompt 渲染与测试断言。
    """
    acc: dict[str, tuple[str, list[str]]] = {}
    order: list[str] = []
    for btype, entry in registry.items():
        if btype in AUTO_EXCLUDE:
            continue
        if entry.skill not in acc:
            acc[entry.skill] = (_decision_description(entry), [])
            order.append(entry.skill)
        acc[entry.skill][1].append(btype)
    return [(sk, acc[sk][0], acc[sk][1]) for sk in order]
