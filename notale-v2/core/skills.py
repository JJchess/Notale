"""Workflow routing and deterministic shared guidance injection."""

from __future__ import annotations

import json
import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
WORKFLOWS = ROOT / "skills"
PROMPTS = ROOT / "prompts"
DEFAULT = ROOT / "tools"  # ImageGen script resource root; --skills retains this contract.

PAGE_WORKFLOWS = (
    "build-cover",
    "build-page",
    "build-interaction",
    "build-code",
)

FONT_FLOOR = (
    "正文与成句说明 ≥16px，控件标签、图例、图注和提示 ≥14px，"
    "纯数字刻度 ≥12px，多行文字行高 ≥1.35。"
)


def available(root: Path = WORKFLOWS) -> tuple[str, ...]:
    if not root.is_dir():
        return ()
    return tuple(sorted(
        item.name for item in root.iterdir() if (item / "SKILL.md").is_file()
    ))


def page_skill_descriptions(root: Path = WORKFLOWS) -> str:
    """Expose only the four build skills' discovery metadata to the Planner."""
    rows = []
    for workflow in PAGE_WORKFLOWS:
        path = root / workflow / "SKILL.md"
        text = path.read_text(encoding="utf-8")
        header = re.match(r"\A---\n(.*?)\n---(?:\n|$)", text, re.S)
        if header is None:
            raise ValueError(f"missing skill frontmatter: {path}")
        metadata = yaml.safe_load(header.group(1))
        rows.append(f"- {metadata['name']}: {metadata['description'].strip()}")
    return "\n".join(rows)


def _aux_sample_catalog(name: str, root: Path) -> str:
    """Build the optional auxiliary mini-sample registry."""
    skill_dir = root / name
    catalog_path = skill_dir / "samples" / "catalog.json"
    if not catalog_path.is_file():
        return ""
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    rows = []
    for sample in catalog.get("samples", []):
        if sample.get("aux") is False or not isinstance(sample.get("mini"), dict):
            continue
        path = (
            skill_dir / "samples" / "bundles" / sample["category"]
            / f"{sample['id']}.mini.md"
        ).resolve()
        if not path.is_file():
            raise FileNotFoundError(f"registered auxiliary sample is missing: {path}")
        rows.append((sample["category"], sample["id"], path))
    if not rows:
        return ""
    # 路径命名完全固定,逐条写全等于把同一个模板抄十几遍。
    # 声明一次规则 + 按类别列 id 即可,信息量不变。
    by_category: dict[str, list[str]] = {}
    for category, sample_id, _ in rows:
        by_category.setdefault(category, []).append(sample_id)
    lines = [
        f'<aux_sample_catalog workflow="{name}">',
        "Auxiliary mode is enabled for this run. In the same first response, after "
        "choosing Main, read zero to three ids below from the selected category. "
        "Never choose the Main sample's id again.",
        "Path: `samples/bundles/<category>/<id>.mini.md`",
    ]
    lines.extend(f"- {category}: {', '.join(ids)}"
                 for category, ids in sorted(by_category.items()))
    lines.append("</aux_sample_catalog>")
    return "\n".join(lines)



# Visual examples use mini; code uses one retained author layer.
SAMPLE_MODES = ("mini", "none")

_READ_BOTH = (
    "then issue parallel `Read` calls for exactly one reference and one Main "
    "from the same category. Do not read any other sample."
)
_READ_REFERENCE_ONLY = (
    "then `Read` exactly one reference for that category. This run supplies no "
    "worked sample; do not look for one, and build from the reference alone."
)
_CODE_ONE = """In your first response, issue these three calls in parallel:

- `Read(<skill-dir>/references/code.md)`
- `Read(<skill-dir>/samples/bundles/code/code-core-bundle.one.md)`
- `CodeScaffold()`

The sample bundle carries one worked author layer. Transfer its state/trace/evidence architecture to this page's algorithm; do not copy its learner code, data, labels, or styling."""
_CODE_NONE = """In your first response, issue these two calls in parallel:

- `Read(<skill-dir>/references/code.md)`
- `CodeScaffold()`

This run supplies no worked sample. Build the state/trace/evidence architecture from the reference alone."""


def _apply_sample_mode(name: str, body: str, mode: str) -> str:
    """Rewrite one SKILL body for the requested sample budget.

    Edits the raw text before ``<skill-dir>`` is expanded. Every branch asserts
    its anchor: a silently-unchanged body would run an ablation arm that is
    secretly the control, which is worse than a crash.
    """
    if mode == "mini":
        return body
    if name == "build-code":
        if _CODE_ONE not in body:
            raise ValueError("build-code/SKILL.md no longer carries the三-call block")
        return body.replace(_CODE_ONE, _CODE_NONE, 1)

    if _READ_BOTH not in body:
        raise ValueError(f"{name}/SKILL.md no longer carries the Main-read sentence")
    # none —— 删掉整个 Samples 目录,并把读样本那句改成只读 reference
    start = body.find("## Samples")
    if start < 0:
        raise ValueError(f"{name}/SKILL.md has no '## Samples' section")
    # Samples is the final section; do not use explanatory prose as a delimiter.
    return body[:start].rstrip().replace(
        _READ_BOTH, _READ_REFERENCE_ONLY, 1)


def routed_workflow(
    name: str,
    root: Path = WORKFLOWS,
    *,
    include_aux: bool | None = None,
    samples: str = "mini",
) -> str:
    """Inline the one Planner-routed SKILL; references and samples stay deferred."""
    if name not in PAGE_WORKFLOWS:
        raise ValueError(f"unknown routed workflow {name!r}; expected {PAGE_WORKFLOWS}")
    if samples not in SAMPLE_MODES:
        raise ValueError(f"unknown sample mode {samples!r}; expected {SAMPLE_MODES}")
    if include_aux is None:
        include_aux = samples != "none"
    # aux = Main 之外再挂 0–3 份同类 mini。配 mini 就是「多份紧凑样本」那一臂;
    # 配 none 无意义 —— aux 目录里那句「别再选 Main 的 id」没有指代对象。
    if include_aux and samples == "none":
        raise ValueError("--aux-samples 需要一个 Main,不能配 samples=none")
    path = root / name / "SKILL.md"
    if not path.is_file():
        raise FileNotFoundError(f"routed workflow is not installed: {path}")
    body = _apply_sample_mode(
        name, path.read_text(encoding="utf-8", errors="replace").strip(), samples)
    body = re.sub(r"\A---\n.*?\n---\s*", "", body, count=1, flags=re.S)
    aux = _aux_sample_catalog(name, root) if include_aux else ""
    if aux:
        marker = "Do not read any other sample."
        if marker not in body:
            raise ValueError(f"{path} is missing the main-only sample policy")
        body = body.replace(
            marker,
            "Follow the appended `<aux_sample_catalog>` in the same first response.",
            1,
        )
    # **路径根只写一次。** 展开成绝对路径时,每条都重复
    # `/…/skills/build-page/` 这 60 多个字符 —— build-page 的 SKILL 里 25 条路径,
    # 光前缀就占 1,575 字符(全块的 22.6%),四个 workflow 合计 3,089 字符。
    # 路径声明由 builder.environment_context 统一生成，工具仍按 resource_root 解析。
    root_dir = path.parent.resolve()
    body = body.replace("<skill-dir>/", "").replace("<skill-dir>", str(root_dir))
    block = (
        f'<workflow_skill name="{name}">\n'
        f"{body}\n</workflow_skill>"
    )
    return block + ("\n\n" + aux if aux else "")


PHILOSOPHY_FILE = "philosophy.md"


def philosophy_block(scope: str, root: Path = PROMPTS) -> str:
    """按 scope 取设计哲学。**这份文件此前代码里零引用,谁也收不到。**

    2026-09-05 接线时同步把它削到两块 —— 其余全是 workflow reference 与
    `<check_use>` 已经讲过的东西,而那两处实测都送达了(27/27 页读了 reference,
    check_use 随每次 Check 回传共 73 遍),页面照样是三栏卡片墙。
    重复第四遍不会让规则更成立,所以只留它们覆盖不到的:
    planner 侧的「页数怎么分」和 builder 侧的「装不下时该怎么办」。
    """
    if scope not in ("deck", "page"):
        raise ValueError(f"unknown philosophy scope {scope!r}")
    text = (root / PHILOSOPHY_FILE).read_text(encoding="utf-8", errors="replace")
    blocks = re.findall(
        rf'(<[a-z-]+ scope="{scope}">\n.*?\n</[a-z-]+>)', text, re.S)
    if not blocks:
        raise ValueError(f"{root / PHILOSOPHY_FILE} 里没有 scope=\"{scope}\" 的块")
    return "<design_philosophy>\n" + "\n\n".join(blocks) + "\n</design_philosophy>"


DIRECTION_FILE = "direction.md"


def direction_block(root: Path = PROMPTS) -> str:
    """Shared direction principles for Director and the explicit legacy Planner route."""
    path = root / DIRECTION_FILE
    text = path.read_text(encoding="utf-8").strip()
    return f'<direction src="{DIRECTION_FILE}">\n{text}\n</direction>'


ANTI_SLOP_FILES = (
    ("anti_ai_slop_copy", "scrub-copy-slop.md"),
    ("anti_ai_slop_visual", "scrub-visual-slop.md"),
)
THEME_SLOP_FILE = ("anti_ai_slop_theme", "scrub-theme-slop.md")


def _source_block(root: Path, sources: tuple[tuple[str, str], ...]) -> str:
    parts = []
    for tag, name in sources:
        path = root / name
        if not path.is_file():
            raise FileNotFoundError(f"guidance source is missing: {path}")
        text = path.read_text(encoding="utf-8", errors="replace").strip()
        parts.append(f"<{tag}>\n{text}\n</{tag}>")
    return "\n\n".join(parts)


def anti_slop_block(root: Path = WORKFLOWS, *, include_visual: bool = True) -> str:
    """Keep factual copy guidance shared; code owns its visual policy."""
    sources = ANTI_SLOP_FILES if include_visual else ANTI_SLOP_FILES[:1]
    return _source_block(root, sources)


def theme_slop_block(root: Path = WORKFLOWS) -> str:
    """Theme guidance for Director, or Planner when Director is explicitly disabled."""
    return _source_block(root, (THEME_SLOP_FILE,))
