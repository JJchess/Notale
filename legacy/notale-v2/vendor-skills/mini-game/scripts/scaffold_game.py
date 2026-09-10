#!/usr/bin/env python3
"""Create a zero-dependency native Web Component mini-game starter."""

from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path


SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
LANG = re.compile(r"^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$")
SKILL_ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_ROOT = SKILL_ROOT / "assets" / "native-game-component"


def component_names(value: str) -> tuple[str, str]:
    slug = value.strip().lower()
    if not SLUG.fullmatch(slug):
        raise ValueError("name must use lowercase letters, digits, and single hyphens")
    if not slug.endswith("-game"):
        slug += "-game"
    class_name = "".join(part.capitalize() for part in slug.split("-"))
    return slug, class_name


def ensure_output(path: Path) -> None:
    if path.exists() and any(path.iterdir()):
        raise ValueError(f"output directory is not empty: {path}")
    path.mkdir(parents=True, exist_ok=True)


def render_template(source: Path, replacements: dict[str, str]) -> str:
    text = source.read_text(encoding="utf-8")
    for key, value in replacements.items():
        text = text.replace(key, value)
    leftovers = sorted(set(re.findall(r"__[A-Z0-9_]+__", text)))
    if leftovers:
        raise ValueError(f"unresolved template placeholders: {', '.join(leftovers)}")
    return text


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", required=True, help="Topic slug; '-game' is appended when absent.")
    parser.add_argument("--title", required=True, help="Visible game title.")
    parser.add_argument("--lang", default="en", help="BCP 47-style language tag; defaults to en.")
    parser.add_argument("--out", required=True, type=Path, help="New or empty output directory.")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        tag_name, class_name = component_names(args.name)
        if not args.title.strip():
            raise ValueError("title must not be blank")
        if not LANG.fullmatch(args.lang):
            raise ValueError("lang must be a simple BCP 47-style language tag")
        if not TEMPLATE_ROOT.is_dir():
            raise ValueError(f"missing template directory: {TEMPLATE_ROOT}")
        ensure_output(args.out)

        replacements = {
            "__TAG_NAME__": tag_name,
            "__CLASS_NAME__": class_name,
            "__TITLE_HTML__": html.escape(args.title.strip(), quote=True),
            "__TITLE_JSON__": json.dumps(args.title.strip(), ensure_ascii=False),
            "__LANG__": args.lang,
        }
        outputs = {
            "index.html.tmpl": args.out / "index.html",
            "game-component.js.tmpl": args.out / "game-component.js",
        }
        for template_name, destination in outputs.items():
            rendered = render_template(TEMPLATE_ROOT / template_name, replacements)
            destination.write_text(rendered, encoding="utf-8")
    except (OSError, ValueError) as error:
        print(f"ERROR: {error}")
        return 1

    print(f"Created <{tag_name}> in {args.out}")
    print("Replace the starter mechanic and copy, then run validate_game.py.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
