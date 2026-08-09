---
name: page-builder-core
description: Build one restrained, legible, offline HTML-native lecture page.
allowed-tools: [context_read, acquire_media, generate_media, page_write, page_read, page_search, page_patch, check_page, submit_page]
---

# Page Builder Core

Build exactly one 1280×720 lecture page from the assigned PageContext.

## Workflow

1. Call `context_read` and continue from `nextOffset` until EOF. Preserve `page.claim`, the relevant
   terminology and notation, the narrative contract, visual contract, and source guardrails.
2. Treat `skills` as the complete ordered skill manifest. Read every assigned skill until
   `nextOffset=EOF` before calling `page_write`. When a skill item contains an `entrypoint`, pass that
   exact value on every chunk. Never turn a page type or component name into a speculative skill or
   entrypoint.
3. Call `page_write` with one HTML fragment. It may contain inline `<style>` and `<script>`, but no
   `doctype`, `html`, `head`, or `body` shell.
4. Use `page_patch` for targeted changes. `page_read` and `page_search` are recovery tools; avoid
   rereading the whole page when the current conversation already contains it.
5. Call `check_page` once the page is ready. Fix the exact failures and check again.
6. Call `submit_page` with no arguments. A prose answer is not completion.

## Runtime contract

- The iframe wrapper supplies `global.css`. Return exactly one root with `data-notale-page`; it inherits
  the locked deck background, foreground, typography, focus, and accent language. Use the supplied
  `--notale-*` variables for page chrome and do not redefine reserved variables. Page-local colors may
  still encode domain states, categories, warnings, and data.
- Everything must run offline: no CDN, remote font/image, `fetch`, remote `import`, placeholder, or
  unavailable third-party global.
- Use semantic HTML, visible focus states, sufficient contrast, and respect reduced motion.
- Keep one dominant visual anchor and one central teaching message. You choose the visual carrier;
  the planner owns knowledge sequence, not page composition. Avoid dashboard grids, generic
  cards, decorative gradients, excessive labels, and text that merely repeats the title.
- Prefer a complete static explanation. Outside simulation, runnable-code, and formative-assessment
  pages, use no controls when static juxtaposition, annotation, or sequence communicates the same
  evidence. An interaction earns its place only when changing a variable, choice, or state produces
  new observable evidence for the assigned learningAction. Interactive pages open in a meaningful
  state, expose visible feedback, and use deterministic bounded values; do not add instructions for
  self-evident controls.
- Every teaching interaction has an executable domain model behind it. The model may be an algorithm,
  equation, state machine, rule evaluator, or data transformation, but it is the sole source of
  instructional state. Event handlers submit inputs/actions or move a replay cursor; DOM, SVG, and
  Canvas only project model output. Do not hand-author successive frames, pre-bake outcome screens, or
  directly edit instructional DOM text to imitate a calculation. Pure presentation state such as focus
  may remain local, but it must not manufacture a subject-matter result.
- For identifiable people, documents, places, and historical events, prefer `acquire_media` over a
  CSS/SVG substitute. Use `generate_media` only for clearly non-documentary editorial illustration.
  Use the exact local HTML path returned by the tool and write meaningful alt text. If a media call
  fails or its budget is exhausted, do not repeat the same request; use an honest static subject diagram.
- Treat `sources` as the page's complete factual basis. You may mechanically instantiate examples,
  states, and computed results from them, but do not introduce a new subject-matter conclusion. Respect
  every source `guardrails` object. Set `boundReferences` to the non-empty subset of source IDs actually
  used. Speaker notes should explain the intended teaching move, not restate every visible sentence.

The page file is the workspace. Do not create a second planning or HTML copy.
