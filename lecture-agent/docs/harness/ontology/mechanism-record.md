# Mechanism Record — schema + annotated example

A mechanism record is the atomic unit of an institutionalized harness design. It exists to
force a design idea to declare its **enforcement**: an idea that cannot name who checks it,
where, and what happens on violation is not a mechanism — it is an *informal constraint*
(North's term) and must be filed as `status: advisory`, never `accepted`.

One record per file, named `mechanisms/M-###-slug.md`. The block below is the exact schema.
Fields are flat `key: value` lines so the check script can parse them without a YAML library.
List-valued fields (`scenarios`) are comma-separated. Prose may follow the field block under
`## Notes`.

## Field schema

```
id: M-###                 # matches the filename; stable, never reused
title: <short imperative name of the rule>
status: proposed | accepted | advisory | deprecated
trigger: <the condition under which this rule applies — AND when it does NOT apply>
behavior_change: <what concretely happens differently once this rule is in force>
enforcement_point: <who/what checks + WHERE in the workflow + the consequence on violation>
enforcement_type: script | workflow-gate | rubric | human | none
failure_mode: <how this mechanism itself fails, erodes, or gets gamed>
scenarios: S-###, S-###   # >=1 existing scenario file; required when status: accepted
rejects_example: <one concrete bad artifact this rule would reject — falsifiability>
cost: <enforcement/measurement cost; who pays it and how often>
decision: D-###           # the ADR entry that accepted this record; required when accepted
```

## Field rules (the check script enforces these)

- `enforcement_type: none` **forces** `status: advisory`. A rule with no enforcement point is,
  by North's definition, an informal constraint — durable only as culture, not as institution.
  It may still be recorded (it has value as guidance), but it may never be marked `accepted`.
- `status: accepted` requires ALL of: `enforcement_point`, a non-`none` `enforcement_type`,
  at least one `scenarios` ref that resolves to a real file, `rejects_example`, and `decision`.
- `enforcement_point` must name a **consequence**, not just a checker. "Reviewer keeps this in
  mind" is enforcement theater (see `references/adversarial-checklist.md`). Name what is
  blocked, rejected, or reverted when the rule is violated.
- `trigger` must state the negative boundary (when the rule does *not* fire). A rule that
  applies "always" is usually a principle wearing a mechanism's clothes.
- `rejects_example` must be a concrete artifact, not a category. "Bad tool designs" fails;
  "a tool spec with no error-recovery field" passes.

## Annotated known-good example

```
id: M-001
title: Every accepted mechanism names an enforcement point with a consequence
status: accepted
trigger: A design idea is proposed for promotion to status:accepted. Does NOT apply to ideas filed as advisory, which are explicitly exempt.
behavior_change: The review gate blocks promotion until enforcement_point names a checker, a location, and a consequence; ideas that only describe desired behavior are routed to advisory instead of accepted.
enforcement_point: check_structure.py, run at the STRUCTURE CHECK state of every iteration, exits non-zero and refuses the record if an accepted mechanism lacks enforcement_point or names no consequence.
enforcement_type: script
failure_mode: An author writes a syntactically present but hollow enforcement_point ("reviewer should ensure X"). Caught by the enforcement-theater check, which flags checker-less phrasings.
scenarios: S-001
rejects_example: A record titled "Prefer minimal deltas" with enforcement_type:none but status:accepted — rejected because advisory-only rules cannot be accepted.
cost: One script run per iteration (sub-second); one-time authoring cost of writing the enforcement_point sentence.
decision: D-001
```

## Notes (free prose section, optional)

Grounding: North, *Institutions, Institutional Change and Economic Performance* (1990), p.4 —
"an essential part of the functioning of institutions is the costliness of ascertaining
violations and the severity of punishment." A rule without ascertainment (a checker) and
punishment (a consequence) is not functioning as an institution. See
`references/north-institutional-mapping.md`.
