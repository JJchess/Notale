# Codex Workflow Skills Lab

This lab measures the current `workflows/` skills in the native Codex CLI rather
than through `core.builder`. It keeps the existing workflow lab untouched and
creates a byte-matched baseline/treatment pair for every case:

- **baseline**: stock Codex, no repository workflow skill installed;
- **treatment**: the same task with exactly one repository skill installed and
  explicitly invoked as `$skill-name`.

The three `scrub-*-slop.md` documents are intentionally outside this experiment.
They are neither installed nor injected into either arm.

## Fixed experiment

- model: `gpt-5.6-sol`
- reasoning: `low`
- service tier: `fast`
- cases: two per skill (`typical` and `boundary`)
- runs: 7 active skills × 2 cases × 2 arms = 28
- default concurrency: 4

`get-photo-ref` and `get-illustration` are not in the active matrix: Builder now
exposes those capabilities as `ImageSearch` and `ImageGen` tools. Their case
definitions remain inactive solely so the completed historical run can still be
decoded and rescored.

Every arm gets a fresh nested Git repository, a copied Notale chassis, a private
temporary Codex home, and a workspace-write sandbox. The treatment arm exposes
only its target skill through `.agents/skills`; the baseline exposes none.

## Commands

```bash
python3 lab.py validate
python3 -m unittest -v test_lab.py
python3 lab.py prepare --all --run-id sol-low-v1
python3 lab.py run --all --run-id sol-low-v1 --canary-only
python3 lab.py run --all --run-id sol-low-v1 --jobs 4
python3 lab.py rescore --run sol-low-v1
python3 lab.py serve --run sol-low-v1 --port 4177
python3 lab.py report --run sol-low-v1
```

Use `--dry-run` on `run` to inspect the full 28-command schedule without calling
Codex. `run` automatically prepares missing arms and runs one `build-page`
baseline/treatment canary before releasing the remaining queue.

The review server presents randomized A/B labels and stores blinded decisions in
the run directory. `report` performs the unblinding and writes both JSON and HTML
summaries with machine pass rates, preference counts, token use, and wall time.

## Manual playground

`playground/.agents/skills` contains symlinks to all seven active workflow skills. Launch
Codex with `playground` as the working directory to try them interactively without
making them visible to unrelated repositories.
