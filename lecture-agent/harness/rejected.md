# Rejected Log — APPEND-ONLY

> This file is append-only. Rejected proposals stay here so the loop does not rediscover them.
> Without this record, an autonomous loop re-proposes the same failed ideas every run. `id`
> values are monotonic (R-001, R-002, ...). The lesson line is the payload — write it so a
> future agent reads it and does not repeat the mistake.

Grounding: preserved negative results are the cheapest way to trim a successor's search space
(see `ce-self-improvement-loops`). A rejection is data, not waste.

## Entry schema

```
## R-###  <short title>
date: YYYY-MM-DD
proposal: <one-line summary of what was proposed>
failed_on: <the rubric dimension or gate that rejected it>
reason: <why it failed, concretely>
lesson: <what NOT to re-propose, and what to do instead>
```

---

## R-001  Lower the enforceability bar for "obvious" rules
date: 2026-07-20
proposal: Allow mechanisms whose rule is "self-evidently good" to skip the enforcement_point field.
failed_on: Enforceability (and the drift-to-low-performance gotcha)
reason: "Self-evident" is unbounded; every principle claims it. Accepting this would reopen exactly the principle-piling hole the institution exists to close, and it erodes the rubric — a drift-to-low-performance move (Meadows p.123).
lesson: Never weaken the rubric to admit an artifact. If a genuinely good rule has no enforcement point, file it as status:advisory — do not lower the bar for accepted.

## R-002  Compile the AI-slop phrasing ban into a regex lint that blocks generation
date: 2026-07-20
proposal: Turn SPEC §5.2's "禁 AI 味措辞" (A2) into a regex/blocklist that hard-fails generation when a banned phrase ("让我们一起…", "值得注意的是…") appears — i.e. promote advisory M-101 to an accepted script-gate.
failed_on: Gaming resistance (#5) and Minimality (#3)
reason: A blocklist is trivially gamed — the model rephrases around any fixed list — while false-positiving on legitimate prose that happens to contain a phrase. It is a prompt-rung concern (weakest leverage) dressed as a harness-code gate; the effort buys detection that does not survive an adversary.
lesson: Keep A2 as advisory (M-101). Do NOT re-propose a phrase blocklist. If AI-slop must be enforced, it belongs as an LLM-judge rubric dimension (route to ce-advanced-evaluation), which can assess intent rather than surface strings — never a regex gate.
