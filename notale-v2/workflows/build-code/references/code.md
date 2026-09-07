# Consequential Code Interaction

A read-only listing beside a prerecorded animation is not a code interaction. Current learner source, execution, trace, tests, output, and the code-derived view must remain one evidence chain.

## Know the capability boundary

The bundled v2 workbench currently executes **Python in Pyodide only**. It can represent the full data-structures-and-algorithms teaching space because the trace packet and native HTML/SVG/Canvas view are representation-neutral; that does not make it a universal language runtime.

Use the template directly for browser-executable Python lessons. If the learner runtime must be JavaScript, Java, C/C++, Rust, or requires native packages, network access, a persistent filesystem, or hostile-code isolation, treat that as a platform-runtime change. Do not simulate support, silently swap languages, or add a one-off runtime inside `lesson/`.

## Require the learning loop

Preserve this loop:

`edit or choose code → execute current editor models → capture canonical trace and results → render inspectable evidence → revise or transfer`

Require:

- one observable target such as implement, predict, debug, compare, optimize, prove, or explain;
- a runnable starter that reaches the target relationship quickly;
- evidence derived from the exact source visible in Monaco;
- a consequence in tests, state transitions, complexity, output, or a subject-specific view;
- another meaningful edit, retry, comparison, or transfer case;
- deterministic reset of source, runtime, trace, output, tests, playback, and view.

Reject syntax highlighting without execution, fixed answers inside an editor, hard-coded frames unrelated to the current model, pass/fail feedback that erases the failing state, and generic output when the target depends on structure.

Before coding, determine the first edit, semantic trace and visible evidence; use the following contract without writing a separate specification. Keep learner code natural: learners practice the language and algorithm, not a visualization API.

## Respect the host and author boundary

The author layer uses natural learner Python, `lesson.js`, semantic `trace.py`, optional rule-based `tests.py`, and native `view/`. Natural Python produces ordinary algorithm state; `trace.py` converts execution into JSON-safe semantic packets; `render.js` maps those packets to persistent native DOM or SVG; tests verify behavior independently of the view. State fields, identities, focus roles, changes, annotations, geometry, and the signature representation are subject-specific.

Author-layer responsibilities:

| File | Responsibility |
|---|---|
| `lesson/lesson.js` | Metadata, editable files, entry policy, limits, and informative initial step |
| learner `.py` files | Natural runnable starter and examples |
| `lesson/trace.py` | Semantic extraction from Python frames |
| `lesson/tests.py` | Optional rule-based explanatory tests; use `testsUrl: null` when correctness is not part of the evidence |
| `lesson/view/index.html` | Native body markup for the right pane |
| `lesson/view/style.css` | Subject-specific visual composition |
| `lesson/view/render.js` | One packet-to-DOM rendering function |

Treat the outer page, `core/`, `runtime/`, `index.html`, `styles.css`, `check.py`, and shared dependencies as fixed platform code. Do not fork Monaco, Worker, timeout, playback, reset, iframe, or fixed-stage behavior for one lesson. Preview through the host HTTP server, never `file://`.

Verification covers both the outer deck page and the inner workbench: execution, errors, timeout recovery, native view, exact reset, fixed layout, and representative screenshots.

## Keep source, execution, and evidence identical

At Run time, send the current Monaco model contents to the runtime. Never execute an older starter string, a hidden replacement algorithm, or precomputed frames. Preserve filenames and source lines through every runtime result.

A trace step has this JSON-safe shape:

```js
{
  sequence: 12,
  source: { file: "starter.py", line: 9, column: 1 },
  kind: "sequence",
  state: {
    items: [3, 5, 8],
    ranges: [{ from: 0, to: 1, role: "sorted", label: "有序前缀" }]
  },
  focus: [{ role: "compare", index: 1 }, { role: "compare", index: 2 }],
  changes: [{ role: "write", index: 2 }],
  metrics: { comparisons: 7, writes: 3 },
  annotation: "比较相邻元素"
}
```

`state` is the canonical semantic snapshot. `focus` names what the current operation reads or considers. `changes` names the consequence produced by the source line. Use stable metric names and units. Keep annotations short and evidential.

`kind` is lesson metadata for trace inspection; it is not a renderer selector and does not activate a template component. The authored native view decides how to represent the packet.

Use JSON-safe values and stable IDs. Never pass Python frames, proxies, DOM nodes, functions, cyclic values, or view objects through the trace protocol. Bound depth, collection length, strings, frame count, stdout, and total payload.

The shell deliberately does not add a course card, global metric strip, annotation strip, or source evidence bar around the right view. Put only subject-relevant evidence into the native view.

## Trace semantics deliberately

Python line tracing preserves execution order and locals but cannot infer that an integer is a heap boundary or that an assignment is a graph relaxation. Choose the least intrusive accurate strategy:

1. inspect stable globals and locals when their meaning is unambiguous;
2. derive changes by comparing adjacent semantic snapshots;
3. use author-side proxy containers or helper types when operations matter;
4. inject an author helper before execution when the starter needs a clean abstraction;
5. emit explicit semantic events only inside author-owned library code when inference would be wrong.

Do not require learners to add `emit()` calls merely to make the page work. Capture state after the decorated line has produced its consequence. Preserve valid partial frames on runtime errors. When trace limits are reached, give a specific repair such as reducing the input or loop.

## Author the native view

The authoring contract is three files and one global function. `lesson/view/index.html` contains body markup only. Do not include `html`, `head`, `body`, `script`, `style`, `base`, `link`, `meta`, `iframe`, `object`, or `embed` elements.

Define exactly this function in `lesson/view/render.js`:

```js
window.renderNotaleView = ({
  step,
  previousStep,
  playback,
  environment,
}) => {
  // Update native DOM, SVG, or Canvas synchronously.
};
```

The packet is:

```js
{
  step: {
    sequence, source, kind, state, focus, changes, metrics, annotation
  },
  previousStep: null | {
    sequence, source, kind, state, focus, changes, metrics, annotation
  },
  playback: {
    index,       // -1 before a captured run
    count,       // captured frame count
    playing,
    speed,
    reason       // "initial" | "frame" | "reset" | "preview"
  },
  environment: {
    reducedMotion
  }
}
```

Rules are intentionally small:

- render synchronously; do not return a Promise;
- read all changing data from the packet;
- keep persistent DOM/SVG objects keyed by semantic identity instead of replacing the whole scene;
- use `previousStep` only for meaningful transitions or diffs;
- make `reset` and `initial` exact, not approximate;
- preserve the same state and evidence under reduced motion;
- expose rule-relevant values through semantic DOM or accessible SVG;
- do not call `postMessage`; the fixed bridge owns parent communication.

`previousStep` is `null` for `initial` and `reset`. It normally contains the prior semantic frame; it may equal `step` when only playback state such as play/pause or speed changed. Base semantic motion on an actual state difference, not merely on object inequality.

The view may use browser-native HTML, SVG, Canvas, and local relative images. It cannot use `fetch`, XHR, WebSocket, Worker, dynamic imports, external scripts, external fonts, or runtime CDNs. Put markup in `index.html`, styling in `style.css`, and classic JavaScript in `render.js`.

This code workflow owns the workbench's visual language independently of the surrounding deck.
Use the native view's foundation palette, typography and semantic colors below; do not read or
reproduce the deck's `assets/theme.css`, style-director choices or neighboring-page styling.
Subject-specific composition, geometry and meaningful motion remain yours. Keep the editor and
host shell unchanged; authoring `view/style.css` is not permission to replace the code foundation
with the deck's theme.

`core/native-view.css` provides only reset, typography, reduced-motion behavior, and these foundation tokens:

```css
--viz-bg-0: #05070a;
--viz-bg-1: #0a0e14;
--viz-ink: #e9eef5;
--viz-soft: #aab6c4;
--viz-dim: #6f7b88;
--viz-faint: #333c47;
--viz-line: #171d25;
--viz-cyan: #5ec8e0;
--viz-amber: #ffb454;
--viz-violet: #b389ff;
--viz-danger: #ff6b7a;
--viz-sans: ...;
--viz-serif: ...;
--viz-mono: ...;
```

There are no template component classes to learn. Author the subject directly with ordinary selectors.

## Choose a relationship-preserving representation

Native authoring can cover the full data-structures-and-algorithms space because the trace contract is representation-neutral:

| Relationship | Useful native representation |
|---|---|
| Arrays, strings, sorting, two pointers | Indexed DOM/SVG marks, ranges, pointers, reads, writes |
| Stack, queue, deque, linked list | Ordered nodes, links, head/tail/top, operation focus |
| Trees, heaps, tries, segment trees | Stable SVG nodes and clipped edges, hierarchy, path, subtree |
| Graphs, union-find, shortest path | Nodes, weighted edges, frontier, components, predecessors |
| Matrix, grid search, flood fill | Coordinate cells, barriers, cost, parent, path |
| Dynamic programming and hashing | Tables or buckets with dependency, candidate, provenance |
| Recursion and backtracking | Call stack or search tree with choices, returns, pruning |
| Bits and number algorithms | Bit rows, number lines, scalar state, factor tables |
| Geometry or unusual structures | Custom SVG or Canvas driven by the same packet |

A lesson may compose synchronized views when one canonical step drives all of them. Do not coerce every structure into bars. Preserve object identity, show focus and changes at their semantic locations, and keep scales fixed during controlled comparison.

Use cyan for system state, amber for the current read/write/path, violet for a proven or fixed result, and red only for failure. Pair color with labels, dash patterns, line weight, shape, or status text. Keep glow local and motion causal.

## Make tests explanatory evidence

Tests should isolate the target rule and return structured results:

```python
def run_tests(namespace):
    return [{
        "name": "保留重复值",
        "passed": namespace["result"] == [1, 2, 2],
        "message": "输出应保留两个 2。",
    }]
```

Include representative cases and only boundary cases that expose the misconception. Preserve the failing input, observed output, expected property, and related trace. Distinguish syntax error, runtime error, failed assertion, timeout, trace limit, and view error. When several implementations are valid, test behavior, invariants, or declared complexity rather than one source string.

Correct output, trace quality, and learning completion are separate. A failed program can still provide diagnostic evidence; a correct output can still hide the intended invariant.

## Keep one fixed learning world

Use the fixed 1600×900 centered Notale stage. The editor remains on the left and the native view on the right. Only the left Output panel resizes vertically; it must never resize the right pane or page frame. Do not add a draggable editor–view divider.

Render a representative initial semantic state before Pyodide is ready. Keep source decoration, view focus, tests, output, metrics, and playback on the same trace step. A successful Run automatically plays from the first captured frame, synchronizing source decoration and the native view; a runtime error stops on the last valid frame. Under reduced motion, Run moves directly to the final frame. Manual Step and autoplay select the same frames.

Use the VS Code-like chrome as working context. Do not add a bottom blue status strip, a live-preview marketing label, fake terminal prompts, fake activity bars, or controls that do not work.

## Bound execution honestly

The host owns Worker timeout recovery and message isolation. Set lesson limits for source, execution time, trace, output and snapshot size.

A Worker protects UI responsiveness; it is not a hardened multi-tenant security boundary. Do not place credentials or sensitive same-origin data in the page. Hostile code, native packages, persistence, network access, or compiled languages require an explicitly authorized backend sandbox.

Use local dependencies and no runtime CDN. Report runtime initialization failure separately and keep the starter and initial view readable.

## Preserve access paths

- Keep tabs, Run, Reset, playback, speed, and Output resizing keyboard reachable.
- Mirror source focus in semantic text; line color alone is insufficient.
- Give graphical state accessible labels and expose important values in DOM.
- Never use color as the only cue for focus, change, pass, failure, or visited state.
- Reduced motion must preserve every rule and result through direct transitions or stepping.
- Dense graphics need a bounded textual or tabular description.
- Runtime and view errors must not trap focus or erase source.

## Reset and teardown exactly

Reset cancels playback and active execution, invalidates stale messages, restores all authored models, clears markers/output/tests/trace/decoration, restores the initial step, speed, and Output height, and sends a normal packet with `playback.reason === "reset"` and `previousStep === null`.

The host owns editor and Worker teardown. Retry may preserve repaired source; Reset restores authored source.

## Repair common failures

| Failure | Cause | Repair |
|---|---|---|
| Variable-name guessing | Meaning is inferred from `i`, `graph`, or `root` | Author a semantic `trace.py` contract |
| Instrumentation exercise | Learner code is filled with display calls | Move observation to trace helpers |
| Pass/fail wall | Tests hide observed state | Return the failing case, property, and trace |
| Generic bars everywhere | Structure is coerced into numbers | Author relationship-preserving native HTML/SVG/Canvas |
| Empty right pane | Evidence appears only after Run | Author an informative initial step |

## Verify the complete interaction

- Edit the starter so the trace changes; confirm the right view changes from that exact source.
- Exercise applicable success, syntax, runtime, logical, timeout, and trace-limit paths.
- Confirm filenames and decorated lines match executed Monaco models.
- Compare Run, manual Step, and autoplay at the same index.
- Test representative empty, duplicate, disconnected, negative, deep, or large states when relevant.
- Reset during playback and execution, twice, and compare the full snapshot.
- Verify keyboard access and reduced motion.
- Force a `renderNotaleView` error; verify the parent error surface appears and source remains.
- Generate fresh output, serve it, and confirm no CDN requests, missing resources, console errors, clipping, or page scrolling.
