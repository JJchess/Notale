id: M-102
title: Prefer the least-powerful sim engine; widget is the last-resort escape hatch
status: advisory
trigger: Choosing a sim engine, or deciding whether a deck needs a widget/runnable. Guidance to the planner + create-sim contract, not a gate.
behavior_change: The planner is told to pick the weakest engine that fits (registry engine > custom > widget) and to keep interactive escape hatches rare (soft budget: 0-1 widget/runnable, usually own page); but the validator accepts any valid engine and there is NO count check anywhere.
enforcement_point: none — purely advisory ordering (SPEC §5.6, create-sim contract, A14). No mechanism ranks or blocks by engine choice, and no widget/runnable count is enforced in either validator.
enforcement_type: none
failure_mode: A deck over-uses widgets and nothing objects. This is the strongest candidate to compile into a real mechanism later — a count/complexity check would give it teeth — but that needs a new observed scenario first (over-use has not yet been observed).

## Notes
Compiled from A5/A14 and the prior widget-subrecipe plan's "deck budget 0-1, ≤2 total". Review confirmed there is no widget-count mechanism in either validator. Tracked as a future scenario candidate, deliberately NOT accepted.
