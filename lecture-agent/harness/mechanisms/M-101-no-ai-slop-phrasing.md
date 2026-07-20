id: M-101
title: No AI-slop phrasing in generated copy
status: advisory
trigger: Any user-visible generated text (headlines, leads, captions). Guidance to the generator prompts, not a gate.
behavior_change: Prompts steer away from filler openers ("让我们一起…", "值得注意的是…"), border/capsule/badge pile-ups, and rainbow accents — but nothing rejects a violation; an informal, prompt-level constraint.
enforcement_point: none — lives in prompt/skill guidance (SPEC §5.2); eroded by optimization pressure like any informal constraint (North: informal codes supplement but do not equal formal rules).
enforcement_type: none
failure_mode: The model rephrases around any blocklist; real enforcement would need an LLM-judge rubric dimension, not a regex (see rejected R-002).

## Notes
Compiled from A2 / SPEC §5.2, which is branded "硬约束" but has no checker. Filed advisory per the principle-compilation gate: enforcement_type:none cannot be accepted. This is the clearest principle-piling case in the repo.
