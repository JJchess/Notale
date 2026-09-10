# Legacy ImageSearch — 2026-09-08

Snapshots taken immediately before replacing nokey/Serper with Gemini Google Search.

- `core/media.py`: original shared executor, including nokey and Serper search.
- `core/test_media.py`: original contract, backend, safety and Planner regression tests.
- `web-media-getter/`: original vendor skill, executable, documentation and license.

This archive is not imported, advertised to models, or used as an automatic fallback.
The source snapshots retain their original relative imports; they are restoration
material, not an independently installed package.

To restore deliberately: copy the two core snapshots back to their corresponding
core paths, restore `web-media-getter/` under `vendor/skills/`, and set
`media.image_search_backend` to `nokey` (or `serper` with `SERPER_API_KEY`).
Review any changes made after this archive before overwriting files. No credentials
or generated assets are archived here. The old vendor license remains alongside it.
