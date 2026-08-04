---
name: create-infographic
description: Author stats blocks for a LectureDoc lecture. Use only to spotlight 2-6 standalone key numbers whose individual magnitude is the evidence; use chart for trends, distributions, or correlations and create-diagram for structural relationships. Produces schema-valid stats block JSON.
affordances: [standalone-metrics, fixed-state]
learner-actions: [inspect, compare]
evidence-outputs: [key-number]
limitations: [no-trends, no-structural-relations, no-unsourced-numbers]
---

# Create stats

Produce one `stats` block with 2-6 concise items. Keep `value` visually dominant and make `label` state exactly what it measures. Add `delta` only when the supplied material establishes the comparison.

Never manufacture authoritative-looking percentages, counts, or benchmarks. Use supplied evidence, a visible derivation, or mark the value as illustrative. Route any structural relationship to `create-diagram`.
