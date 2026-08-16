"""Render a pack's own tokens into real slides, used as its visual baseline.

deckbase's ``role_exemplars`` are reference images drawn by an image model.
notale renders HTML, so it can produce the honest version of the same thing: an
actual 1280x720 slide, laid out by the real deck runtime under the pack's real
tokens and fonts. Nothing is approximated, and the page inspector can hold a
generated page against a baseline the pack itself produced.

The specimens are deliberately content-free — a type scale, a surface, a rule, a
few accents. They demonstrate the *style*, not a lecture, so they stay valid for
any topic the pack is later used for.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Dict, List, Union

from notale.style_studio.models import StylePack
from notale.style_studio.registry import get_pack, reload_registry
from notale.utils.config import get_config
from notale.web.browser import BrowserPageRenderer
from notale.web.deck import prepare_deck_runtime, render_slide_document

_CONFIG = get_config()

_COVER = """
<section data-notale-page style="display:flex;flex-direction:column;justify-content:center;
  gap:28px;padding:72px;background:var(--notale-bg);color:var(--notale-ink)">
  <div data-notale-role="cell" style="font-family:var(--notale-font-body);font-size:15px;letter-spacing:.14em;
    text-transform:uppercase;color:var(--notale-muted)">Style specimen</div>
  <h1 data-notale-role="title" style="font-family:var(--notale-font-display);font-size:88px;line-height:1.15;
    margin:0;max-width:16ch">{label}</h1>
  <p data-notale-role="lede" style="font-family:var(--notale-font-body);font-size:20px;line-height:1.45;margin:0;
    max-width:52ch;color:var(--notale-muted)">{description}</p>
  <div style="display:flex;gap:12px;margin-top:8px">
    <span style="width:120px;height:8px;background:var(--notale-accent)"></span>
    <span style="width:72px;height:8px;background:var(--notale-accent-2)"></span>
    <span style="width:40px;height:8px;background:var(--notale-accent-3)"></span>
  </div>
</section>
"""

_CONTENT = """
<section data-notale-page style="display:grid;grid-template-columns:38fr 62fr;gap:40px;
  padding:64px;background:var(--notale-bg);color:var(--notale-ink)">
  <div style="display:flex;flex-direction:column;gap:20px">
    <h2 data-notale-role="banner" style="font-family:var(--notale-font-display);font-size:46px;line-height:1.2;margin:0">
      Type and surface</h2>
    <p data-notale-role="lede" style="font-family:var(--notale-font-body);font-size:19px;line-height:1.45;margin:0;
      color:var(--notale-muted)">Body copy at the working size, over the page ground.
      中文正文在同一号字下的密度与呼吸。</p>
    <code style="font-family:var(--notale-font-mono);font-size:15px;
      color:var(--notale-accent)">tokens.render(page)</code>
  </div>
  <div style="display:flex;flex-direction:column;gap:16px">
    <div style="background:var(--notale-surface);border:1px solid var(--notale-line);
      padding:28px;display:flex;flex-direction:column;gap:10px">
      <div data-notale-role="card" style="font-family:var(--notale-font-display);font-size:28px;line-height:1.4">Raised surface</div>
      <div style="font-family:var(--notale-font-body);font-size:16px;
        color:var(--notale-muted)">Separated by a single rule, not by a shadow.</div>
    </div>
    <div style="display:flex;gap:16px">
      <div style="flex:1;height:96px;background:var(--notale-accent)"></div>
      <div style="flex:1;height:96px;background:var(--notale-accent-2)"></div>
      <div style="flex:1;height:96px;background:var(--notale-accent-3)"></div>
    </div>
    <div style="border-top:1px solid var(--notale-line);padding-top:14px;
      font-family:var(--notale-font-body);font-size:14px;color:var(--notale-muted)">
      caption / annotation scale</div>
  </div>
</section>
"""

# Derived renders carry this prefix so a fork can tell them apart from authored
# reference images. A specimen is only true of the palette that produced it.
SPECIMEN_PREFIX = "specimen_"

# role -> (filename stem, fragment template)
_SPECIMENS = (
    ("cover", f"{SPECIMEN_PREFIX}cover", _COVER),
    ("content", f"{SPECIMEN_PREFIX}content", _CONTENT),
)


def _fragments(pack: StylePack, limit: int) -> List[tuple[str, str, str]]:
    label = pack.label
    description = pack.description() or pack.label
    out = []
    for role, stem, template in _SPECIMENS[:limit]:
        out.append((role, stem, template.format(label=label, description=description)))
    return out


async def _render(pack: StylePack, limit: int) -> Dict[str, List[str]]:
    import tempfile

    rendered: Dict[str, List[str]] = {role: [] for role, _, _ in _SPECIMENS}
    destination = pack.pack_dir / "exemplars"
    destination.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="notale-exemplar-") as staging:
        stage = Path(staging)
        prepare_deck_runtime(stage, pack.notale_tokens(), type_scale=pack.type_scale())
        async with BrowserPageRenderer() as renderer:
            for index, (role, stem, fragment) in enumerate(_fragments(pack, limit), 1):
                document = stage / "slides" / f"p{index}.html"
                document.write_text(
                    render_slide_document(fragment, page=index, run_dir=stage),
                    encoding="utf-8",
                )
                page = await renderer.render(document)
                name = f"{stem}.png"
                (destination / name).write_bytes(page.screenshot)
                rendered[role] = [f"exemplars/{name}"]
    return rendered


async def render_pack_exemplars_async(
    pack: Union[StylePack, str],
    *,
    pages: int = 0,
) -> Dict[str, List[str]]:
    """Render specimens for a pack and record them in its ``role_exemplars``.

    The workflow calls this from inside its own event loop, so the awaitable
    form is the real one and the sync wrapper below is for the CLI.
    """
    if isinstance(pack, str):
        pack = get_pack(pack)
    limit = pages or _CONFIG.style.exemplar_pages
    if limit <= 0:
        return {role: [] for role, _, _ in _SPECIMENS}

    rendered = await _render(pack, min(limit, len(_SPECIMENS)))
    return _record(pack, rendered)


def render_pack_exemplars(
    pack: Union[StylePack, str],
    *,
    pages: int = 0,
) -> Dict[str, List[str]]:
    """Blocking wrapper for CLI use. Never call this from an async context."""
    return asyncio.run(render_pack_exemplars_async(pack, pages=pages))


def _record(pack: StylePack, rendered: Dict[str, List[str]]) -> Dict[str, List[str]]:
    path = pack.pack_dir / "pack.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    roles = dict(data.get("role_exemplars") or {})
    for role in ("cover", "section", "content", "closing"):
        roles.setdefault(role, [])
    for role, names in rendered.items():
        if names:
            roles[role] = names
    # A section break reads like a cover; a closing reads like content.
    if rendered.get("cover"):
        roles["section"] = rendered["cover"]
    if rendered.get("content"):
        roles["closing"] = rendered["content"]
    data["role_exemplars"] = roles
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    reload_registry()
    return roles
