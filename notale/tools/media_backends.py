"""Pluggable image-generation backends.

`make_image` used to call one hardcoded endpoint. Backplate generation needs the
same call with different framing, and comparing engines needs the same contract
sent to several of them, so the call moves behind an interface.

Ported in spirit from deckbase, which reached the same shape from the other
direction: it grew `or_images/client.py` plus an `engine_bench` package to
compare GPT-Image-2 against Flux, and its own notes call out an `ImageBackend`
abstraction as the missing piece.

A backend receives a fully-composed prompt and returns bytes. It does not know
about pages, assets, budgets, or manifests — those stay in `tools/media.py`.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass, field
from typing import Any, Protocol

from notale.utils.config import get_config

_CONFIG = get_config().media


class ImageBackendError(RuntimeError):
    """A backend could not produce an image. Callers surface this as a tool error."""


class ImageBackendUnavailable(ImageBackendError):
    """The backend cannot run at all here — no key, no network, not configured."""


@dataclass(frozen=True)
class ImageRequest:
    """What to draw. Backends map these onto whatever fields they support."""

    prompt: str
    negative_prompt: str = ""
    width: int = 1280
    height: int = 720
    seed: int | None = None

    def provider_prompt(self) -> str:
        """Flatten the contract for providers with a single prompt field."""

        prompt = self.prompt.strip()
        negative = self.negative_prompt.strip()
        if not negative:
            return prompt
        return f"{prompt}\n\nAvoid: {negative}."


@dataclass(frozen=True)
class ImageResult:
    data: bytes
    model: str
    payload: dict[str, Any] = field(default_factory=dict)
    usage: dict[str, Any] = field(default_factory=dict)


class ImageBackend(Protocol):
    name: str

    async def generate(self, request: ImageRequest, *, client_factory: Any) -> ImageResult:
        ...


class SeedreamBackend:
    """The configured generation endpoint — notale's behaviour before this split.

    The wire payload is deliberately still exactly ``{"model", "prompt"}``.
    This backend has no native negative-prompt or size field, so
    ``negative_prompt`` is folded into the prose by the caller rather than
    invented here.
    """

    name = "seedream"

    async def generate(self, request: ImageRequest, *, client_factory: Any) -> ImageResult:
        import os

        import httpx

        key = os.environ.get(_CONFIG.generation_api_key_env, "").strip()
        if not key:
            raise ImageBackendUnavailable(
                f"missing media API key in {_CONFIG.generation_api_key_env}"
            )
        payload = {
            "model": _CONFIG.generation_model,
            "prompt": request.provider_prompt(),
        }
        factory = client_factory or httpx.AsyncClient
        async with factory(
            timeout=_CONFIG.request_timeout_sec, follow_redirects=True
        ) as client:
            response = await client.post(
                _CONFIG.generation_endpoint,
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            body = response.json()
            image = (body.get("data") or [None])[0]
            if not isinstance(image, dict):
                raise ImageBackendError("image response is missing data[0]")
            if image.get("b64_json"):
                binary = base64.b64decode(image["b64_json"], validate=True)
            elif image.get("url"):
                from notale.tools.media import _download

                binary, _ = await _download(client, str(image["url"]))
            else:
                raise ImageBackendError("image response has neither b64_json nor url")
        return ImageResult(
            data=binary,
            model=_CONFIG.generation_model,
            payload=payload,
            usage=body.get("usage") or {},
        )


class NullBackend:
    """Refuses every request. Used when generation is disabled or offline."""

    name = "null"

    async def generate(self, request: ImageRequest, *, client_factory: Any) -> ImageResult:
        del request, client_factory
        raise ImageBackendUnavailable("image generation is disabled (backend=null)")


_BACKENDS: dict[str, type] = {
    SeedreamBackend.name: SeedreamBackend,
    NullBackend.name: NullBackend,
}


def available_backends() -> tuple[str, ...]:
    return tuple(sorted(_BACKENDS))


def get_backend(name: str = "") -> ImageBackend:
    key = (name or getattr(_CONFIG, "backend", "") or SeedreamBackend.name).strip()
    backend = _BACKENDS.get(key)
    if backend is None:
        raise ImageBackendUnavailable(
            f"unknown image backend {key!r}; known: {available_backends()}"
        )
    return backend()  # type: ignore[return-value]
