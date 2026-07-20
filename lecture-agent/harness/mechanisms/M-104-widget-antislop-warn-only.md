id: M-104
title: Widget anti-slop lint is detection-only (warn, no blocking consequence)
status: advisory
trigger: A generated sim.widget fragment passes through aesthetic_lint / aestheticLint.
behavior_change: Machine-tells (missing motion, self-intro <h1>, "提示:/Tip:" capsule, prefers-color-scheme, stock #4fc3f7) are DETECTED and emitted as warn() — but warn is non-fatal, so nothing blocks or re-drives on the lint alone.
enforcement_point: none as a gate — the checker exists but its output is a non-blocking warning; per the institution this is detection without a consequence, hence advisory-tier, not a mechanism.
enforcement_type: none
failure_mode: The warnings are ignored because nothing acts on them. The enforceable part is not the lint but its CONSUMER: the widget subrecipe (domain/generation/widget.py) already feeds these warns back into the repair loop on non-final rounds — that specific consumption is closer to a real mechanism and could be recorded separately once its consequence (repair-or-drop) is pinned.
enforcement_type_note: warn-only detection is enforcement theater if presented as a gate; classified advisory to keep the tiering honest.

## Notes
Compiled from A9. Honest classification: a warn-only check is not a gate. The genuinely-enforced neighbor is widget.py's repair loop, which errors+warns drive on non-final rounds — a candidate future accepted mechanism.
