# Surface Classification Table

Before the first iteration, classify every part of the harness under design into one of four
surface classes. This is the map the whole institution runs on: mechanisms declare which
surface they touch, and the Minimality rubric dimension checks that a delta touches exactly
one. The four classes are inherited from `harness-engineering`; this file records the *design*
project's own surfaces.

| Class | Rule | Examples in a harness-design project |
| --- | --- | --- |
| **Locked** | Read + propose changes, but the loop cannot change it and then use the changed version to approve itself | `rubrics/design-review-rubric.md`, the check script's pass criteria, the ontology schemas |
| **Editable** | The loop may mutate during an iteration | `mechanisms/*` records, draft tool/skill specs, the surface table itself |
| **Append-only** | May add entries, never rewrite or delete | `decisions.md`, `rejected.md`, `scenarios/*` (a scenario is retired by status flip, not deletion) |
| **Human-controlled** | Requires explicit human approval | changing the rubric, widening the editable set, promoting the design to production, abandoning a design line |

## Fill in your project

```
locked:
  - rubrics/design-review-rubric.md            # human-only; the design loop scores against it, cannot edit-then-self-approve
  - <skill>/scripts/check_structure.py         # the review gate's pass criteria sit outside the loop's reach
  - ontology/{mechanism-record,tool-spec,skill-spec}.md   # the record schemas
  - ../.importlinter                           # the 5 hexagonal contracts (M-002) — machine-enforced in CI
  - ../lecture_agent/schema/validate.py + ../../viewer/schema/validate.mjs   # err-level checks (M-003)
  - ../Makefile + ../.github/workflows/ci.yml  # the CI gate definition (ruff/mypy/lint-imports/pytest)
editable:
  - mechanisms/*                               # the mechanism registry
  - ../skills/*/contracts.json + ../skills/*/guidelines/*.md   # per-skill authoring guidance
  - ../lecture_agent/domain/planning.py prompts               # planner prompt text
  - ontology/tools/*, ontology/skills/*        # draft tool/skill specs
  - ontology/surface-table.md                  # this file
append-only:
  - decisions.md                               # ADR log
  - rejected.md                                # rejected proposals + lessons
  - scenarios/*                                # failure cases (retire by status flip, not deletion)
  - ../results/ledger.jsonl                    # telemetry account book (never rewritten)
human-controlled:
  - changing rubrics/design-review-rubric.md
  - changing the theme set / evolving the doc schema (evolve-schema)
  - widening the editable set or changing the generation objective
```

## Why this must exist first

North (1990), p.4: institutions "consist of formal written rules as well as ... unwritten
codes of conduct that underlie and supplement formal rules." The surface table is where you
decide which rules are *formal* (script/gate/human-enforced — Locked or Human-controlled) and
which remain *informal* (Editable guidance). Meadows' leverage-point ranking (Rules > Rules
about who-can-change-rules) is why the rubric is Locked and "changing the rubric" is
Human-controlled: the power to change the rules outranks the rules themselves, so it cannot sit
inside the loop's reach. See `references/meadows-traps-and-leverage.md`.
