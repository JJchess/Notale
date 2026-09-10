<!-- 这一份是 build-interaction 的 模式家族：Manipulate and build — move or assemble things in space。由 pattern-routing.md 选中后读这一份。 -->
<!-- 切自单份 interactive-widget.md(93,524 B,曾占建页输入 35.7%);正文原样搬运,未改写。 -->

### Direction B — Manipulator

Use when position, angle, shape, order, or membership is itself meaningful and direct manipulation expresses the concept better than a form control.

- Spatial grammar: large manipulable object with visible handle or graspable body; nearby alternative control for precision.
- Signature: the same gesture that changes the model also reveals its governing geometry.
- Strong evidence: boundary rotates with its normal; support region changes with stance; vector components update with direction.
- Avoid dragging decorative cards or objects whose screen position has no semantic meaning.

### 6.2 Bidirectional geometric manipulator

Use when a direct spatial action expresses the concept.

```text
drag meaningful object ↔ semantic keyboard/range control
                       → one canonical state
                       → geometry + measure + annotation
```

Build:

1. Draw a visible handle, graspable body, or hover preview before first use.
2. Convert pointer position into logical coordinates; never store raw screen pixels as model state.
3. Clamp or project the logical value into the valid domain.
4. Route drag and precise alternative input through the same transition.
5. Redraw all dependent evidence from the committed state.
6. Preserve a valid state on pointer cancellation.

Strong manipulators:

- rotate a vector to rotate its orthogonal boundary;
- drag a center to change a coverage region;
- move support points to change a stability polygon;
- reposition a sample to change neighborhood membership.

Position must carry meaning. Do not add drag to a card, knob, or ornament merely to make the component feel interactive.

Use a generous invisible hit target around thin handles. Show grab/grabbing cursors, focus indication, and a keyboard path that reaches the same logical states.


#### Delivery check

**Manipulator**

- Handle is discoverable before use.
- Screen coordinates map correctly after scaling.
- Cancellation leaves a valid state.
- Precise alternative input stays synchronized.

### Direction C — Constructor

Use when understanding comes from assembling a valid configuration under rules: choose limited resources, connect compatible parts, allocate a budget, arrange a sequence, or satisfy competing constraints.

- Spatial grammar: available objects, construction area, and a constraint gauge sharing one visual field.
- Signature: the constraint is visible before and during the action, not reported only after submission.
- Strong evidence: capacity fills, conflicts mark their origin, and consequences update with the partial construction.
- Avoid turning the task into a conventional form followed by a generic success message.

### 6.3 Constrained constructor

Use when the learner chooses, connects, allocates, or assembles under explicit limits.

```text
partial construction
  ↔ remaining capacity / compatibility
  → local consequence
  → valid or invalid next moves
```

Build:

1. Make the constraint visible before the first choice.
2. Start with a meaningful partial configuration when that helps reveal the units.
3. Update capacity and consequences after every accepted action.
4. Preview whether an action is valid before commitment when possible.
5. On rejection, preserve the attempted context and explain the exact violated rule locally.
6. Allow removal or reversal through the same object, not a hidden separate editor.

Distinguish three states:

- available and feasible;
- selected or placed;
- unavailable because of a specific current constraint.

Do not gray out an item without exposing why. Do not let visual selection, capacity totals, and risk consequences drift into separate state.

A constructor does not require a win state. It may be an open tradeoff instrument. Invent success only when the domain defines it.


#### Delivery check

**Constructor**

- Constraint is visible before action.
- Feasibility is derived from current construction.
- Invalid feedback identifies the exact conflict.
- Removal and reversal work.

