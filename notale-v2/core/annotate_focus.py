"""Add a 「视觉焦点」 line to every page of a frozen plan without re-planning.

The visual-focus ablation must differ from its baseline by those lines only, so the
frozen ``pages.md`` is annotated by one planner-model call and every heading and topic
line is verified byte-identical afterwards.  Output goes to ``plan-focus/`` beside the
source ``plan/``; ``run-focus.sh`` copies it over the arm's ``plan/``.

    python3 -m core.annotate_focus --src ensemble-l8-google-low-r2-20260904
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from . import llm
from .builder import _SPEC_HEADING, _page_entries
from .llm import ROOT, config
from .planner import IDENTITY, VISUAL_FOCUS_SPEC

FOCUS = re.compile(r"^视觉焦点[：:]\s*(\S.*)$", re.M)
PROMPT = """下面是一套互动讲义已经定稿的页表。按下面的规格给每一页补上「视觉焦点」一行，
其余内容一个字不改：标题行、主题行、图池表都原样保留，不增删页，不改顺序，
不加说明。只输出补好后的整份页表。

{spec}

---
{pages}"""


def annotate(pages_md: str, effort: str) -> str:
    prompt = PROMPT.format(spec=VISUAL_FOCUS_SPEC, pages=pages_md)
    r = llm.respond(IDENTITY, [{"role": "user", "content": prompt}], [], effort, tag="focus")
    return llm.strip_fence(llm.text_of(r)).strip() + "\n"


def check(original: str, annotated: str) -> list[tuple[str, str, str]]:
    """Return the annotated entries; raise if anything but focus lines changed."""
    src, out = _page_entries(original), _page_entries(annotated)
    if [(p, l) for p, l, _ in src] != [(p, l) for p, l, _ in out]:
        raise ValueError("标题行或页序变了")
    for (pid, label, body0), (_, _, body1) in zip(src, out):
        topic0 = body0.splitlines()[0].strip() if body0 else ""
        rest = FOCUS.sub("", body1).strip()
        if rest != body0.strip():
            raise ValueError(f"{pid}: 除视觉焦点外的正文变了：{rest[:80]!r} != {body0.strip()[:80]!r}")
        n = len(FOCUS.findall(body1))
        want = 0 if label == "代码页" else 1
        if n != want:
            raise ValueError(f"{pid} [{label}] 有 {n} 行视觉焦点，应为 {want}")
        if want and not body1.strip().startswith(topic0):
            raise ValueError(f"{pid}: 视觉焦点必须排在主题行之后")
    return out


def rebuild(original: str, entries: list[tuple[str, str, str]]) -> str:
    """Original preface (image pool) + annotated page blocks; the model's preface is discarded."""
    preface = original.split("# page-", 1)[0].strip()
    blocks = "\n\n".join(f"# {pid} [{label}]\n{body}" for pid, label, body in entries)
    return f"{preface}\n\n{blocks}\n"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="冻结 fixture 的 run label")
    ap.add_argument("--effort", default=config()["planner"]["reasoning_effort"])
    a = ap.parse_args()
    plan = ROOT / "runs" / a.src / "pages" / "plan"
    out_dir = plan.parent / "plan-focus"
    original = (plan / "pages.md").read_text(encoding="utf-8")
    out_dir.mkdir(exist_ok=True)
    annotated = annotate(original, a.effort)
    (out_dir / "pages.raw.md").write_text(annotated, encoding="utf-8")  # 校验前先落盘,失败不白付
    entries = check(original, annotated)
    (out_dir / "pages.md").write_text(rebuild(original, entries), encoding="utf-8")
    for pid, label, body in entries:
        nn = _SPEC_HEADING.search(f"# {pid} [{label}]").group(2)
        (out_dir / f"p{nn}.md").write_text(f"# {pid} [{label}]\n{body}\n", encoding="utf-8")
    n = sum(1 for _, l, _ in entries if l != "代码页")
    print(f"{n} 页补了视觉焦点 → {out_dir.relative_to(ROOT)}")
    for pid, _, body in entries:
        m = FOCUS.search(body)
        print(f"  {pid}  {m.group(1)[:70] if m else '（代码页，无）'}")


if __name__ == "__main__":
    main()
