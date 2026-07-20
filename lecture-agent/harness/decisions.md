# Decisions Log (ADR) — APPEND-ONLY

> This file is append-only. Never edit or delete an existing entry. A decision that was wrong is
> superseded by a NEW entry that references it, not by rewriting history. `id` values are
> monotonic (D-001, D-002, ...); the check script flags any gap, reuse, or out-of-order id.
> The real enforcement of append-only is git history — keep this project under version control.

Each entry records one accepted design delta and the evidence that passed it through the gate.
Grounding: North (1990) on path dependence — "once reached, a solution is difficult to exit
from." The log makes that path explicit and auditable instead of silently baked into the files.

## Entry schema

```
## D-###  <short title>
date: YYYY-MM-DD
scenario: S-###                 # the failure this delta answers
delta: <one-surface change + which ladder rung: prompt|context|skill|workflow|harness-code>
alternatives: <what else was considered and why rejected>
adversarial_result: <the laziest letter-satisfying / intent-violating move, and which gate catches it>
rubric: enforceability=pass, falsifiability=pass, minimality=pass, boundary=pass, gaming=pass, simplification=pass
mechanisms: M-###, ...          # created or changed by this decision
outcome: accepted
```

---

## D-001  Require enforcement points on all accepted mechanisms
date: 2026-07-20
scenario: S-001
delta: harness-code — add enforcement_point + enforcement_type required-field checks to check_structure.py
alternatives: A prose guideline in the skill body ("remember to add enforcement") — rejected as itself an informal constraint, exactly the failure mode S-001 describes.
adversarial_result: Author writes a hollow enforcement_point with no consequence. Caught by the enforcement-theater check in check_structure.py (STRUCTURE CHECK stage) and, as backstop, the Enforceability rubric dimension (RUBRIC REVIEW stage).
rubric: enforceability=pass, falsifiability=pass, minimality=pass, boundary=pass, gaming=pass, simplification=pass
mechanisms: M-001
outcome: accepted

## D-002  Ratify hexagonal layer enforcement as an accepted mechanism
date: 2026-07-20
scenario: S-003
delta: harness-code — record M-002 documenting the existing .importlinter contracts + CI `contract` step (no code change; ratifying existing reality into the registry)
alternatives: Leave the layering as PROJECT_STRUCTURE.md prose — rejected: that is exactly S-003 (prose rots); the doc itself demanded machine enforcement.
adversarial_result: Smuggle a dependency via a runtime/importlib import the static graph misses. Caught partially — the layering is load-bearing for mypy+tests so most evasions surface; residual risk noted in M-002 failure_mode.
rubric: enforceability=pass, falsifiability=pass, minimality=pass, boundary=pass, gaming=pass, simplification=pass
mechanisms: M-002
outcome: accepted

## D-003  Ratify schema-is-the-interface (no raw HTML) as an accepted mechanism
date: 2026-07-20
scenario: S-004
delta: harness-code — record M-003 documenting the existing validate.py/.mjs err-level HTML/color/tag checks + drop-not-fabricate repair behavior
alternatives: Trust the prompt instruction "author JSON, not HTML" alone — rejected: an informal constraint the model routinely violates (S-004).
adversarial_result: Encode a payload (entities/split tags) past the static string checks. Caught by the null-origin iframe sandbox as the authoritative render-time second gate; bare-color heuristic gap noted.
rubric: enforceability=pass, falsifiability=pass, minimality=pass, boundary=pass, gaming=pass, simplification=pass
mechanisms: M-003
outcome: accepted

## D-004  Ratify capability-coverage regression + heatmap as an accepted mechanism
date: 2026-07-20
scenario: S-002
delta: harness-code — record M-004 documenting test_icons.py nonzero assertion (CI) + profile_deck/build_coverage heatmap
alternatives: Rely on manual inspection of generated decks — rejected: the icons no-op survived 39 real runs unnoticed (S-002).
adversarial_result: A different capability silently zeroes with no equivalent assertion. Caught only if the heatmap is read; mitigation is to add the next assertion when a cell goes cold (M-004 failure_mode).
rubric: enforceability=pass, falsifiability=pass, minimality=pass, boundary=pass, gaming=pass, simplification=pass
mechanisms: M-004
outcome: accepted

## D-005  Fix the ruff gate to exercise the package (enforcement pending)
date: 2026-07-20
scenario: S-005
delta: harness-code — point ruff at `lecture_agent tests` and add a zero-file guard in Makefile/ci.yml. FILED as direction; code change deferred to an implementation pass, so M-005 stays status:proposed.
alternatives: Delete the lint target (loses real coverage) — rejected. Leave it as-is (S-005 theater) — rejected.
adversarial_result: A later rename re-breaks the path silently. The zero-file guard is the backstop — the fix is not the path edit alone but path + guard together (M-005 failure_mode).
rubric: enforceability=pass, falsifiability=pass, minimality=pass, boundary=pass, gaming=pass, simplification=pass
mechanisms: M-005
outcome: accepted (enforcement pending — code change deferred)

## D-006  Single source of truth for the schema SPEC (enforcement pending)
date: 2026-07-20
scenario: S-006
delta: workflow — make viewer/schema/SPEC.md canonical and generate-or-diff-check the skills/lecture-doc-schema/references copy in CI. FILED as direction; M-006 stays status:proposed until wired.
alternatives: Keep the manual "synced from" copy + discipline — rejected: that discipline already failed (S-006, stale against the code).
adversarial_result: A manual copy-paste "sync" re-introduces drift between checks. Only generation-from-source or a CI diff removes the manual step; a diff check is the minimum.
rubric: enforceability=pass, falsifiability=pass, minimality=pass, boundary=pass, gaming=pass, simplification=pass
mechanisms: M-006
outcome: accepted (enforcement pending — code change deferred)

## D-007  Wire the completeness gate to a consequence (enforcement pending)
date: 2026-07-20
scenario: S-007
delta: workflow — consume completeness.gate()'s verdict as a failing outcome in the eval/generation path (nonzero exit / rejected acceptance / hard report warning). FILED as direction; M-007 stays status:proposed.
alternatives: Leave gate() as a scoring-only measurement — rejected: that is S-007 (checker without consequence).
adversarial_result: "Wire" it to a warn-only log nothing acts on — the same theater one rung down. The consequence must be observable (exit code / rejected artifact), per M-007 failure_mode.
rubric: enforceability=pass, falsifiability=pass, minimality=pass, boundary=pass, gaming=pass, simplification=pass
mechanisms: M-007
outcome: accepted (enforcement pending — code change deferred)
