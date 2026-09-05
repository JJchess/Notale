"""Workflow routing and deterministic shared guidance injection."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEGACY = ROOT / "vendor" / "skills"
WORKFLOWS = ROOT / "workflows"
PROMPTS = ROOT / "prompts"
DEFAULT = LEGACY  # Planner-only media acquisition resources.

PAGE_WORKFLOWS = (
    "build-cover",
    "build-page",
    "build-interaction",
    "build-code",
)
ALL_WORKFLOWS = PAGE_WORKFLOWS + ("check-page",)

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


def _aux_sample_catalog(name: str, root: Path) -> str:
    """Build the opt-in mini-sample registry; it is absent from default context."""
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



# ── 样本消融开关 ─────────────────────────────────────────────────────
# 2026-09-04 加的。问的是一个没人量过的问题:样本到底值多少钱?
# 在 27 页那轮里,reference + Main 首次进入是全价、之后每步重发,可归因成本
# 约 $0.77,占全轮 $3.26 的 24%。而「Main 用 full 还是 mini」「一份还是多份」
# 这两个选择从来没有对照过 —— 现有的 full 优先是判断,不是测量。
#
# 三档在两类 workflow 上的含义不同,因为它们的样本形状本来就不同:
#   视觉页(cover/page/interaction)  full = 完整实例(中位 21k 字符)
#                                   mini = 同一页压到 10k 的紧凑重写
#                                   none = 只读 reference,不给实例
#   代码页(build-code)              full = code-core-bundle 的四个作者层
#                                   mini = 只给一个作者层(one)
#                                   none = 只读 reference + CodeScaffold
# 代码页没有 mini 变体,它的「减量」维度是作者层数,所以 mini 在那边等于 one。
SAMPLE_MODES = ("full", "mini", "none")

# name -> 在 mini 臂里因为缺 mini 而回退成 full 的样本 id。跑完写进 manifest,
# 统计时把用到它们的页剔除,否则那几页混着对照条件。
MINI_FALLBACKS: dict[str, list[str]] = {}

_READ_BOTH = (
    "then issue parallel `Read` calls for exactly one reference and one Main "
    "from the same category. Do not read any other sample."
)
_READ_REFERENCE_ONLY = (
    "then `Read` exactly one reference for that category. This run supplies no "
    "worked sample; do not look for one, and build from the reference alone."
)
_CODE_THREE = """In your first response, issue these three calls in parallel:

- `Read(<skill-dir>/references/code.md)`
- `Read(<skill-dir>/samples/bundles/code/code-core-bundle.full.md)`
- `CodeScaffold()`

The sample bundle contains four contrasting author layers: edit-distance dynamic programming, Euclidean recursion, grid BFS, and tree traversal. Select the closest state/trace/evidence architecture; do not mix their metaphors or copy their learner code, data, labels, or styling."""
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
    if mode == "full":
        return body
    if name == "build-code":
        want = _CODE_ONE if mode == "mini" else _CODE_NONE
        if _CODE_THREE not in body:
            raise ValueError("build-code/SKILL.md no longer carries the三-call block")
        return body.replace(_CODE_THREE, want, 1)

    if _READ_BOTH not in body:
        raise ValueError(f"{name}/SKILL.md no longer carries the Main-read sentence")
    if mode == "mini":
        out = body.replace(".full.md`", ".mini.md`")
        if out == body:
            raise ValueError(f"{name}/SKILL.md lists no .full.md Main to swap")
        # 有几份 Main 至今没有 mini。**回退到 full,但要吵。** 悄悄换菜单
        # (把没 mini 的样本从列表里删掉) 会改变模型的选择集,那是第二个变量;
        # 回退只让这几份在 mini 臂里仍是 full,是可记录、可从统计里剔除的混合。
        fell_back = []
        for rel in re.findall(r"<skill-dir>(/[^`]+\.mini\.md)", out):
            if not (WORKFLOWS / name / rel.lstrip("/")).is_file():
                fell_back.append(Path(rel).name.replace(".mini.md", ""))
                out = out.replace(f"<skill-dir>{rel}",
                                  f"<skill-dir>{rel[:-len('.mini.md')]}.full.md")
        if fell_back:
            MINI_FALLBACKS[name] = sorted(fell_back)
            print(f"  ⚠ {name}: 这些 Main 没有 mini,本臂仍用 full —— "
                  + ", ".join(sorted(fell_back)), flush=True)
        return out
    # none —— 删掉整个 Samples 目录,并把读样本那句改成只读 reference
    start = body.find("## Samples")
    if start < 0:
        raise ValueError(f"{name}/SKILL.md has no '## Samples' section")
    tail = body.find("\nFollow the selected reference", start)
    if tail < 0:
        raise ValueError(f"{name}/SKILL.md has no closing 'Follow the selected' line")
    return (body[:start].rstrip() + body[tail:]).replace(
        _READ_BOTH, _READ_REFERENCE_ONLY, 1)


def routed_workflow(
    name: str,
    root: Path = WORKFLOWS,
    *,
    include_aux: bool = False,
    samples: str = "full",
) -> str:
    """Inline the one Planner-routed SKILL; references and samples stay deferred."""
    if name not in PAGE_WORKFLOWS:
        raise ValueError(f"unknown routed workflow {name!r}; expected {PAGE_WORKFLOWS}")
    if samples not in SAMPLE_MODES:
        raise ValueError(f"unknown sample mode {samples!r}; expected {SAMPLE_MODES}")
    # aux = Main 之外再挂 0–3 份同类 mini。配 mini 就是「多份紧凑样本」那一臂;
    # 配 none 无意义 —— aux 目录里那句「别再选 Main 的 id」没有指代对象。
    if include_aux and samples == "none":
        raise ValueError("--aux-samples 需要一个 Main,不能配 samples=none")
    path = root / name / "SKILL.md"
    if not path.is_file():
        raise FileNotFoundError(f"routed workflow is not installed: {path}")
    body = _apply_sample_mode(
        name, path.read_text(encoding="utf-8", errors="replace").strip(), samples)
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
    # `/…/workflows/build-page/` 这 60 多个字符 —— build-page 的 SKILL 里 25 条路径,
    # 光前缀就占 1,575 字符(全块的 22.6%),四个 workflow 合计 3,089 字符。
    # 工具侧接受相对 workflow 根的路径(tools._is_workflow_resource 按 resource_root
    # 解析),所以留相对路径 + 在标签上声明根目录即可,零信息损失。
    root_dir = path.parent.resolve()
    body = body.replace("<skill-dir>/", "").replace("<skill-dir>", str(root_dir))
    block = (
        f'<workflow_skill name="{name}" root="{root_dir}">\n'
        f"下面所有 `references/…` 与 `samples/…` 路径都相对上面这个 root。\n\n"
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
DIRECTION_MENUS_FILE = "direction-menus.md"
_MENUS_START = "## Direction families"


def direction_block(root: Path = PROMPTS, menus: bool = False) -> str:
    """Load the Planner's visual-direction source verbatim."""
    parts = []
    for name in [DIRECTION_FILE] + ([DIRECTION_MENUS_FILE] if menus else []):
        path = root / name
        if not path.is_file():
            raise FileNotFoundError(f"direction_block requires {path}")
        text = path.read_text(encoding="utf-8")
        if name == DIRECTION_MENUS_FILE:
            if _MENUS_START not in text:
                raise ValueError(f"{path} is missing {_MENUS_START!r}")
            text = _MENUS_START + text.split(_MENUS_START, 1)[1]
        parts.append(f'<direction src="{name}">\n{text.strip()}\n</direction>')
    return "\n\n".join(parts)


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


def anti_slop_block(root: Path = WORKFLOWS) -> str:
    """Copy and visual guidance belongs to every Builder page."""
    return _source_block(root, ANTI_SLOP_FILES)


def theme_slop_block(root: Path = WORKFLOWS) -> str:
    """Theme guidance belongs only to the Planner's shared-theme decision."""
    return _source_block(root, (THEME_SLOP_FILE,))
