id: M-001
title: Every accepted mechanism names an enforcement point with a consequence
status: accepted
trigger: A design idea is proposed for promotion to status:accepted. Does NOT apply to ideas filed as advisory, which are exempt.
behavior_change: The review gate blocks promotion until enforcement_point names a checker, a location, and a consequence; ideas that only describe desired behavior are routed to advisory.
enforcement_point: check_structure.py, run at the STRUCTURE CHECK state of every iteration, exits non-zero and will reject the record if an accepted mechanism lacks enforcement_point or names no consequence.
enforcement_type: script
failure_mode: An author writes a present but hollow enforcement_point. Caught by the enforcement-theater check, which flags checker-less phrasings.
scenarios: S-001
rejects_example: A record titled "Prefer minimal deltas" with enforcement_type:none but status:accepted -- rejected because advisory-only rules cannot be accepted.
cost: One script run per iteration (sub-second); one-time cost of writing the enforcement_point sentence.
decision: D-001

## Notes
Seed mechanism created by scaffold.py. Grounding: North (1990) p.4 -- enforcement = ascertaining
violations + severity of punishment. See references/north-institutional-mapping.md.
