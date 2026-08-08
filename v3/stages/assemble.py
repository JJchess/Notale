"""[5] Assemble & Global pass —— 单线程。拼装 + 跨页一致性。

WIP 门禁：只有 verified / degraded 页进成品（orchestrator 保证传入的就是这两类）。
每个 PageArtifact.html 保持 v3 的权威页产物，落成独立 slides/<pageId>.html，再由
Reveal.js 外壳通过 sandbox iframe 整页嵌入。页面间 CSS/JS/ID 互不污染。
一致性 v0 全是确定性算法：术语/符号出现形态校验、shingle 近重复、plan 覆盖。
difficultyProgression 未实现 → None，如实标注。
"""

from __future__ import annotations

import html as html_mod
import re
import shutil
from pathlib import Path

from artifacts import (
    AssembledDeck,
    ConsistencyReport,
    Globals,
    Outline,
    PageArtifact,
    PageSpec,
)
from util import jaccard, shingles, visible_text

_DUP_THRESHOLD = 0.6  # shingle Jaccard 阈值：超过判近重复

_SAFE_PAGE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")

_DECK_TEMPLATE = """<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <link rel="stylesheet" href="runtime/reveal/reveal.css">
  <link rel="stylesheet" href="runtime/deck-shell.css">
</head>
<body>
  <div class="reveal">
    <div class="slides">
{slides}
    </div>
  </div>
  <nav class="ppt-bar" aria-label="讲义操作">
    <button type="button" data-deck-action="prev" title="上一页 (←)" aria-label="上一页">◀</button>
    <button type="button" data-deck-action="next" title="下一页 (→)" aria-label="下一页">▶</button>
    <span class="sep" aria-hidden="true"></span>
    <button type="button" data-deck-action="overview" title="总览 (O)" aria-label="总览">▦</button>
  </nav>
  <script src="runtime/reveal/reveal.js"></script>
  <script src="runtime/reveal/plugin/notes.js"></script>
  <script src="runtime/deck-shell.js"></script>
</body>
</html>"""

_SLIDE_DOCUMENT = """<!doctype html>
<html lang="{language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    html, body {{ width:100%; height:100%; margin:0; overflow:hidden; }}
    *, *::before, *::after {{ box-sizing:border-box; }}
  </style>
</head>
<body data-page-id="{page_id}">
{content}
<script>
(function () {{
  "use strict";
  addEventListener("message", function (event) {{
    var data = event.data || {{}};
    if (data.source !== "notale-deck" || !String(data.type || "").startsWith("notale:")) return;
    document.dispatchEvent(new CustomEvent(data.type, {{ detail: data.detail || {{}} }}));
  }});
  addEventListener("keydown", function (event) {{
    var target = event.target;
    var editable = target && (target.matches("input, textarea, select, [contenteditable=true]") || target.closest("[contenteditable=true]"));
    if (editable || event.altKey || event.ctrlKey || event.metaKey) return;
    var prev = event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "PageUp";
    var next = event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "PageDown" || event.key === " ";
    if (!prev && !next) return;
    event.preventDefault();
    parent.postMessage({{ source: "notale-slide", type: "notale:navigate", direction: prev ? "prev" : "next" }}, "*");
  }});
  addEventListener("error", function (event) {{
    parent.postMessage({{ source: "notale-slide", type: "notale:error", message: event.message || "page runtime error" }}, "*");
  }});
}})();
</script>
</body>
</html>"""


def assemble_deck(
    pages: list[PageArtifact], specs: list[PageSpec], title: str
) -> tuple[AssembledDeck, str]:
    """编译 Reveal.js 外壳。页面正文另由 write_deck_package 写入 slides/。"""
    ordered = list(pages)  # 调用方按 specs 顺序传入
    seen: set[str] = set()
    for page in ordered:
        if not _SAFE_PAGE_ID.fullmatch(page.pageId):
            raise ValueError(f"不安全的 pageId，不能用作离线文件名：{page.pageId!r}")
        if page.pageId in seen:
            raise ValueError(f"重复 pageId：{page.pageId}")
        seen.add(page.pageId)

    slides = []
    for page in ordered:
        notes = html_mod.escape(page.speakerNotes)
        slides.append(
            '      <section data-page-id="{pid}">\n'
            '        <iframe class="notale-slide-frame" data-page-id="{pid}" '
            'src="slides/{pid}.html" title="{label}" sandbox="allow-scripts"></iframe>\n'
            '        <aside class="notes">{notes}</aside>\n'
            "      </section>".format(
                pid=html_mod.escape(page.pageId, quote=True),
                label=html_mod.escape(f"讲义页面 {page.pageId}", quote=True),
                notes=notes,
            )
        )
    deck_html = _DECK_TEMPLATE.format(
        title=html_mod.escape(title), slides="\n".join(slides)
    )
    spec_by_id = {s.pageId: s for s in specs}
    total = sum(spec_by_id[p.pageId].timeBudgetSec for p in ordered if p.pageId in spec_by_id)
    return AssembledDeck(pages=[p.pageId for p in ordered], totalDurationEstimate=total), deck_html


def _copy_runtime(run_dir: Path) -> None:
    """从仓库共享 viewer 复制固定 Reveal vendor；v3 只拥有自己的薄外壳。"""
    repo_root = Path(__file__).resolve().parents[2]
    reveal_source = repo_root / "viewer" / "vendor" / "reveal"
    shell_source = Path(__file__).resolve().parent.parent / "runtime"
    required = [
        reveal_source / "reveal.css",
        reveal_source / "reveal.js",
        reveal_source / "plugin" / "notes.js",
        reveal_source / "plugin" / "notes.html",
        shell_source / "deck-shell.css",
        shell_source / "deck-shell.js",
    ]
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise FileNotFoundError(f"Reveal 离线运行时不完整：{missing}")

    target = run_dir / "runtime"
    (target / "reveal" / "plugin").mkdir(parents=True, exist_ok=True)
    shutil.copy2(reveal_source / "reveal.css", target / "reveal" / "reveal.css")
    shutil.copy2(reveal_source / "reveal.js", target / "reveal" / "reveal.js")
    shutil.copy2(reveal_source / "plugin" / "notes.js", target / "reveal" / "plugin" / "notes.js")
    shutil.copy2(reveal_source / "plugin" / "notes.html", target / "reveal" / "plugin" / "notes.html")
    shutil.copy2(shell_source / "deck-shell.css", target / "deck-shell.css")
    shutil.copy2(shell_source / "deck-shell.js", target / "deck-shell.js")


def write_deck_package(
    run_dir: Path,
    pages: list[PageArtifact],
    specs: list[PageSpec],
    title: str,
    *,
    language: str = "zh",
) -> tuple[AssembledDeck, str]:
    """写出可离线交付的 Reveal.js 目录包。"""
    deck, deck_html = assemble_deck(pages, specs, title)
    slides_dir = run_dir / "slides"
    slides_dir.mkdir(parents=True, exist_ok=True)
    _copy_runtime(run_dir)
    for page in pages:
        document = _SLIDE_DOCUMENT.format(
            language=html_mod.escape(language, quote=True),
            page_id=html_mod.escape(page.pageId, quote=True),
            content=page.html,
        )
        (slides_dir / f"{page.pageId}.html").write_text(document, encoding="utf-8")
    (run_dir / "deck.html").write_text(deck_html, encoding="utf-8")
    deck.path = str(run_dir / "deck.html")
    return deck, deck_html


def _term_variants(text: str, term: str) -> set[str]:
    """术语的出现形态（大小写/全半角差异算变体）。"""
    return set(re.findall(re.escape(term), text, flags=re.I))


def consistency_report(
    pages: list[PageArtifact],
    specs: list[PageSpec],
    globals_: Globals,
    outline: Outline,
) -> ConsistencyReport:
    texts = {p.pageId: visible_text(p.html) + " " + p.speakerNotes for p in pages}

    # 术语/符号：同一术语在全篇出现形态应一致（v0 启发式：变体>1 即不一致）
    term_ok = True
    for term in globals_.terminology:
        variants: set[str] = set()
        for t in texts.values():
            variants |= _term_variants(t, term)
        if len(variants) > 1:
            term_ok = False
            break

    # 近重复页（shingle Jaccard）
    shingle_map = {pid: shingles(t) for pid, t in texts.items()}
    dups: list[str] = []
    ids = list(texts)
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            if jaccard(shingle_map[ids[i]], shingle_map[ids[j]]) >= _DUP_THRESHOLD:
                dups.append(f"{ids[i]}≈{ids[j]}")

    # plan 覆盖：每章 pageRange 内至少有一页真实存在（按 specs 序号区间映射，不假设 pageId 命名）
    have = {p.pageId for p in pages}
    uncovered = []
    for ch in outline.chapters:
        lo, hi = ch.pageRange
        chapter_pages = {s.pageId for s in specs[max(0, lo - 1) : hi]}
        if not chapter_pages & have:
            uncovered.append(ch.title)

    return ConsistencyReport(
        terminologyConsistent=term_ok,
        notationConsistent=None,  # 符号一致性 v0 未实现，如实 None
        difficultyProgression=None,  # 未实现，如实 None
        duplicateContentFlags=dups,
        planCoverage=uncovered,
    )
