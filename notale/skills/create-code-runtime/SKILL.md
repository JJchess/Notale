---
name: create-code-runtime
description: Build one offline editable JavaScript exercise with visible execution evidence in a Notale HTML-native page.
allowed-tools: [context_read, page_write, page_read, page_search, page_patch, check_page, submit_page]
---

# Create a runnable code page

Build one dependency-free code activity inside the assigned `code-runnable` page. The current runtime
does not bundle Pyodide, CodeMirror, or package installation; do not promise Python execution or refer
to unavailable globals.

## Direct workflow

1. Read the complete PageContext and choose the smallest editable JavaScript decision that proves the
   page's central message.
2. Implement the whole fragment in one `page_write` call. Do not use scratch for a second copy.
3. Call `check_page` immediately. Use `page_search` and one focused `page_patch` only when a concrete
   check failure requires repair; then check and `submit_page`.

## Runtime contract

- Provide a labeled textarea or contenteditable editor, a Run button, Reset, and a visible output or
  test panel. Name the code artifact in its label; do not append an affordance or implementation note
  such as editability, callback names, or event plumbing.
- Seed the editor with a short, readable program. Put the conceptual branch, loop, comparison, or
  invariant in the editable code rather than hiding it in scaffolding.
- Execute the editor's actual JavaScript locally inside the already sandboxed page. The visible output,
  trace, and pass/fail state must come from that execution; Run handlers may not substitute canned
  results based on the current example or button state.
- Keep the runner, deterministic fixtures/evaluator, and renderer separate. The runner returns observed
  values or semantic events, the evaluator derives evidence from those values, and the renderer only
  projects that result. Catch syntax/runtime exceptions without breaking the page.
- Show expected versus observed output or explicit pass/fail tests. Reset restores starter source and
  reruns the same initial fixture rather than writing a prepared success state into the DOM.
- Keep starter code under roughly 70 lines. Target at most 16,000 total HTML characters.
- No eval of remote content, network access, CDN, imports, external fonts/images, placeholder code,
  or unavailable library globals.
- Fit 1280×720 without scrolling; keep code and evidence legible when projected. Support keyboard
  activation and visible focus.

Use `--notale-*` variables from `global.css` with fallbacks. One code editor and one evidence surface
are enough; do not add a competing quiz or dashboard.
