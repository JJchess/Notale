# Template catalogs

The editor serves **original/**: eight editable full-page templates and eight standalone diagrams. Run `npm run templates:prepare` to regenerate both catalogs; `npm run diagrams:prepare` is an alias for that same generation. See [original catalog instructions](original/README.md).

The material described below is a **legacy reference reconstruction**, retained locally for review. It is not the active catalog and is excluded from the proposed source release until provenance is established. The old preparation scripts are not used by the public npm commands.

---

# Refined presentation templates

Eight editable page templates and five standalone diagrams, reconstructed against the corresponding PNGs in `../../refs/template/organized`. Original references remain unchanged. The source manifest's watermark exclusions are preserved.

`refined/manifest.json` is the catalog. Each entry has a self-contained `.html` preview, a rendered `.png` thumbnail, and a `.json` authoring payload (native dimensions, editable HTML, font declarations, content-addressed asset dependencies, and optional diagram variant). Thumbnails are rendered from the same HTML that is inserted; there is no screenshot overlay or alternate fidelity mode.

Regenerate from the frontend directory:

```sh
python scripts/templates/prepare-fonts.py
node scripts/templates/prepare.mjs
```

The preparation step needs the project's Playwright Chromium and Python fontTools/Brotli. It is an authoring tool, not part of the normal frontend build. Fonts retain full Chinese coverage for subsequent edits. Normal builds copy the prepared artifacts; neither the browser nor the backend needs access to `refs/`.

`refine-dom.mjs` removes source editing runtimes and pixel compensation layers, materializes useful decorations, preserves text and images, and freezes scoped native styles. Pyramid vertices use a shared apex/slope; clipping paths use direct transformed SVG geometry in object-bounding-box coordinates. SVG groups must not be placed inside `clipPath` (Chromium clips their contents away).

The editor uploads dependencies through the existing asset API, then inserts a page or transfers a diagram through the durable command queue. Diagram copies remap SVG references and group membership. Asset paths include their full-content hash prefix, so existing document resources are never replaced. Page instances retain their own palette and fit the document with uniform scale.

Focused integration check:

```sh
TEMPLATE_TEST_URL=http://127.0.0.1:4312 npx playwright test tests/template-library.spec.ts --workers=1
```

This checks page insertion, text/image edits, repeated clipped diagrams, shape edits, undo, and reopening an isolated sample. It does not run the rest of the editor's browser suite. Visual matching allows font rasterization differences from source PNGs.

Standalone diagrams retain only the model geometry and its labels: pyramid tiers, golden circles, 5W1H dimensions, four PREP arrows, and the ABC relationship. Explanations and examples belong to full-page templates. Rebuild only these figures with `node scripts/templates/prepare-diagrams.mjs`; full preparation uses the same extraction function. Diagram insertion fits within 45% of the canvas width and 50% of its height.
