id: S-011
title: A malformed skeleton scene (string instead of object) crashes the whole run with no shape validation
kind: observed
context: domain/planning.py::plan_lecture parses the planner's JSON skeleton via parse_json (syntax-only) and returns it; agent/orchestrator.py::generate_lecture then iterates doc["scenes"] and calls s.get("blocks") on each scene at line ~215.
trigger: During the real genre_routing run (llm=glm_5_2), topic 2/15 ("二分查找") returned syntactically valid JSON where one array element under "scenes" was a plain string instead of a scene object. parse_json succeeded, plan_lecture's own retry-on-exception (3 attempts) never fired because no exception occurred there, and orchestrator.py's un-guarded s.get("blocks") raised AttributeError: 'str' object has no attribute 'get', crashing the entire multi-topic experiment run (only 1/15 topics had produced data).
bad_outcome: A single malformed model response — a shape-level defect, not a JSON-syntax defect — takes down an entire batch experiment (topics × seeds) with no isolation and no per-topic recovery, wasting all API spend on topics after the crash point.
why_it_matters: The pipeline validates JSON syntax (parse_json) but never validates the skeleton's structural shape (scenes must be a list of objects with a "blocks" list) before consuming it — a gap between "valid JSON" and "valid LectureDoc skeleton" that only a real, non-deterministic LLM response surfaces.
status: addressed
addressed_by: M-011

## Notes
Fixed at the batch-runner level (isolate per-topic failures) per user decision, not at the orchestrator/schema level (that would be the more thorough fix — deferred, tracked here for later).
