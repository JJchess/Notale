id: S-005
title: The ruff lint gate points at a nonexistent path and silently checks nothing
kind: observed
context: Makefile:7-8 and .github/workflows/ci.yml — the `lint` target runs `ruff check src tests` and `ruff format --check src tests`.
trigger: The package is laid out flat as lecture_agent/ (pyproject packages=["lecture_agent"]) but the lint command still names src/, which does not exist. ruff finds no source files under src/ and exits 0.
bad_outcome: The lint step in CI reports green while never having linted a single file of the actual package — a checker that appears to enforce but enforces nothing (enforcement theater).
why_it_matters: Every other gate (mypy/import-linter/pytest) is real; this one is a decorative green check. A style/lint regression in lecture_agent/ would sail through CI. mypy still covers types via packages=, so the hole is lint/format only — but it is invisible and trusted.
status: open
addressed_by: M-005

## Notes
Defect #1 of the review. Verified firsthand: Makefile:7-8 name src/, no src/ dir exists.
