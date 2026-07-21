id: M-014
title: runnable's contract/skill-doc no longer carries a quantity cap (cleanup; does not resolve S-014's open root cause)
status: accepted
trigger: `reg.contract` for the `runnable` block family (skills/create-code-runtime/contracts.json, injected verbatim at fan-out time per domain/generation/blocks.py:78) or its SKILL.md body.
behavior_change: Removed "全课 0-2 个，别过量" from contracts.json's trailing comment and the parallel "roughly 0-2 runnables" language from SKILL.md's body, replacing with fit-based phrasing ("贴题就用，别因'重'而回避") consistent with the no-quantity-cap principle established in D-008/D-010. This is legitimate hygiene — inconsistent quantity language across files under the same skill is worth removing on its own — but per S-014, it is NOT proven to change plan-stage selection frequency, since neither text was ever visible at the skeleton/plan stage in the first place (SKILL.md body is never parsed by registry.py; contracts.json only reaches fan-out, after a placeholder is already scheduled).
enforcement_point: tests/test_registry.py::test_runnable_contract_has_no_quantity_cap asserts registry["runnable"].contract contains neither "0-2" nor "别过量". Runs in the CI `test` step (pytest); a failure BLOCKS the merge.
enforcement_type: script
failure_mode: The guard only catches these exact phrases reappearing in the contract string — a differently-worded quantity cap would not be caught. More importantly: this mechanism guards against regressing the *cleanup*, not against the *actual* plan-stage coldness the scenario was originally investigating — do not read a green test here as "runnable coldness is fixed."
scenarios: S-014
rejects_example: reintroducing "0-2" or "别过量" into skills/create-code-runtime/contracts.json — the guard test fails.
cost: One string-containment assertion per CI run.
decision: D-014

## Notes
S-014 stays `status: open` deliberately — this mechanism only closes the "duplicate/inconsistent text" half of the investigation, not the "why does the skeleton rarely pick runnable at all" half. See S-014 for the honest accounting of what was and wasn't established.
