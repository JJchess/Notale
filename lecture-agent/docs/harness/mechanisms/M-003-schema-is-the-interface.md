id: M-003
title: Schema is the interface — the agent never authors raw HTML except in sandboxed escape hatches
status: accepted
trigger: Any generated block field. Applies to inlineMd fields and ordinary blocks always; the sim.widget/freeform html fields are the controlled exception, themselves constrained by fragment-shape + sanitize checks. Does NOT apply to notes prose (markdown, not rendered as HTML).
behavior_change: Raw HTML tags, dangerous tags/attrs (script/iframe/on*=/javascript:), remote asset URLs, and bare color/font values (non-token) are rejected at validation rather than silently rendered — the agent is forced back onto the JSON schema.
enforcement_point: validate.py / validate.mjs — checkInline (raw tag -> err), checkFreeformHtml (dangerous tag / remote img / url() / bare color -> err), checkWidgetHtml (doctype/html/head/body -> err, too-short -> err). An err re-drives the per-block self-repair loop; if still unfixable on the last round the block is DROPPED (never fabricated) and surfaced in GenerateResult.dropped, and residual doc errors make the CLI exit non-zero.
enforcement_type: script
failure_mode: A cleverly-encoded payload (HTML entities, split tags) slips past the static string checks; the null-origin iframe sandbox is the authoritative render-time second gate for widgets. Bare-color detection is heuristic and may miss exotic CSS.
scenarios: S-004
rejects_example: an inlineMd `lead` field containing `<span style="color:#f00">重点</span>` — checkInline errors on the raw tag; the block is re-generated or dropped, not shipped.
cost: Pure-function validation per block (microseconds); Python/JS parity maintained in two mirrored files.
decision: D-003

## Notes
Compiled from A18 ("schema 即接口——agent 不接触 HTML/CSS") plus the M2/M4-family checks. The stated principle is broader than the checks (ordinary blocks simply have no html field), but the enforceable core is real and load-bearing.
