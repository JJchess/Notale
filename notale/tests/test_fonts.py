from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from notale.core.models import StyleOutput
from notale.tests.fake_llm import _default_style
from notale.tools.managed_component import render_component_document
from notale.utils.skill_catalog import create_generated_style
from notale.web.browser import BrowserPageRenderer, BrowserUnavailable, browser_candidates
from notale.web.deck import prepare_deck_runtime, render_slide_document
from notale.web.font_catalog import FONT_ROOT, load_font_catalog


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _tokens(*, display: str, body: str, mono: str) -> dict[str, str]:
    return {
        "bg": "#f5f1e8",
        "surface": "#fffdf7",
        "ink": "#17202a",
        "muted": "#66727c",
        "accent": "#176b87",
        "accent-2": "#c46a28",
        "accent-3": "#4f7d5d",
        "line": "#a8b1b5",
        "font-display": display,
        "font-body": body,
        "font-mono": mono,
    }


def test_offline_catalog_has_twenty_integrity_checked_families():
    catalog = load_font_catalog()
    assert len(catalog.families) == 20
    assert len({family.id for family in catalog.families}) == 20
    assert catalog.fallback == "noto-sans-sc"
    assert len(catalog.ids_for_role("display")) == 18
    assert len(catalog.ids_for_role("body")) == 7
    assert set(catalog.ids_for_role("mono")) == {"jetbrains-mono", "ibm-plex-mono"}

    for family in catalog.families:
        assert family.files
        license_path = FONT_ROOT / family.license_file
        assert license_path.is_file()
        assert _sha256(license_path) == family.license_sha256
        for face in family.files:
            path = FONT_ROOT / face.path
            assert path.is_file()
            assert path.stat().st_size == face.bytes
            assert _sha256(path) == face.sha256


def test_runtime_copies_only_selected_families_when_body_covers_chinese(tmp_path: Path):
    tokens = _tokens(
        display="smiley-sans", body="noto-serif-sc", mono="jetbrains-mono"
    )
    prepare_deck_runtime(tmp_path, tokens)

    files = {path.name for path in (tmp_path / "runtime" / "fonts").iterdir()}
    assert files == {
        "smiley-sans-400.woff2",
        "noto-serif-sc-vf.woff2",
        "jetbrains-mono-vf.woff2",
    }
    css = (tmp_path / "runtime" / "fonts.css").read_text(encoding="utf-8")
    assert 'font-family: "Notale Smiley Sans"' in css
    assert '--notale-font-body: "Notale Noto Serif SC", serif;' in css
    assert "http://" not in css and "https://" not in css


def test_runtime_adds_cjk_fallback_for_latin_body(tmp_path: Path):
    tokens = _tokens(display="fraunces", body="inter", mono="ibm-plex-mono")
    prepare_deck_runtime(tmp_path, tokens)

    files = {path.name for path in (tmp_path / "runtime" / "fonts").iterdir()}
    assert files == {
        "fraunces-vf.woff2",
        "inter-vf.woff2",
        "ibm-plex-mono-400.woff2",
        "ibm-plex-mono-700.woff2",
        "noto-sans-sc-vf.woff2",
    }
    css = (tmp_path / "runtime" / "fonts.css").read_text(encoding="utf-8")
    assert '--notale-font-body: "Notale Inter", "Notale Noto Sans SC", sans-serif;' in css


def test_legacy_font_tokens_remain_loadable_but_new_style_schema_is_catalog_only():
    legacy = _default_style()
    legacy["name"] = "legacy-font-style"
    legacy["tokens"] = {
        **{key: value for key, value in legacy["tokens"].items() if not key.startswith("font-")},
        "font": "Georgia, serif",
        "mono": "Consolas, monospace",
    }
    assert create_generated_style(**legacy).tokens["font"] == "Georgia, serif"

    with pytest.raises(ValueError, match="cannot mix"):
        create_generated_style(
            **{
                **_default_style(),
                "tokens": {**_default_style()["tokens"], "font": "Georgia, serif"},
            }
        )
    schema = StyleOutput.model_json_schema()["$defs"]["StyleTokens"]["properties"]
    assert "font" not in schema and "mono" not in schema


@pytest.mark.asyncio
async def test_slide_and_managed_component_load_the_same_offline_font_roles(tmp_path: Path):
    if not browser_candidates():
        pytest.skip("no local Chromium executable")
    style_data = _default_style()
    style_data["tokens"] = _tokens(
        display="smiley-sans", body="noto-serif-sc", mono="jetbrains-mono"
    )
    style = create_generated_style(**style_data)
    prepare_deck_runtime(tmp_path, style.tokens)

    slide = render_slide_document(
        '<section data-notale-page><h1 id="display" style="font-family:var(--notale-font-display)">字体角色</h1>'
        '<p id="body">中文正文 offline body</p>'
        '<code id="mono" style="font-family:var(--notale-font-mono)">const answer = 42;</code></section>',
        page=1,
        run_dir=tmp_path,
    )
    slide_path = tmp_path / "slides" / "font-test.html"
    slide_path.write_text(slide, encoding="utf-8")
    component_path = tmp_path / "components" / "font-test.html"
    component_path.parent.mkdir(parents=True, exist_ok=True)
    component_path.write_text(
        render_component_document(
            '<main><h1 id="display" style="font-family:var(--notale-font-display)">组件标题</h1>'
            '<p id="body">组件正文</p><code id="mono" style="font-family:var(--notale-font-mono)">x = 1</code></main>',
            style=style,
            language="zh",
            title="字体组件",
            width=800,
            height=420,
        ),
        encoding="utf-8",
    )

    try:
        async with BrowserPageRenderer() as renderer:
            await renderer.render(slide_path)
            assert renderer._cdp is not None
            slide_fonts = await renderer._cdp.evaluate(
                """({
                  display:getComputedStyle(document.querySelector('#display')).fontFamily,
                  body:getComputedStyle(document.querySelector('#body')).fontFamily,
                  mono:getComputedStyle(document.querySelector('#mono')).fontFamily,
                  faces:[...document.fonts].map(face => face.family)
                })"""
            )
            await renderer.render(component_path)
            component_fonts = await renderer._cdp.evaluate(
                """({
                  display:getComputedStyle(document.querySelector('#display')).fontFamily,
                  body:getComputedStyle(document.querySelector('#body')).fontFamily,
                  mono:getComputedStyle(document.querySelector('#mono')).fontFamily,
                  faces:[...document.fonts].map(face => face.family)
                })"""
            )
    except BrowserUnavailable as exc:
        pytest.skip(f"local Chromium cannot launch in this environment: {exc}")

    for result in (slide_fonts, component_fonts):
        assert result["display"].startswith('"Notale Smiley Sans"')
        assert result["body"].startswith('"Notale Noto Serif SC"')
        assert result["mono"].startswith('"Notale JetBrains Mono"')
        assert set(result["faces"]) >= {
            "Notale Smiley Sans", "Notale Noto Serif SC", "Notale JetBrains Mono",
        }
