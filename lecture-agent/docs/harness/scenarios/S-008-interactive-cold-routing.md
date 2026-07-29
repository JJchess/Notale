id: S-008
title: Interactive components stay cold because routing ignores their descriptions
kind: observed
context: The planner (domain/planning.py::_skeleton_spec) at the PLAN stage, deciding which block type each placeholder gets.
trigger: The planner was handed only bare type names (auto_types: list[str]); each family's SKILL.md description — the "when to use" routing surface — was parsed into SkillEntry.description but never fed to any LLM. "When to invoke" instead lived as a hand-written heuristic block that actively suppressed interactive components ("widget 最低优先级/至多2个/别过量", runnable "0-2/别过量").
bad_outcome: Over 40 real runs, sim fired in only 3, runnable in 1, and sim:searchCompare / sim:custom never — not model bias but the planner hiding the descriptions and talking the model out of interactive blocks.
why_it_matters: The core tool-design principle — the description IS the routing decision — was violated: the routing surface (plan prompt) and the description surface (contract/frontmatter) were decoupled, so a good description could not make a component reachable, and adding a component meant editing a central prompt.
status: addressed
addressed_by: M-008

## Notes
Exactly the gap M-102 (advisory) and K-001 flagged. Fixed by feeding per-family descriptions into the plan menu and relaxing the suppression (decision D-008).
