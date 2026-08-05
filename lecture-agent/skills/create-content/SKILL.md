---
name: create-content
description: Author static prose and layout blocks for a LectureDoc lecture page — hero, statement, list, agenda, callout, formula, table, code, compare, and grid. Use when a lecture needs narrative or nominal lookup rather than a structural diagram, interactive simulation, quiz, or code runtime. Produces schema-valid block JSON.
license: MIT
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
- Treat the page brief as a contract: this block must serve its assigned role and the single `keyClaim`; do not introduce a second lesson just because the schema has room.
- Static content explains, labels, or supports evidence; it is not visual evidence by itself. If `visualTask` asks learners to inspect structure, state, path, trend, geometry, or observable appearance, pair this content with the corresponding diagram, chart, sim, runtime, or media capability. A text-only `compare` cannot prove a structural or quantitative comparison.
- A formula caption must state assumptions and the exact implication of that formula. Distinguish an approximation from a theorem and a special-case quadratic result from a general result; never broaden a condition in prose.
- `formula.latex` is already display math: never wrap it in `$...$`, `$$...$$`, `\[...\]`, or `\(...\)`. Use `aligned`/`gathered` inside the field when a derivation needs multiple readable lines.
- Keep a static `code` block to a focused excerpt (at most 42 lines and roughly 2400 characters). Use runnable for a full implementation the learner must execute, and move nonessential scaffolding out of the visible stage.
- Markdown tables are not valid inside ordinary inline text. Use a `table` block for evidence matrices; quiz stems may use a compact GFM table only when the matrix is part of the question itself.
- Keep one derivation chain or one conceptual contrast per page. If an intent asks for a descent lemma, step-size choice, spectral analysis, and convergence-rate taxonomy together, flag the page as needing a split instead of compressing four theorems into one list/grid.
- Do not add attributed quotations, exact empirical percentages, paper/year claims, or benchmark numbers unless they appear in supplied material. Use explicitly labeled toy examples for pedagogy.

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
