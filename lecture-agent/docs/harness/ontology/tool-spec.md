# Tool Spec — schema (thin)

A tool spec institutionalizes a single tool's contract so design decisions about it are
enforceable and traceable, the same way a mechanism record does for a rule. This schema is
deliberately thin: the *quality* of a tool's description, schema shape, response format, and
error-recovery wording is owned by the `tool-design` skill. Load that skill for the content;
use this schema to record the decision as an institution.

One per file, `ontology/tools/T-###-slug.md`.

## Field schema

```
id: T-###
name: <tool name as the agent sees it>
status: proposed | accepted | advisory | deprecated
purpose: <one line — what routing decision this tool exists to serve>
input_contract: <required/optional inputs and their meaning>
response_format: <what the agent gets back, and in what shape>
error_recovery: <what the error message tells the agent to DO next — actionable, not just a code>
boundary: <the adjacent tools this one must NOT overlap, and the dividing line>
enforcement_point: <where tool-boundary/contract violations are caught — e.g. a schema check, a review gate>
scenarios: S-###, ...
decision: D-###
```

## Field rules

- `error_recovery` must describe a recovery action, not merely name an error. "Returns 400"
  fails; "on missing `path`, returns the list of valid paths so the agent can retry" passes.
  (This mirrors `tool-design`'s actionable-error principle; here it is a required field so the
  check script can enforce its presence.)
- `boundary` is required whenever another tool spec exists — unresolved overlap fails the
  Boundary-clarity rubric dimension.
- Same promotion rule as mechanism records: `accepted` requires `enforcement_point`,
  a resolving `scenarios` ref, and `decision`.

Route depth questions (naming, description phrasing that agents route on, schema ergonomics,
tool-set consolidation) to the `tool-design` skill. This file only makes the resulting decision
binding and auditable.
