"""Deterministically package ordered page artifacts as an offline Reveal deck."""

from __future__ import annotations

import html as html_mod
import re
import shutil
from pathlib import Path

from notale.core.models import PageArtifact, TypeScale
from notale.style_studio.decoration import render_page_decorations
from notale.tools.managed_component import hydrate_component_mounts
from notale.utils.skill_catalog import STYLE_TOKEN_KEYS, is_safe_style_value
from notale.web.font_catalog import (
    LEGACY_FONT_TOKEN_KEYS,
    NEW_FONT_TOKEN_KEYS,
    font_variable_declarations,
    prepare_font_runtime,
)


_DECK = """<!doctype html>
<html lang="{language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <link rel="stylesheet" href="runtime/reveal/reveal.css">
  <link rel="stylesheet" href="runtime/fonts.css">
  <link rel="stylesheet" href="runtime/deck-shell.css">
</head>
<body>
  <div class="reveal"><div class="slides">
{slides}
  </div></div>
  <div class="deck-overview" data-deck-overview role="dialog" aria-modal="true"
       aria-labelledby="deck-overview-title" hidden>
    <header class="deck-overview-header">
      <div><h2 id="deck-overview-title">总览</h2><p>选择页面继续讲义</p></div>
      <output data-deck-overview-count aria-live="polite"></output>
      <button class="deck-overview-close" type="button" data-deck-action="close-overview"
              title="关闭总览 (Esc)" aria-label="关闭总览">×</button>
    </header>
    <div class="deck-overview-scroll" data-deck-overview-scroll>
      <div class="deck-overview-grid" data-deck-overview-grid role="list"></div>
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

_SLIDE = """<!doctype html>
<html lang="{language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="../runtime/global.css">
  <style>html,body{{width:100%;height:100%;margin:0;overflow:hidden}}*,*::before,*::after{{box-sizing:border-box}}</style>
</head>
<body data-page="{page}">
{content}
<template data-notale-decoration-template>{decorations}</template>
<script>
(() => {{
  "use strict";
  const decorationTemplate = document.querySelector("[data-notale-decoration-template]");
  const pageRoot = document.querySelector("[data-notale-page]");
  if (decorationTemplate && pageRoot) {{
    pageRoot.appendChild(decorationTemplate.content.cloneNode(true));
  }}
  if (decorationTemplate) decorationTemplate.remove();
  addEventListener("message", event => {{
    const data = event.data || {{}};
    if (data.source !== "notale-deck" || !String(data.type || "").startsWith("notale:")) return;
    document.dispatchEvent(new CustomEvent(data.type, {{detail:data.detail || {{}}}}));
  }});
  addEventListener("keydown", event => {{
    const target = event.target;
    const editable = target && (target.matches("input,textarea,select,[contenteditable=true]") || target.closest("[contenteditable=true]"));
    if (editable || event.altKey || event.ctrlKey || event.metaKey) return;
    const previous = ["ArrowLeft","ArrowUp","PageUp"].includes(event.key);
    const next = ["ArrowRight","ArrowDown","PageDown"," "].includes(event.key);
    if (!previous && !next) return;
    event.preventDefault();
    parent.postMessage({{source:"notale-slide",type:"notale:navigate",direction:previous?"prev":"next"}}, "*");
  }});
}})();
</script>
</body>
</html>"""


def _safe_style_tokens(tokens: dict[str, str] | None) -> str:
    declarations: list[str] = []
    font_keys = NEW_FONT_TOKEN_KEYS | LEGACY_FONT_TOKEN_KEYS
    for raw_key, raw_value in sorted((tokens or {}).items()):
        key = re.sub(r"[^a-z0-9-]+", "-", str(raw_key).lower()).strip("-")
        value = str(raw_value).strip()
        if key in STYLE_TOKEN_KEYS - font_keys and is_safe_style_value(value):
            declarations.append(f"  --notale-{key}: {value};")
    declarations.extend(
        f"  --notale-{key}: {value};"
        for key, value in font_variable_declarations(tokens).items()
    )
    return "\n:root {\n" + "\n".join(declarations) + "\n}\n"


def _type_scale_declarations(type_scale: TypeScale | None) -> list[str]:
    """Compile a pack's type scale into fluid CSS customs.

    The slide viewport is exactly 1280px wide in the deck and under the
    inspection renderer alike, so the vw middle term is deterministic rather
    than a guess about the reader's window.
    """
    if type_scale is None:
        return []
    declarations: list[str] = []
    for role, spec in sorted(type_scale.roles.items(), key=lambda item: item[0].value):
        name = role.value
        declarations.append(
            f"  --notale-type-{name}: clamp("
            f"{spec.min_px:g}px, {spec.preferred_vw:g}vw, {spec.max_px:g}px);"
        )
        declarations.append(f"  --notale-type-{name}-leading: {spec.line_height:g};")
        declarations.append(
            f"  --notale-type-{name}-tracking: {spec.letter_spacing_em:g}em;"
        )
        declarations.append(
            f"  --notale-type-{name}-weight: {700 if spec.bold else 400};"
        )
    return declarations


def prepare_deck_runtime(
    run_dir: Path,
    style_tokens: dict[str, str] | None,
    *,
    type_scale: TypeScale | None = None,
) -> None:
    """Install the exact runtime shared by inspection and final assembly."""

    run_dir = Path(run_dir)
    (run_dir / "slides").mkdir(parents=True, exist_ok=True)
    root = Path(__file__).resolve().parent
    reveal = root / "vendor" / "reveal"
    shell = root / "runtime"
    required = [
        reveal / "reveal.css", reveal / "reveal.js", reveal / "plugin" / "notes.js",
        reveal / "plugin" / "notes.html", shell / "deck-shell.css",
        shell / "deck-shell.js", shell / "global.css",
    ]
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise FileNotFoundError(f"offline deck runtime is incomplete: {missing}")
    target = run_dir / "runtime"
    (target / "reveal" / "plugin").mkdir(parents=True, exist_ok=True)
    shutil.copy2(reveal / "reveal.css", target / "reveal" / "reveal.css")
    shutil.copy2(reveal / "reveal.js", target / "reveal" / "reveal.js")
    shutil.copy2(reveal / "plugin" / "notes.js", target / "reveal" / "plugin" / "notes.js")
    shutil.copy2(reveal / "plugin" / "notes.html", target / "reveal" / "plugin" / "notes.html")
    shutil.copy2(shell / "deck-shell.css", target / "deck-shell.css")
    shutil.copy2(shell / "deck-shell.js", target / "deck-shell.js")
    prepare_font_runtime(run_dir, style_tokens)
    css = (shell / "global.css").read_text(encoding="utf-8")
    root_block = _safe_style_tokens(style_tokens)
    scale = _type_scale_declarations(type_scale)
    if scale:
        root_block = root_block.rstrip()[:-1].rstrip() + "\n" + "\n".join(scale) + "\n}\n"
    (target / "global.css").write_text(css.rstrip() + "\n" + root_block, encoding="utf-8")


def render_slide_document(
    html_fragment: str,
    *,
    page: int,
    run_dir: Path,
    language: str = "zh",
    page_role: str = "content",
) -> str:
    """Render one fragment in the same document shell used by the final deck."""

    content = hydrate_component_mounts(html_fragment, page=page, run_dir=run_dir)
    decorations = render_page_decorations(
        run_dir, page=page, page_role=page_role
    )
    return _SLIDE.format(
        language=html_mod.escape(language, quote=True),
        page=page,
        content=content,
        decorations=decorations,
    )


def write_deck_package(
    run_dir: Path,
    pages: list[PageArtifact],
    title: str,
    *,
    language: str = "zh",
    style_tokens: dict[str, str] | None = None,
    type_scale: TypeScale | None = None,
    page_roles: list[str] | None = None,
) -> Path:
    run_dir = Path(run_dir)
    slides_dir = run_dir / "slides"
    slides_dir.mkdir(parents=True, exist_ok=True)
    prepare_deck_runtime(run_dir, style_tokens, type_scale=type_scale)
    if page_roles is not None and len(page_roles) != len(pages):
        raise ValueError("page_roles length must match pages")
    sections: list[str] = []
    for number, artifact in enumerate(pages, 1):
        page_id = f"p{number}"
        document = render_slide_document(
            artifact.html,
            page=number,
            run_dir=run_dir,
            language=language,
            page_role=page_roles[number - 1] if page_roles is not None else "content",
        )
        (slides_dir / f"{page_id}.html").write_text(document, encoding="utf-8")
        sections.append(
            f'    <section data-page-id="{page_id}">\n'
            f'      <iframe class="notale-slide-frame" data-page-id="{page_id}" src="slides/{page_id}.html" '
            f'title="讲义页面 {number}" sandbox="allow-scripts"></iframe>\n'
            f'      <aside class="notes">{html_mod.escape(artifact.notes)}</aside>\n'
            "    </section>"
        )
    deck = _DECK.format(
        language=html_mod.escape(language, quote=True),
        title=html_mod.escape(title),
        slides="\n".join(sections),
    )
    path = run_dir / "deck.html"
    path.write_text(deck, encoding="utf-8")
    return path
