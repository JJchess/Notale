---
name: create-code-runtime
description: Build one offline editable JavaScript exercise with visible execution evidence in a Notale HTML-native page.
---

# Create a runnable code page

Add one dependency-free code activity to the page being built under the Builder role contract. The runtime
does not bundle Pyodide, CodeMirror, or package installation; do not promise Python execution or refer
to unavailable globals. Choose the smallest editable JavaScript decision that proves the central
message.

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
- Do not evaluate remote content. Keep starter code under roughly 70 lines and the whole HTML under
  roughly 16,000 characters. One editor and one evidence surface are enough.
