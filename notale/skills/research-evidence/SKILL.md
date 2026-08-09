---
name: research-evidence
description: Collect a small, traceable set of lecture-preparation records with literal source binding.
required_tools: [skill_read, artifact_read, web_search, fetch_web, submit_research]
---

# Research evidence

Produce only the evidence needed by your assigned research branch.

1. Read `course-brief.json` and only the relevant uploaded material chunks.
2. Use `web_search` to discover real URLs, then `fetch_web(url, query)`. Never guess a URL. Search at
   most twice and attempt at most four fetches; failures consume the budget too.
3. `fetch_web` returns a bounded excerpt but Harness retains the fetched text. A `quotedSpan` must be
   copied verbatim from the returned excerpt and its URL must match that exact fetch call.
4. Do not invent a quote or URL. A useful unsourced item may remain non-checkable and explicitly state
   its limitation.
5. Keep records distinct and compact. Each record needs a stable short `recordId`, its branch,
   structured content, invariants, valid range, and known inaccuracies.
6. Submit `notes`, `records`, and `pedagogy` together through `submit_research`. Harness validates the
   submission and maintains the task ledger; prose is not completion.
