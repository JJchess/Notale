"""Topic -> StylePack patch, via the one model call the style system makes.

The generated path is not a separate system from the pack library: a run forks a
preset, the model proposes a patch on top of it, and the usual fill/validate/
report machinery turns that into a draft pack. So a run's style is named,
versioned, inspectable, forkable, and — once published — reusable, instead of
being invented and discarded.

Splitting extraction (pure) from orchestration (does IO and calls a model) keeps
the interesting half testable without a network or a model.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, Set, Tuple

from notale.core.models import StyleOutput
from notale.core.observability import EventLog
from notale.style_studio.build.service import ensure_user_draft, merge_and_fill
from notale.style_studio.models import StylePack
from notale.style_studio.registry import get_pack, pack_exists
from notale.style_studio.tokens_bridge import notale_to_deckbase, type_hints_for

_SLUG = re.compile(r"[^a-z0-9-]+")


def extract_from_topic(output: StyleOutput) -> Tuple[Dict[str, Any], Set[str]]:
    """Convert a validated StyleOutput into a pack patch + adapter paths.

    Pure: no IO, no model. Everything the model actually decided is marked as an
    adapter field, so ``defaults_fill`` will not overwrite it, while anything it
    left out stays inherited from the parent pack.
    """
    tokens = output.tokens.model_dump(mode="json", by_alias=True)
    paths: Set[str] = {
        "provenance",
        "label",
        "skill_body",
        "compositions",
        "identity.notale_tokens",
        "identity.style_tokens",
        "identity.type_hints",
        "prompt_compile.style_prose",
        "prompt_compile.style_anchor",
    }
    patch: Dict[str, Any] = {
        "label": output.name.replace("-", " ").title(),
        "provenance": "from_topic",
        "identity": {
            "notale_tokens": tokens,
            # Keep the deckbase palette in step so the pack stays exportable.
            "style_tokens": notale_to_deckbase(tokens),
            "type_hints": type_hints_for(tokens),
        },
        "skill_body": output.body,
        "compositions": [item.model_dump(mode="json") for item in output.compositions],
        "prompt_compile": {
            "style_prose": output.description,
            "style_anchor": f"[style anchor] {output.name}: {output.description}",
        },
    }
    return patch, paths


def resolve_pack_id(name: str, *, discriminator: str = "") -> str:
    """Pick a free pack id for a generated style.

    The model names the style after the lecture, which is what makes the library
    browsable later — but two runs on one topic must not overwrite each other.
    """
    base = _SLUG.sub("-", str(name or "").strip().lower()).strip("-") or "run-style"
    if not pack_exists(base):
        return base
    if discriminator:
        candidate = f"{base}-{discriminator}"
        if not pack_exists(candidate):
            return candidate
    for index in range(2, 1000):
        candidate = f"{base}-{index}"
        if not pack_exists(candidate):
            return candidate
    raise RuntimeError(f"could not find a free pack id for {base!r}")


async def build_from_topic(
    llm: Any,
    topic: str,
    *,
    run_dir: Path,
    logger: EventLog,
    skill_text: str,
    parent_id: str = "",
    discriminator: str = "",
) -> StylePack:
    """Fork a parent, apply the model's patch, and return the resulting draft."""
    from notale.agents.style import generate_style_output

    output = await generate_style_output(
        llm, topic, run_dir=run_dir, logger=logger, skill_text=skill_text
    )
    pack_id = resolve_pack_id(output.name, discriminator=discriminator)
    ensure_user_draft(pack_id, parent_id=parent_id, label=output.name)
    patch, paths = extract_from_topic(output)
    merge_and_fill(
        pack_id,
        patch,
        adapter_paths=paths,
        adapters=["from-topic"],
        notes=[f"topic={topic[:120]}", f"model_name={output.name}"],
    )
    pack = get_pack(pack_id)
    logger.emit(
        "style.pack.built",
        agent_id="style",
        pack_id=pack.id,
        version=pack.version,
        status=pack.status,
        parent_id=pack.parent_id,
        provenance=pack.provenance,
    )
    return pack
