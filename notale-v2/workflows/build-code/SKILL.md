---
name: build-code
description: "Builds Python learning workbenches where learners edit and run code, with execution results, test feedback, and visualizations linked to program state."
---

# Build Code

The learner edits runnable Python; execution, tests, trace, output, and a code-derived native view provide the evidence. Do not build a read-only listing or invent another editor/runtime shell.

In your first response, issue these three calls in parallel:

- `Read(<skill-dir>/references/code.md)`
- `Read(<skill-dir>/samples/bundles/code/code-core-bundle.one.md)`
- `CodeScaffold()`

The sample bundle carries one worked author layer. Transfer its state/trace/evidence architecture to this page's algorithm; do not copy its learner code, data, labels, or styling.

`CodeScaffold` returns every editable lesson path with its current content. Edit only those lesson files. The outer page and fixed runtime are host-owned. The scaffold is idempotent, so an accidental repeat returns the same working set.

Follow the reference as the complete learning and runtime contract.
