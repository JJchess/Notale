# Interaction Grammars

Use interaction only when the action produces evidence, understanding, or narrative state.

| Affordance | Grammar | Useful page-local trace |
|---|---|---|
| move through space or a network | `navigate` | path, pauses, backtracks, forks |
| seek a better configuration | `optimize` | attempts, efficiency, strategy changes |
| commit before a reveal | `predict` | prediction, error, confidence |
| adjust variables | `tune` | parameter trajectory, sensitivity discovery |
| order items | `rank` | ordering, swaps, revisions |
| assign categories | `classify` | choices, corrections, error pattern |
| distribute limited resources | `allocate` | trade-offs and priorities |
| build a structure | `construct` | sequence, dependencies, revisions |
| make sequential decisions | `choose-path` | branch history and outcomes |
| sketch, drag, or trace | `draw-trace` | geometry, path, timing |

Define the reader goal, allowed actions, completion condition, immediate feedback, captured events, and
the evidence derived from them. If useful evidence cannot be named before implementation, use an
inspectable or stateful visual instead.

Keep traces in memory for the current page:

```js
const readerTrace = {
  actions: [],
  decisions: [],
  revisions: [],
  outcome: {},
  derived: {}
};
```

Capture only fields needed for the page's result. A reflection may state an observed action or computed
metric, such as a route length or number of revisions. Do not convert behavior into claims about the
reader's personality, feelings, health, identity, or intent.
