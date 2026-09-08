---
name: build-code
description: "Builds Python learning workbenches where learners edit and run code, with execution results, test feedback, and visualizations linked to program state."
---

# Build Code

The learner edits runnable Python; execution, tests, trace, output, and a code-derived native view provide the evidence. Do not build a read-only listing or invent another editor/runtime shell.

In your first response, issue these three calls in parallel:

- `Read(<skill-dir>/references/code.md)`
- `Read(<skill-dir>/samples/bundles/code/code-core-bundle.full.md)`
- `CodeScaffold()`

The sample bundle contains four contrasting author layers: edit-distance dynamic programming, Euclidean recursion, grid BFS, and tree traversal. Select the closest state/trace/evidence architecture; do not mix their metaphors or copy their learner code, data, labels, or styling.

`CodeScaffold` returns every editable lesson path with its current content. Edit only those lesson files. The outer page and fixed runtime are host-owned. The scaffold is idempotent, so an accidental repeat returns the same working set.

Follow the reference as the complete learning and runtime contract.
