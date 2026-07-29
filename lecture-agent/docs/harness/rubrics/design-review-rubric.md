<!-- source_version: 1.0.0 -- LOCKED. Only a human may change this file. -->

# Design Review Rubric (LOCKED)

This rubric is the locked feedback surface. It lives here as the single canonical copy;
`scaffold.py` copies it into a project's `rubrics/` with a `source_version` stamp. **The loop
may read it but never edit it** — changing the rubric is a human-controlled action. Lowering a
threshold to admit your own output is the drift-to-low-performance trap (Meadows 1990, p.123);
the antidote is "keep performance standards absolute."

A design delta is **accepted only if all six dimensions pass**. Score each pass/fail with a
one-line justification. Report per-dimension results, never a blended score — an aggregate hides
a critical failure behind five easy passes.

---

## 1. Enforceability
**Pass:** The mechanism names a concrete enforcement point — a checker (script / workflow-gate /
rubric / human), a location in the workflow, and a **consequence** on violation (what is
blocked, rejected, or reverted).
**Fail:** "The reviewer should keep this in mind." "We aim to…." Anything with no checker or no
consequence. If enforcement genuinely cannot be named, the idea is an informal constraint — file
it `status: advisory`, do not force it through as accepted.

## 2. Falsifiability / scenario traceability
**Pass:** Traces to at least one scenario file that existed **before** this proposal, and states
one concrete bad artifact the rule would reject.
**Fail:** No scenario, a scenario written in the same breath as the fix (post-hoc
justification), or a rule so broad nothing could ever violate it.

## 3. Minimality
**Pass:** The delta touches exactly one surface and sits at the **lowest ladder rung** that can
express the fix (prompt < context < skill < workflow < harness-code). No unrelated records are
rewritten in passing.
**Fail:** A multi-surface batch change; a harness-code rewrite for what is really a
context-level gap; incidental edits bundled with the real change.

## 4. Boundary clarity
**Pass:** The `trigger` states when the rule does **not** apply, and any overlap with existing
mechanisms is resolved explicitly (this supersedes M-xxx / scopes are split).
**Fail:** A rule that applies "always"; silent overlap with an existing mechanism; two
mechanisms that could both fire on the same case with no stated precedence.

## 5. Gaming resistance
**Pass:** The proposal answers, in writing, "what is the laziest way to satisfy this rule's
letter while violating its intent?" and names which gate catches that move. (See
`references/adversarial-checklist.md`.)
**Fail:** No adversarial answer, or an answer whose gaming move nothing in the harness catches.

## 6. Simplification preference
**Pass:** The proposal states what it removes or replaces. When a simplification and an addition
would score equally, the simplification wins. Net-growth-of-registry proposals carry an explicit
justification.
**Fail:** Pure accretion with no pruning consideration; complexity added where an existing
mechanism could be extended or a stale one retired instead.

---

## How to fail a principle-piling sample
Run any "here are 10 design principles" document through this rubric and it dies on **#1
Enforceability** (no enforcement points) and **#2 Falsifiability** (no scenarios, nothing
rejectable). That is the rubric working as intended: it is the structural wall that makes the
principle-piling path a dead end.
