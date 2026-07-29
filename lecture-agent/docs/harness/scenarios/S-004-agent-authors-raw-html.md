id: S-004
title: Agent emits raw HTML or bare color values that break theme coherence or inject unsafe tags
kind: observed
context: Block generation (domain/generation) and the two escape hatches (sim.widget, freeform); the schema-is-the-interface contract says the agent authors JSON, not markup.
trigger: An LLM, left unconstrained, writes raw HTML in an inlineMd field or hardcodes a color/font instead of a theme token — the path of least resistance for a model that "knows HTML".
bad_outcome: Content that ignores the deck theme (hardcoded #f00) or injects dangerous tags (script/iframe/on*=), breaking both visual consistency and the sandbox isolation model.
why_it_matters: The entire design rests on "schema 即接口——agent 不接触 HTML/CSS"; a single unchecked raw-HTML field defeats theme coherence (SPEC §8) and the offline/safety red lines.
status: addressed
addressed_by: M-003

## Notes
The inlineMd raw-HTML ban and freeform/widget sanitize are the mechanisms that close this; M-003 ratifies them.
