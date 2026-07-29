id: S-006
title: Two "synced" SPEC.md copies contradict each other and the current code on runnable count
kind: observed
context: viewer/schema/SPEC.md (declared the single source of truth) vs lecture-agent/skills/lecture-doc-schema/references/SPEC.md (declared "synced from viewer/schema/").
trigger: The runnable-count rule was liberalized in code (task #46 removed the per-deck count limit in both validators); viewer/SPEC.md:126 was updated to "一个 deck 可以有多个 runnable", but the references/ copy still reads "每个 deck 至多一个 runnable block" as a hard runtime constraint.
bad_outcome: Two authoritative-looking specs give opposite rules, and the stale one contradicts the shipped validators. An agent or human reading references/ will believe a limit the code no longer enforces.
why_it_matters: A spec that has drifted from the code is a record that lies. The "single source of truth" claim makes it worse — readers trust the copy precisely because it says it is synced.
status: open
addressed_by: M-006

## Notes
Defect #2. Verified firsthand: viewer/schema/SPEC.md:126 vs references/SPEC.md:126 read opposite rules; the code (task #46) matches the viewer copy.
