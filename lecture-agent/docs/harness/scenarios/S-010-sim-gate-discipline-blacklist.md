id: S-010
title: The sim trigger gate uses a discipline blacklist instead of a criterion
kind: observed
context: The planner (domain/planning.py::_skeleton_spec, line ~111) and skills/create-sim/SKILL.md's description (fed verbatim into plan_menu()) — both gate whether a sim/widget block is appropriate for a topic.
trigger: The gate text named disciplines directly — "人文/艺术/历史/思辨这类不贴题的题材不要硬塞 sim" and "Not for non-quantitative humanities/history/opinion topics." — the same shape of bias just removed from theme selection in S-009/M-009 (naming a subject category instead of describing the real condition that should drive the decision).
bad_outcome: The genre_routing experiment's prose group (宋代文人画/法国大革命/唐诗/存在主义) is designed to verify "humanities topics don't get sim forced on them" — but with a discipline blacklist in place, a passing result would only prove the blacklist works, not that criterion-based judgment (does this topic have a quantifiable/simulatable process?) holds up. The two look identical in outcome but differ in mechanism and trustworthiness.
why_it_matters: Same principle as S-008/S-009 — routing should follow a description of the real condition, not a named category — applied to a third selection surface (sim eligibility) discovered only after auditing all remaining choice points post S-009.
status: addressed
addressed_by: M-010

## Notes
Found via a "is everything unbiased now?" audit after M-009 — confirms bias-removal work needs a sweep across all selection surfaces, not just the one just fixed.
