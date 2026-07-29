id: M-008
title: The planner's component menu is assembled from each family's description, guarded by a test
status: accepted
trigger: Any block family surfaced to the planner (any auto_type — not the AUTO_EXCLUDE escape hatches). Applies whenever a skill/contract is added or its description edited. Does NOT apply to freeform/embed/video (deliberately off the auto menu).
behavior_change: The plan-stage type menu is built by plan_menu(registry) from each family's SKILL.md description (the routing surface), not a hand-maintained prose block; a family with an empty/boilerplate-only description is caught mechanically instead of silently becoming unreachable.
enforcement_point: tests/test_registry.py asserts every auto_type appears in plan_menu with a non-empty description; it runs in the CI `test` step (pytest) and a failure BLOCKS the merge. (Guards presence of the routing surface; routing correctness itself remains a prompt-quality matter, tracked in K-001.)
enforcement_type: script
failure_mode: A description can be present but vague, so the guard proves it exists, not that it routes well — quality still leans on human/eval review. A family added under AUTO_EXCLUDE bypasses the guard by design.
scenarios: S-008
rejects_example: adding a new block skill whose SKILL.md description is empty or only the "Produces schema-valid … JSON" boilerplate — test_registry.py fails because the trimmed description is empty.
cost: One pytest assertion per CI run; the menu is assembled once per generation.
decision: D-008

## Notes
Promotes the routing half of M-102 from advisory to enforced: "description drives selection" now has a checker. The quantity-suppression half of M-102 was deliberately relaxed — see D-008 for that reversible tradeoff.
