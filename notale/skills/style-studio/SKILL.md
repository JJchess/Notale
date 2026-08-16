---
name: style-studio
description: Generate one concrete, topic-derived design system and fixed-canvas composition vocabulary for an HTML-native lecture deck. Use before lecture planning so independent page Builders share a coherent visual world without relying on a preset theme.
---

# Style Studio

Create one run-local design source of truth for the supplied lecture request. Derive it from the
subject, audience, language, and intended learning journey. Do not select a packaged theme and do
not design individual pages.

Assume the structured response schema is authoritative for field names, types, required values,
and composition count. Concentrate on design decisions the schema cannot express.
Name the visual system with two to four lowercase alphabetic words joined by hyphens. Do not use
digits, dates, measurements, or a one-word label, and do not reuse the lecture title as the name.

## Derive, do not categorize

Start from relationships that matter in the subject: causality, conflict, sequence, uncertainty,
scale, transformation, material evidence, spatial movement, comparison, or accumulation. Convert
those relationships into visual behavior. Make the visual thesis meaningfully wrong for an
unrelated lecture.

Do not use labels such as “modern,” “editorial,” “technical,” “playful,” or “archival” as reasons
for decisions. Such words may summarize a result, but concrete choices must establish typography,
spatial rhythm, hierarchy, semantic encoding, recurring motifs, media treatment, interaction, and
the boundary between continuity and variation.

When references are supplied, extract relationships rather than copying surfaces: palette
balance, type hierarchy, geometry, spacing rhythm, image handling, material qualities, and motion
logic. Never copy reference text, branding, lesson-specific imagery, or signature composition.

## Build a fixed-canvas composition vocabulary

Create a compact catalog of structurally distinct, topic-specific families for a 1280×720 canvas.
A lecture around twenty pages often benefits from roughly 5–7 families, but derive the count from
meaningful structural needs; never add, remove, split, or merge a family merely to hit that range.
Each family must define its dominant visual carrier, reading path, spatial balance, and supporting
role for text. Changing only color, font, texture, ornament, or motif does not create a new family.

Use one primary structural primitive and at most one different secondary:

- `focal-object`: one object owns the field; annotation orbits it.
- `asymmetric-split`: unequal regions create tension between claim and evidence.
- `full-bleed-evidence`: an image, artifact, or visual field reaches the canvas edge.
- `spatial-map`: position and connection carry the explanation.
- `process-path`: sequence or causality creates the reading route.
- `comparison`: a shared axis makes differences observable.
- `data-led`: one quantitative pattern determines hierarchy.
- `document-led`: a quotation, source, equation, or code artifact is the page.
- `matrix`: repeated cells expose a meaningful two-dimensional system.
- `interactive-workbench`: controls directly manipulate one dominant model.
- `typographic-statement`: one short proposition and a supporting mark own the field.
- `layered-reveal`: successive states expose hidden structure without changing the core object.

Translate primitives through the subject. Give families topic-derived names and spatial logic, not
generic template names. Keep one carrier dominant when combining primitives. Avoid deriving
several families from the same top-title / middle-content / bottom-controls skeleton.

Across the catalog use varied primaries and unique primary/secondary signatures.
Support only page types that the supplied learning request can genuinely use. The available types
are `formula-derivation`, `sim-explorable`, `code-runnable`, `quiz-check`, `worked-example`,
`section-break`, and `narrative-scene`; they are a vocabulary, not a coverage checklist. Never add
a composition merely to represent a type. Include `code-runnable` only when writing, running, or
debugging code is itself a learning objective in the request. Include `sim-explorable` only when
manipulating meaningful variables or state reveals something the learner is meant to understand.
Make `use_when`, `spatial_logic`, `dominant_carrier`, `text_role`, `variation`, and `avoid` concrete
enough that a Planner can match a claim to a family and a Builder can recognize when a page
falsifies it. In `spatial_logic`, state approximate canvas shares or proportions for the dominant
carrier and supporting regions. In `text_role`, state how many text regions the family can support
and how they yield visually to the carrier. These are composition-specific design guides, not
validation thresholds.

## Author the Builder-facing Skill body

Write the body as direct instructions to independent Builders. Keep it self-contained; Builders
will not receive this meta-Skill or private reasoning. Define shared visual law without duplicating
the composition catalog, prescribing exact page layouts, or including page copy.

Use these sections with concrete decisions:

### Visual thesis

State in one sentence how the subject becomes a visual world. Name the tension, rhythm, material,
or point of view that unifies the deck.

### Identity

Specify typographic voice, weights, scale contrast, material qualities, line behavior, edge
treatment, depth, and texture. Choose `font-display`, `font-body`, and `font-mono` by exact ID from
the installed offline catalog supplied below this Skill. Use the display role for headings and
short typographic carriers, the body role for sustained reading, and mono only for code or
tabular/computed material. For a Chinese lecture, choose a `zh-Hans` body; a Latin-only display may
still lead Latin text while Chinese glyphs fall back to the selected body. Explain what carries
authority and what feels provisional, active, historical, computed, or observed when those
distinctions matter.

### Spatial grammar

Define outer breathing room, alignment logic, density, focal scale, reading order, and the
relationship between text and dominant evidence. Require one clear visual carrier instead of
generic cards or dashboard chrome. State reusable principles, not a fixed grid.

### Scale and spacing recipe

Give Builders a compact, directly executable scale for this specific visual system on a 1280×720
canvas. Include recommended CSS-pixel ranges for display statements, ordinary titles, body text,
captions/annotations, outer margins, major gaps, and minor gaps. State how much of the canvas the
dominant carrier normally owns and when the recipe intentionally becomes denser or sparser. Choose
values that make the intended hierarchy visible; a ratio alone is insufficient because a tiny
title and tiny body can satisfy the same ratio. Treat all values as design guidance rather than
hard acceptance rules, and do not reuse one universal scale across unrelated aesthetics.

### Component grammar

Define how this visual system constructs its recurring parts: evidence images and crops, charts or
diagrams, quotations/documents, labels and captions, panels or grouping surfaces, borders, corner
treatment, background fields, and any subject-relevant control surface. Specify which treatments
are dominant, supporting, or forbidden; how much area an authentic image should receive when it is
the carrier; and how to avoid thumbnail galleries, dashboard cards, and equal-weight clutter.
Describe a coherent component language, not page-specific HTML or a compulsory component count.

### Semantic encoding

Assign stable meanings to the smallest useful set of colors, shapes, line styles, scale changes,
or motion behaviors. Keep meanings invariant where ambiguity would harm interpretation.

### Recurring motif

Choose one subject-derived object, trace, geometry, or material gesture. Explain how it evolves
when the argument advances, reverses, accumulates evidence, or returns to an earlier idea. Keep it
flexible across page types.

### Media treatment

Unify photographs, historical artifacts, illustrations, diagrams, charts, equations, quotations,
and code without falsifying evidence. Describe treatment only; never allocate tools or providers.
When the subject materially involves identifiable people, documents, places, objects, artworks, or
events, include at least one composition capable of making authentic evidence the dominant carrier
when that evidence would strengthen the argument. Do not substitute a recurring abstract motif for
all available subject evidence. This is a composition decision, not a required media count.

Preserve these boundaries:

- Use identifiable people, documents, places, and historical events only when a Builder has an
  assigned evidence-search capability.
- Use generated imagery only when already assigned and only for clearly non-documentary editorial
  illustration; never fabricate recognizable historical evidence.
- Without an assigned media capability, require no remote asset, invented local path, or
  placeholder.
- Crop, frame, label, or annotate evidence only when its meaning remains intact.

### Motion and interaction

Define a small vocabulary of information-bearing actions such as trace, reveal, isolate, reorder,
compare, accumulate, or return. Tie each action to a semantic state change. Keep content static
when action adds no learning value.

### Continuity and controlled variation

List invariants that make blurred pages recognizable as one deck. Then define limited variation
for the narrative scenes, worked examples, chapter transitions, synthesis, and any other page types
actually justified by the request. Discuss code or simulation variation only when that learning
mode is genuinely relevant. Repeat the decision system, not one composition.

### Page contract

Require every Builder to:

- Build one self-contained 1280×720 HTML fragment with exactly one `data-notale-page` root.
- Use injected `--notale-font-display`, `--notale-font-body`, `--notale-font-mono`, and color
  `--notale-*` tokens; never redefine reserved tokens, and never reference a `--notale-*` token
  that is not declared — the declared color roles are `bg`, `surface`, `ink`, `muted`, `accent`,
  `accent-2`, `accent-3`, and `line`.
- Stay fully offline: no CDN, remote font, remote image, fetch, remote import, placeholder asset,
  or undeclared third-party global.
- Make interaction project state from a real algorithm, equation, rule, dataset, or state machine.
- Treat assigned tools as a hard capability boundary.
- Keep visible content limited to subject knowledge and learning feedback; expose no page numbers,
  Skill names, implementation instructions, or Agent work records.

### Avoid

Ban failure modes specific to this subject plus generic presentation furniture, irrelevant
decoration, ambiguous color reuse, motif overuse, style drift, and effects that weaken credibility.

## Define executable tokens

Choose literal CSS-compatible color values and exact installed font IDs. Build the body's semantic
color encoding only on the declared tokens, and write the token name next to every color role the
body mentions (e.g. 暗朱红 `--notale-accent`) — never describe a semantic color that has no
corresponding token. Give all three accents stable semantic meanings in the body. Ensure primary
ink reaches at least 4.5:1 contrast against both the
dominant field and embedded surface. Never invent a font name or return a CSS font stack. Never use
braces, semicolons, angle brackets, `url()`, remote fonts, CSS declarations, or variable names in
token values.

## Preflight once

Before returning the structured response, verify that:

- The thesis, motif, grammar, and family names are unmistakably derived from the topic.
- Decisions are executable rather than mood-board adjectives.
- The body includes a concrete 1280×720 scale/spacing recipe and component grammar whose values and
  treatments visibly express this run's design rather than a universal template.
- Independent Builders will produce coherence without repeating one layout.
- Families differ in carrier, reading path, and balance, cover the justified page types, and obey
  the schema without manufacturing a learning mode for coverage.
- The body contains no page copy, exact layout, HTML, hidden dependency, or tool allocation.
- Media boundaries and the immutable page contract remain intact.
- Font roles are chosen from the supplied catalog, suit the lecture language, and have visibly
  distinct jobs without sacrificing body readability.
- Tokens are safe, semantically explained, offline-compatible, and sufficiently contrasted.

Return the final design once. Do not narrate the process or wrap the JSON in Markdown.
