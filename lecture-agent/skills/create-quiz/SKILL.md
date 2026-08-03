---
name: create-quiz
description: Author a quiz block for a LectureDoc lecture — objective (multiple-choice, auto-graded) or subjective (open discussion prompt). Reach for it whenever a page should check understanding or provoke reflection rather than only present — at least one per lecture is encouraged. Objective for a checkable fact/skill, subjective for open-ended thinking. Produces schema-valid quiz block JSON.
version: 1.0.0
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Courseware, LectureDoc, Quiz, Assessment]
    related_skills: [lecture-doc-schema, generate-lecture]
---

# create-quiz — quiz blocks

Read `lecture-doc-schema` first (SPEC §3.2 quiz). A quiz block lives on a `kind:"quiz"` scene. Produce ONE quiz block and self-check with `node <lecture-doc-schema>/scripts/validate.mjs --block <file>`.

## Two kinds

**Objective (auto-graded):**
```json
{
  "type": "quiz", "kind": "objective",
  "stem": "网格搜索在高维失效的根本原因是？",
  "choices": [
    { "key": "a", "text": "随机性不足" },
    { "key": "b", "text": "评估点数随维度指数增长（维度诅咒）" },
    { "key": "c", "text": "目标函数不连续" }
  ],
  "answer": "b",
  "explain": "维度诅咒：均匀网格的点数是 $k^d$。选 a 混淆了随机搜索的动机；c 与网格/随机/贝叶斯的适用性无关——它们都不假设连续性。"
}
```
- 2–6 `choices`, each `{key:"a".."z", text}`, unique keys. `answer` = one key that exists.
- **`explain` 必须解释"为什么对 + 为什么最像的干扰项不对"**，不只是复述正确项（SPEC §5 rule 7）。
- For any numerical or iterative question, recompute the answer from the actual recurrence/formula. The explanation must show the governing expression (for example `$w_{t+1}=(1-2\eta)w_t$`), not replace geometric change with a false constant-step story.
- The stem must test the page brief's observable objective, and each distractor should correspond to the stated misconception or another identifiable reasoning error; avoid trivia that can be guessed without using the lesson.

**Subjective (discussion anchor):**
```json
{
  "type": "quiz", "kind": "subjective",
  "prompt": "如果评估预算只有 3 次，你会选网格、随机还是贝叶斯？为什么？",
  "angles": ["建模开销 vs 收益", "预算与维度的关系"],
  "instruction": "先独立写 2 句，再与同伴对比。"
}
```
- `prompt` required; `angles?`/`instruction?` optional.

## Rules
- stem/text/explain use inline-md only (`**b**`/`*em*`/`` `code` ``/`$latex$`), no raw HTML.
- Chinese typography per SPEC §5. Keep on-slide text lean; long teaching notes go in the scene `notes`.
- The `kind:"quiz"` scene must contain this quiz block (the orchestrator ensures the scene kind).
