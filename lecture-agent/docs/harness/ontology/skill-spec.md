# Skill Spec — schema (thin)

A skill spec institutionalizes a single skill's scope and boundaries so that "when does this
skill activate" is a recorded, checkable decision rather than a vibe. Content quality of the
skill itself (its body, its examples) is out of scope here; this schema captures the
*activation contract* and its enforcement.

One per file, `ontology/skills/K-###-slug.md`.

## Field schema

```
id: K-###
name: <skill name, kebab-case>
status: proposed | accepted | advisory | deprecated
scope: <the concrete tasks this skill covers>
anti_triggers: <when this skill must NOT fire — the negative boundary>
activation_signal: <what in the request/context should route to this skill>
routing: <sibling skills for adjacent work, named explicitly — "route X to <sibling>">
enforcement_point: <where mis-activation is caught — e.g. description-eval, a routing test, human review>
scenarios: S-###, ...
decision: D-###
```

## Field rules

- `anti_triggers` is required. A skill that never says when it should *not* fire will
  over-activate and collide with siblings; empty anti-triggers fails Boundary clarity.
- `routing` must name real sibling skills for the adjacent work it deliberately excludes. This
  is the house style of the `ce-*` family (see any sibling's `description`): explicit routing
  boundaries, not silent gaps.
- `accepted` promotion rule identical to mechanism records.

The distinction being enforced here is North's institutions-vs-organizations line (1990,
p.4-5): a skill *spec* is a rule (an institution); the running skill invocation is a player
acting under it. Keep the two separate — you are recording the rule, not the play.
