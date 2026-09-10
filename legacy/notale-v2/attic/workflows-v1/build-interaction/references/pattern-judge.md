<!-- 这一份是 build-interaction 的 模式家族：Compare and commit — weigh alternatives or predict, then see。由 pattern-routing.md 选中后读这一份。 -->
<!-- 切自单份 interactive-widget.md(93,524 B,曾占建页输入 35.7%);正文原样搬运,未改写。 -->

### Direction F — Synchronized comparison

Use when one teaching variable must be isolated across alternatives, models, parameter choices, or runs.

- Spatial grammar: aligned views with shared scales and a single launch/step clock.
- Signature: simultaneous progression from identical starting conditions.
- Strong evidence: divergence, convergence, overshoot, or tradeoff remains comparable without mental rescaling.
- Avoid independent mini-widgets that happen to be placed in a row.

### 6.6 Synchronized comparison

Use to isolate one variable across alternatives.

```text
same data + same start + same scale + same clock
  → different teaching variable
  → aligned outcomes
```

Build:

1. State the single varying factor privately.
2. Seed or copy all shared starting data.
3. Use one transition clock and one step count.
4. Keep axes, camera, crop, normalization, and sample ordering fixed.
5. Mark off-scale values rather than rescaling one view.
6. Attach each outcome to its view and state the shared conclusion once.

Strong comparisons expose divergence as it happens: three learning rates descend the same landscape; three models fit the same samples; two loss functions respond to the same outlier.

Do not give each alternative its own start button, scale, or random sample. Do not highlight a preferred answer by hiding the evidence from the others; dim them only after the comparison remains readable.


#### Delivery check

**Synchronized comparison**

- Data, start, axes, crop, clock, and update count match.
- Only the teaching variable differs.
- Off-scale and divergent values remain represented.

### Direction H — Counterexample

Use when the learner must encounter a limitation, impossible strategy, misconception, or failure regime before receiving a reframe.

- Spatial grammar: plausible attempt area; accumulating evidence; preserved failure state; nearby reframe.
- Signature: the invariant or residual survives every plausible attempt.
- Strong evidence: best result, unresolved case, contradiction, boundary, or instability remains visible.
- Avoid arbitrary failure rules, fake quizzes, or explanations shown before a real attempt.

### 6.8 Try, fail, and reframe

Use for limitations, counterexamples, impossible strategies, and misconceptions.

```text
plausible attempt
  → accumulating objective evidence
  → bounded failure or invariant
  → preserved state
  → new representation or method
```

Build:

1. Give a real, plausible action.
2. Track evidence such as best score, unresolved cases, residual, contradiction, or invariant.
3. Reveal the limitation after persuasive evidence, not after an arbitrary click count.
4. Preserve the learner's best or final attempt while explaining it.
5. Introduce the reframe by transforming or connecting existing objects when possible.
6. Let reset restore the unresolved starting state.

The failed state is the teaching artifact. Do not erase it with a modal, replace it with a red banner, or jump immediately to the solution.

The reframe should explain why the original representation failed. Adding a layer may fold space; changing coordinates may make separation possible; introducing memory may resolve an ambiguity. Preserve identity through the change.


#### Delivery check

**Counterexample**

- Attempt is genuine.
- Failure evidence is objective and preserved.
- Reveal timing is evidence-based.
- Reframe explains the limitation.

### Direction J — Prediction and reveal

Use when commitment before observation sharpens learning: predict a path, choose the stronger force, estimate an outcome, or classify a case, then reveal the mechanism.

- Spatial grammar: model in an unresolved state; small prediction action; visible run/reveal; comparison between prediction and outcome.
- Signature: the learner's commitment remains visible beside the resulting evidence.
- Strong evidence: the reveal animates or constructs the causal path, not just a correctness badge.
- Avoid trivia questions whose answer is already printed or whose interaction adds nothing to observation.

### 6.10 Prediction and reveal

Use when committing before observation produces a useful comparison.

```text
unresolved model
  → learner prediction
  → mechanism runs or evidence is constructed
  → prediction remains visible
  → local comparison and interpretation
```

Build:

1. Ask for the smallest prediction that focuses attention.
2. Make the available options or predicted geometry part of the model, not a quiz card.
3. Preserve the prediction during the reveal.
4. Reveal the causal mechanism before showing correctness.
5. Compare outcome with prediction using distance, overlap, direction, or another domain measure.
6. Allow a new trial with changed initial conditions when repetition teaches a pattern.

Avoid scores unless repeated calibrated prediction is itself the activity. A one-shot concept reveal needs evidence and reflection, not points or confetti.


#### Delivery check

**Prediction and reveal**

- Prediction is committed before evidence.
- Prediction remains visible.
- Mechanism is shown before correctness.
- Repetition changes meaningful initial conditions.

