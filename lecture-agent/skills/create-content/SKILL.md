---
name: create-content
description: Author static content blocks for a LectureDoc lecture page — hero, statement, list, agenda, callout, formula, flow, table, code, compare, grid. Use when a lecture needs prose/narrative/layout (not an interactive sim, quiz, or code runtime). Produces schema-valid block JSON.
version: 1.0.0
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Courseware, LectureDoc, Content, Layout]
    related_skills: [lecture-doc-schema, generate-lecture]
---

# create-content — static content blocks

Read `lecture-doc-schema` first (schema + SPEC §3, §5). This skill owns the non-interactive blocks. Produce ONE block object (or, when delegated, the block for a given placeholder id) and self-check with `node <lecture-doc-schema>/scripts/validate.mjs --block <file>`.

## The blocks (pick the tightest fit)

| type | when | key fields |
|---|---|---|
| `hero` | cover / closing page (kind:hero) | `title`(1–3 行数组), `tag?`, `sub?`, `facts?`, `hint?` |
| `statement` | full-page big-type takeaway (kind:statement) | `statement` (one line, inline-md) |
| `list` | numbered key points | `items[≤12]`:[{`lead?`(衬线强调词), `text`, `fragment?`}] |
| `agenda` | equal-height labeled rows (prefer over two uneven columns) | `rows[≤12]`:[{`label`, `text`, `fragment?`}] |
| `callout` | one top-lined summary line | `label`, `text` |
| `formula` | display formula | `latex`(纯源码，**不带** $/$$ 包裹), `caption?` |
| `flow` | process nodes | `nodes[2..7]`:[{`title`, `sub?`, `state?`:on\|q}], `loopNote?` |
| `table` | ledger table | `head[≥2]`, `rows[][]` (cell 可 `{text,hi:true}`) |
| `code` | static (non-runnable) code card | `filename?`, `language`:python\|javascript\|text, `source`, `caption?` |
| `compare` | left/right symmetric comparison (e.g. before/after code) | `left`/`right`:{`caption?`, `block`} |
| `grid` | flexible N-col container, children are any blocks (recurses) | `columns`:2..4, `gap?`, `items`:[{`block`, `span?`:1..4}] |

## Authoring rules (SPEC §5 — hard)

- One clear point per page. `lead`/labels are terse statements, not onboarding copy.
- Inline-md only in text fields: `**衬线强调**`, `*em*`, `` `code` ``, `$latex$`. **No raw HTML** (validator rejects it).
- Multiple points → `list` or `agenda` (equal-height rows). **Don't put two uneven blocks side by side** — use `agenda` or a ledger `table`. `compare` is only for genuinely symmetric halves.
- Formulas are LaTeX, never Unicode super/subscripts.
- Never write literal colors/fonts — everything is theme-token-driven at render time.
- Chinese typography: full-width punctuation, space between CJK and Latin/digits, no uppercasing Chinese labels.
- Put detailed explanation in the scene's `notes`, keep on-slide text lean.

## Example (list block)

```json
{
  "type": "list",
  "items": [
    { "lead": "网格搜索", "text": "均匀撒点，维度一高就指数爆炸——$O(k^d)$。" },
    { "lead": "贝叶斯优化", "text": "用历史评估建 `代理模型`，把下一个点选在最有信息量处。" }
  ]
}
```

Self-check: write the block to a file → `node <skill>/scripts/validate.mjs --block block.json` → fix any path-tagged error → repeat.
