# Code Runtime Sample Catalog

Use this catalog only after selecting the code interaction category and when a concrete representation reference will reduce uncertainty. These samples are author-layer examples on the same fixed v2 workbench, not additional renderer APIs or platform forks.

## Use the compact sample set

Generate the runnable workbench with the single canonical `scripts/generate_template.py` command documented in [code.md](code.md). Read all four author layers under `samples/code/<sample-id>/lesson/` together: select the closest relationship as the structural anchor, then use the other three as counterexamples that reveal which state, trace, geometry, and evidence decisions are subject-specific.

Samples are reference implementations, not standalone products, packages, renderer APIs, or a second generation workflow. Do not copy their learner code or visual language when the new subject has a different governing relationship.

Each sample directory contains exactly one `lesson/` directory: no template manifest, `core/`, runtime, workbench HTML/CSS, browser check, vendor dependency, generator, or sample-only metadata. Its learner Python, `lesson.js`, semantic `trace.py`, optional correctness `tests.py`, and native `view/` files are the complete author-layer delta. A sample that does not need correctness checks may set `testsUrl: null` and omit `tests.py`; trace remains necessary whenever the right view depends on algorithm semantics that the fixed runtime cannot infer.

## Choose by relationship, not appearance

| Sample ID | Orthogonal relationship | Canonical state | Visual signature | Adapt when teaching |
|---|---|---|---|---|
| `tree-traversal` | hierarchy + recursive visit order | stable nodes, edges, stack, visited order | annual-ring nodes joined by a traversal beam | BST traversal, tries, heap paths, recursive tree invariants |
| `grid-bfs` | coordinates + wavefront + shortest path | barriers, visited cells, FIFO queue, distance, parent path | sonar contours expanding through a map | flood fill, maze search, unweighted shortest path, island traversal |
| `edit-distance` | table dependency + optimal substructure | prefix matrix, current cell, diagonal/up/left dependencies | typesetter-like alignment matrix with dependency spokes | dynamic programming, sequence alignment, recurrence provenance |
| `euclid-recursion` | scalar invariant + recursive call stack | `(a,b,q,r)` per call, depth, base case, result | shrinking remainder rulers descending toward zero | recursion, divide-and-conquer parameters, numeric invariants, return flow |

Adapt only the chosen anchor's structure, then replace its learner code, trace semantics, tests, initial state, and native view with the new lesson's actual relationship. The other samples are contrasts, not ingredients: do not combine all four visual metaphors, preserve sample copy that no longer matches, or make learner code call a visualization helper.

The useful invariant across samples is the small interface:

- natural Python produces ordinary algorithm state;
- `trace.py` converts frames into JSON-safe semantic packets;
- `render.js` maps those packets directly to persistent native DOM or SVG;
- structured tests verify behavior and invariants independently of the view.

The intentionally variable part is everything subject-specific: state fields, IDs, focus roles, changes, annotation, geometry, graphic vocabulary, and one signature mechanism. This is what demonstrates that the template is representation-neutral without forcing agents to learn a component library.
