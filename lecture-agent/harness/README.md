# Institutionalized harness-design project

Scaffolded by ce-harness-institutions. Layout:

    ontology/       schemas (LOCKED) + tools/ and skills/ specs (EDITABLE)
    rubrics/        design-review-rubric.md (LOCKED -- only a human changes it)
    scenarios/      failure cases (APPEND-ONLY: retire by status flip, not deletion)
    mechanisms/     one mechanism record per file (EDITABLE)
    decisions.md    ADR log (APPEND-ONLY)
    rejected.md     rejected proposals (APPEND-ONLY)

## IMPORTANT: put this project under git
Append-only is enforced by version history, not politeness. Run `git init` here and commit
after every accepted decision. The check script only verifies id monotonicity; git is the real
enforcement point for "never rewrite an entry".

## The loop
For each iteration:
  1. PICK one open scenario from scenarios/
  2. PROPOSE a minimal delta touching ONE surface
  3. STRUCTURE CHECK:  python <skill>/scripts/check_structure.py .
  4. ADVERSARIAL TEST: answer "laziest way to satisfy the letter, violate the intent?"
  5. RUBRIC REVIEW:    score against rubrics/design-review-rubric.md (all six must pass)
  6. ACCEPT -> append decisions.md, set mechanism status:accepted
     REJECT -> append rejected.md with the lesson
