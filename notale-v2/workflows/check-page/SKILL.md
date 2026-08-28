---
name: check-page
description: "Inspect and repair an existing page from rendered evidence: composition, typography, overflow, interaction bugs."
---

# Review Page

Review the rendered artifact, not the source alone. Diagnose first, then make the smallest coherent repair.

## Reference routing

Before any page mutation for the repair, including `Write`, `Edit`, `Patch`, or a modifying `Bash` command, read [review-lenses.md](references/review-lenses.md). Capture the required page states first when rendered evidence is needed for diagnosis. Also read `workflows/scrub-copy-slop.md` and `workflows/scrub-visual-slop.md` before rewriting copy or visual treatment as part of a repair. Do not load unrelated references.

## 1. Recover the page contract

Read the page specification and shared chassis contract. State the page's one learning question, one takeaway, intended stay time, primary action, and states that must work. Treat those as the review baseline; do not redesign toward a different lesson.

## 2. Capture representative states

Open the page at the real route and logical 1600×900 stage. Capture the initial state, each major interaction outcome, reset, and reduced-motion state when animation matters. Use keyboard navigation as well as pointer input.

Do not infer visual quality from DOM or CSS. If a region looks questionable, inspect a crop at readable scale.

## 3. Audit in causal order

Review in this order:

1. **Task:** Can a learner identify the question, action, and result without teacher-only explanation?
2. **Composition:** Does the knowledge relationship have visible geometry and a clear reading path?
3. **Typography:** Are hierarchy, line length, labels, formulas, and projected size coherent?
4. **Interaction:** Do affordance, feedback, completion, invalid action, and reset form one loop?
5. **States:** Do all reachable states remain truthful, legible, and inside the stage?
6. **System:** Does the page use the shared visual language without falling into generic cards or decoration?
7. **Access:** Can keyboard, touch, reduced motion, and text alternatives reach the same lesson?

Record only findings tied to visible evidence. Rank them as blocking, material, or polish.

## 4. Form one repair hypothesis

Group related symptoms under a cause. Examples: weak hierarchy may cause both unclear reading order and excessive labels; an incorrect state model may cause both stale copy and a broken reset.

Choose one repair pass that resolves the highest-ranked cause. Preserve correct content, calculations, and working states. Avoid unrelated aesthetic rewrites.

## 5. Repair and compare

Patch related changes together. Re-render the same state set and compare before/after at identical dimensions. A repair is valid only when it improves the named issue without creating new clipping, ambiguity, or state failure.

## 6. Hand off for human approval

Provide the live page, matching screenshots, the original task, and a concise change note. Automated smoke results may confirm that the page runs; they do not approve taste or teaching quality. Leave the review pending until a human accepts the rendered result.
