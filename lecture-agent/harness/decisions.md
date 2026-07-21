# Decisions Log (ADR) — APPEND-ONLY

> This file is append-only. Never edit or delete an existing entry. A decision that was wrong is
> superseded by a NEW entry that references it, not by rewriting history. `id` values are
> monotonic (D-001, D-002, ...); the check script flags any gap, reuse, or out-of-order id.
> The real enforcement of append-only is git history — keep this project under version control.

Each entry records one accepted design delta and the evidence that passed it through the gate.
Grounding: North (1990) on path dependence — "once reached, a solution is difficult to exit
from." The log makes that path explicit and auditable instead of silently baked into the files.

## Entry schema

```
## D-###  <short title>
date: YYYY-MM-DD
scenario: S-###                 # the failure this delta answers
delta: <one-surface change + which ladder rung: prompt|context|skill|workflow|harness-code>
alternatives: <what else was considered and why rejected>
adversarial_result: <the laziest letter-satisfying / intent-violating move, and which gate catches it>
rubric: enforceability=pass, falsifiability=pass, minimality=pass, boundary=pass, gaming=pass, simplification=pass
mechanisms: M-###, ...          # created or changed by this decision
outcome: accepted
```

---

## D-001  Require enforcement points on all accepted mechanisms
date: 2026-07-20
scenario: S-001
delta: harness-code — add enforcement_point + enforcement_type required-field checks to check_structure.py
alternatives: A prose guideline in the skill body ("remember to add enforcement") — rejected as itself an informal constraint, exactly the failure mode S-001 describes.
adversarial_result: Author writes a hollow enforcement_point with no consequence. Caught by the enforcement-theater check in check_structure.py (STRUCTURE CHECK stage) and, as backstop, the Enforceability rubric dimension (RUBRIC REVIEW stage).
rubric: enforceability=pass, falsifiability=pass, minimality=pass, boundary=pass, gaming=pass, simplification=pass
mechanisms: M-001
outcome: accepted

## D-002  Ratify hexagonal layer enforcement as an accepted mechanism
date: 2026-07-20
scenario: S-003
delta: harness-code — record M-002 documenting the existing .importlinter contracts + CI `contract` step (no code change; ratifying existing reality into the registry)
alternatives: Leave the layering as PROJECT_STRUCTURE.md prose — rejected: that is exactly S-003 (prose rots); the doc itself demanded machine enforcement.
adversarial_result: Smuggle a dependency via a runtime/importlib import the static graph misses. Caught partially — the layering is load-bearing for mypy+tests so most evasions surface; residual risk noted in M-002 failure_mode.
rubric: enforceability=pass, falsifiability=pass, minimality=pass, boundary=pass, gaming=pass, simplification=pass
mechanisms: M-002
outcome: accepted

## D-003  Ratify schema-is-the-interface (no raw HTML) as an accepted mechanism
date: 2026-07-20
scenario: S-004
delta: harness-code — record M-003 documenting the existing validate.py/.mjs err-level HTML/color/tag checks + drop-not-fabricate repair behavior
alternatives: Trust the prompt instruction "author JSON, not HTML" alone — rejected: an informal constraint the model routinely violates (S-004).
adversarial_result: Encode a payload (entities/split tags) past the static string checks. Caught by the null-origin iframe sandbox as the authoritative render-time second gate; bare-color heuristic gap noted.
rubric: enforceability=pass, falsifiability=pass, minimality=pass, boundary=pass, gaming=pass, simplification=pass
mechanisms: M-003
outcome: accepted

## D-004  Ratify capability-coverage regression + heatmap as an accepted mechanism
date: 2026-07-20
scenario: S-002
delta: harness-code — record M-004 documenting test_icons.py nonzero assertion (CI) + profile_deck/build_coverage heatmap
alternatives: Rely on manual inspection of generated decks — rejected: the icons no-op survived 39 real runs unnoticed (S-002).
adversarial_result: A different capability silently zeroes with no equivalent assertion. Caught only if the heatmap is read; mitigation is to add the next assertion when a cell goes cold (M-004 failure_mode).
rubric: enforceability=pass, falsifiability=pass, minimality=pass, boundary=pass, gaming=pass, simplification=pass
mechanisms: M-004
outcome: accepted

## D-005  Fix the ruff gate to exercise the package (enforcement pending)
date: 2026-07-20
scenario: S-005
delta: harness-code — point ruff at `lecture_agent tests` and add a zero-file guard in Makefile/ci.yml. FILED as direction; code change deferred to an implementation pass, so M-005 stays status:proposed.
alternatives: Delete the lint target (loses real coverage) — rejected. Leave it as-is (S-005 theater) — rejected.
adversarial_result: A later rename re-breaks the path silently. The zero-file guard is the backstop — the fix is not the path edit alone but path + guard together (M-005 failure_mode).
rubric: enforceability=pass, falsifiability=pass, minimality=pass, boundary=pass, gaming=pass, simplification=pass
mechanisms: M-005
outcome: accepted (enforcement pending — code change deferred)

## D-006  Single source of truth for the schema SPEC (enforcement pending)
date: 2026-07-20
scenario: S-006
delta: workflow — make viewer/schema/SPEC.md canonical and generate-or-diff-check the skills/lecture-doc-schema/references copy in CI. FILED as direction; M-006 stays status:proposed until wired.
alternatives: Keep the manual "synced from" copy + discipline — rejected: that discipline already failed (S-006, stale against the code).
adversarial_result: A manual copy-paste "sync" re-introduces drift between checks. Only generation-from-source or a CI diff removes the manual step; a diff check is the minimum.
rubric: enforceability=pass, falsifiability=pass, minimality=pass, boundary=pass, gaming=pass, simplification=pass
mechanisms: M-006
outcome: accepted (enforcement pending — code change deferred)

## D-007  Wire the completeness gate to a consequence (enforcement pending)
date: 2026-07-20
scenario: S-007
delta: workflow — consume completeness.gate()'s verdict as a failing outcome in the eval/generation path (nonzero exit / rejected acceptance / hard report warning). FILED as direction; M-007 stays status:proposed.
alternatives: Leave gate() as a scoring-only measurement — rejected: that is S-007 (checker without consequence).
adversarial_result: "Wire" it to a warn-only log nothing acts on — the same theater one rung down. The consequence must be observable (exit code / rejected artifact), per M-007 failure_mode.
rubric: enforceability=pass, falsifiability=pass, minimality=pass, boundary=pass, gaming=pass, simplification=pass
mechanisms: M-007
outcome: accepted (enforcement pending — code change deferred)

## D-008  Route the planner on component descriptions; relax interactive-component suppression
date: 2026-07-20
scenario: S-008
delta: workflow — feed plan_menu(registry) (per-family descriptions) into the plan prompt instead of bare type names, and remove the quantity/priority suppression on sim/widget/runnable in _skeleton_spec; keep topic-fit gating.
alternatives: Invent a per-type use_when routing field — rejected (duplicates the description into a second hand-maintained surface). Leave routing as the hand-written heuristic — rejected (S-008: hides descriptions, suppresses interactive blocks).
adversarial_result: Descriptions present but vague, so the guard passes while routing stays poor — caught only by human/eval review (M-008 failure_mode). Relaxing suppression could regress into widget-everywhere slop — mitigated by the anti-slop advisories (M-101/103/104) staying, topic-fit gating retained, and a real-generation slop check in verification; fully reversible.
rubric: enforceability=pass, falsifiability=pass, minimality=pass, boundary=pass, gaming=pass, simplification=pass
mechanisms: M-008
outcome: accepted (M-102 quantity-suppression deliberately relaxed here — reversible)

## D-009  Move theme descriptions to a structured pure-visual registry; strip discipline bias and directional nudges
date: 2026-07-20
scenario: S-009
delta: workflow — replace the hand-written theme clause in _skeleton_spec with domain/themes.py::theme_menu() (pure-visual ThemeDesc per enum member, sourced from each theme's origin), delete the discipline binding + named-default nudge, and add tests/test_themes.py as the bijection/anti-bias guard. Theme choice is left entirely to the model.
alternatives: Make theme a skill (skills/theme-*/SKILL.md) — rejected (a theme has no generation contract; a theme-skill is a hollow shell and a third drift point on top of enum+CSS). Adopt genui's discipline tags + "variety is a goal" mandate — rejected (both are bias: forced-sameness and forced-variety). Keep the inline clause verbatim — rejected (S-009: biased, unguarded, example already drifted 11/15).
adversarial_result: A tagline can stay subtly discipline-tinted while passing the guard (only named phrases are checked) — caught by code review, not the script (M-009 failure_mode). "Let the model choose freely" could leave the pretraining default-skew intact — accepted deliberately: bias is observed post-hoc via build_coverage.py's by_theme, not corrected by re-biasing the prompt. Fully reversible (delete themes.py/test_themes.py, restore two signatures + the clause).
rubric: enforceability=pass, falsifiability=pass, minimality=pass, boundary=pass, gaming=pass, simplification=pass
mechanisms: M-009
outcome: accepted (references synthesized across frontend-slides/presentation-ai/presenton/slidev; genui de-weighted)

## D-010  Replace the sim-eligibility discipline blacklist with a criterion (quantifiable/simulatable process)
date: 2026-07-20
scenario: S-010
delta: workflow — reword domain/planning.py's sim gate and skills/create-sim/SKILL.md's description from naming disciplines ("人文/艺术/历史/思辨" / "humanities/history/opinion") to stating the real criterion (a quantifiable/mechanistic process with a real parameter to turn); extend tests/test_planning.py's existing suppression-drop test to assert the discipline words are gone and the criterion phrase is present.
alternatives: Leave the blacklist in place and run genre_routing anyway — rejected: a passing prose-group result would only prove the blacklist works, not that criterion-based judgment holds, undermining the experiment's own premise (raised by the user before approving the run).
adversarial_result: A model could still infer "humanities → no sim" from training-data correlation even without the words in-prompt — the criterion phrasing removes the explicit instruction to discriminate by subject, but cannot fully rule out latent bias; that residual is exactly what the genre_routing prose-group coverage check is for (empirical, not textual, verification). Fully reversible (two text edits + one assertion).
rubric: enforceability=pass, falsifiability=pass, minimality=pass, boundary=pass, gaming=pass, simplification=pass
mechanisms: M-010
outcome: accepted

## D-011  Isolate per-topic/seed failures in the batch experiment runner instead of aborting the whole run
date: 2026-07-20
scenario: S-011
delta: workflow — wrap the run_generation() call inside scripts/run_experiment.py's topics × seeds loop in try/except; log and record {"ok": false, "error": ...} on failure, continue to the next pair. Does NOT touch orchestrator.py's un-guarded scene-shape iteration (the actual root cause) — deferred per explicit user decision to keep this turn's fix minimal.
alternatives: Fix orchestrator.py's root cause directly (validate scene shape before the placeholder loop) — rejected this round: broader blast radius on production pipeline code the user wanted to leave untouched this turn; filed as the still-open half of S-011 for a future round. Just re-run the whole batch hoping the non-deterministic malformed response doesn't recur — rejected: no guarantee, risks repeated API spend on a second crash.
adversarial_result: A batch could still hang or leak resources if run_generation() fails in a way that isn't a clean exception (e.g. never returns) — try/except only catches raised exceptions, not hangs. Out of scope for this fix; no evidence of that failure mode observed.
rubric: enforceability=fail (no CI check added — see M-011 failure_mode), falsifiability=pass, minimality=pass, boundary=pass, gaming=n/a, simplification=pass
mechanisms: M-011
outcome: accepted (mechanism recorded as status:advisory per enforcement_type:none — the workflow change itself is adopted, but the schema correctly declines to call it "accepted/enforced" without a test)

## D-012  Make coverage's by_theme fall back to the model's real choice (profile.theme) instead of the config echo
date: 2026-07-20
scenario: S-012
delta: workflow — one-line change in viewer/build_coverage.py::build() to prefer rec.get("theme") (config-forced, when present) then fall back to rec["profile"]["theme"] (the model's actual selection) before defaulting to "(unknown)".
alternatives: Bypass the tool and hand-write a one-off script reading data/corpus/*.lecture.json directly for this run only — rejected: fixes nothing for the next free-choice experiment, and the tool fix is smaller than a throwaway script anyway.
adversarial_result: The config-echo path is left untouched (still wins when present), so no regression risk for existing config-forced experiments (e.g. main_result.yaml). The only behavior change is for records that previously had no top-level theme at all.
rubric: enforceability=fail (no test — same viewer/ no-test-precedent reasoning as M-011), falsifiability=pass, minimality=pass, boundary=pass, gaming=n/a, simplification=pass
mechanisms: M-012
outcome: accepted (status:advisory per enforcement_type:none)

## D-014  Remove runnable's duplicate quantity-cap text; correct the causal story mid-investigation; record diagram/scatter as investigated non-bugs
date: 2026-07-20
scenario: S-014
delta: workflow — audited viewer/telemetry/coverage.json (66 historical runs) for cold capabilities per user request ("enrich content types; detect what should be called but isn't"). Removed "0-2/别过量" from skills/create-code-runtime/{SKILL.md,contracts.json} (a real but only partially-explanatory duplicate of the D-008-fixed planning.py text) and added a guard test. Separately investigated diagram-variant coldness (pyramid/staircase/snake/circular-grid) and chart:scatter coldness via 3 parallel Explore agents — both concluded NOT a routing/description bug (rich, differentiated per-variant guidance already reaches generation; coldness best explained by topic/content-shape distribution) — no code change for either. hero_image coldness (1/66) traced to `generator.media=false`'s deliberate cost-control default, 100% hit rate when enabled — not a bug; user decided to enable it via `generator.media: true` in configs/experiment/genre_routing.yaml.
alternatives: Treat every cold capability as something to "fix" indiscriminately — rejected: diagram variants and chart:scatter show no evidence of a routing bug, and forcing changes there would be unfalsifiable "fixing" of a non-problem. Flip the global `generator.media` default to true — rejected: that default is deliberately cost/latency-conscious for every OTHER run path; the fix belongs in the specific experiment config that wants images, not globally.
adversarial_result: Mid-implementation, re-verified the "duplicate suppression" causal claim against the actual code path (registry.py's frontmatter-only parsing, contracts.json's fan-out-only injection point) and found it only half holds — the removed text was never seen at the plan/skeleton stage that decides selection frequency in the first place. Corrected the scenario/mechanism write-up to say so explicitly (S-014 stays `open`) rather than overclaiming a root-cause fix. This is itself the adversarial check: "did the fix actually reach the mechanism the symptom is attributed to" — here it did not, fully.
rubric: enforceability=pass, falsifiability=pass, minimality=pass, boundary=pass, gaming=pass, simplification=pass
mechanisms: M-014
outcome: accepted (cleanup only; S-014's actual root question — why the skeleton rarely selects runnable — stays open and unresolved by this delta)
