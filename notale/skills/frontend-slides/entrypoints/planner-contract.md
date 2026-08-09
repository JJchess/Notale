---
name: frontend-slides
required_tools: [skill_read, artifact_read, artifact_search, submit_contract]
---

# Notale Deck Visual Contract

Design only the shared visual language for a complete Notale lecture deck. Do not compose pages,
write HTML, choose page layouts, invent controls, create previews, ask the user design questions, or
follow the full-deck export/deployment workflow. Individual Builders own those decisions through the
`notale-page` entrypoint.

Read the complete course brief, outline inputs, and curriculum plan before choosing the contract.
Make the visual direction specific to the subject and useful across every chapter rather than naming a
generic style such as “clean”, “modern”, or “technical”. Choose one recurring visual motif that can
connect distant pages without forcing every page into the same layout—for example a shared coordinate
system, state encoding, documentary treatment, typographic gesture, or transformation language.

Return exactly one deck-level contract through the Planner's structured submission:

- `artDirection`: one concise statement describing atmosphere, hierarchy, media treatment, and the
  intended relationship between explanation and evidence.
- `visualMotif`: one concise rule for a recurring subject-specific visual encoding. It must not name a
  page template or prescribe a component grid.
- `styleTokens`: exactly the semantic keys `bg`, `surface`, `ink`, `muted`, `accent`, `accent-2`,
  `line`, `font`, and `mono`. Colors must be offline-safe CSS color values; font stacks must use local
  or system fallbacks and must not require downloads.

Use a legible foreground/background relationship and a restrained accent hierarchy. The shared tokens
own deck identity; page-local colors may still encode domain state, categories, warnings, or data. Do
not output component names or library names as part of the visual contract.
