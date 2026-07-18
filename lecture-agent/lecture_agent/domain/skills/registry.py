"""技能加载器——扫 skills/<name>/：SKILL.md（frontmatter）+ 可选 contracts.json（type→契约）。

产出 registry: block 类型 → SkillEntry，供编排器按类型路由到对应家族契约。对应旧 src/skills.mjs。
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# 逃生舱/单例类型：注册但不进"自动规划菜单"。
AUTO_EXCLUDE = frozenset(["runnable", "freeform", "embed"])

_FM = re.compile(r"^---\n(.*?)\n---", re.S)
_KV = re.compile(r"^(\w[\w-]*):\s*(.*)$")


@dataclass
class SkillEntry:
    skill: str
    dir: str
    description: str
    contract: Any  # 契约模板（字符串或结构；喂 LLM 前 stringify）


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
                )
    auto_types = [t for t in registry if t not in AUTO_EXCLUDE]
    return registry, auto_types
