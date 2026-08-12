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

Create exactly 5–7 structurally distinct, topic-specific families for a 1280×720 canvas. Each family must
define its dominant visual carrier, reading path, spatial balance, and supporting role for text.
Changing only color, font, texture, ornament, or motif does not create a new family.

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

Across the catalog use at least four different primaries and unique primary/secondary signatures.
Collectively support all page types: `formula-derivation`, `sim-explorable`, `code-runnable`,
`quiz-check`, `worked-example`, `section-break`, and `narrative-scene`. Make `use_when`,
`spatial_logic`, `dominant_carrier`, `text_role`, `variation`, and `avoid` concrete enough that a
Planner can match a claim to a family and a Builder can recognize when a page falsifies it.

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
treatment, depth, and texture. Use offline-safe system font stacks. Explain what carries authority
and what feels provisional, active, historical, computed, or observed when those distinctions
matter.

### Spatial grammar

Define outer breathing room, alignment logic, density, focal scale, reading order, and the
relationship between text and dominant evidence. Require one clear visual carrier instead of
generic cards or dashboard chrome. State reusable principles, not a fixed grid.

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
for chapter transitions, narrative scenes, worked examples, code, simulations, and synthesis.
Repeat the decision system, not one composition.

### Page contract

Require every Builder to:

- Build one self-contained 1280×720 HTML fragment with exactly one `data-notale-page` root.
- Use injected `--notale-*` tokens and never redefine reserved tokens.
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

Choose literal CSS-compatible values. Use offline-safe font stacks. Give both accents stable
semantic meanings in the body. Ensure primary ink reaches at least 4.5:1 contrast against both the
dominant field and embedded surface. Never use braces, semicolons, angle brackets, `url()`, remote
fonts, CSS declarations, or variable names in token values.

## Preflight once

Before returning the structured response, verify that:

- The thesis, motif, grammar, and family names are unmistakably derived from the topic.
- Decisions are executable rather than mood-board adjectives.
- Independent Builders will produce coherence without repeating one layout.
- Families differ in carrier, reading path, and balance, cover every page type, and obey the schema.
- The body contains no page copy, exact layout, HTML, hidden dependency, or tool allocation.
- Media boundaries and the immutable page contract remain intact.
- Tokens are safe, semantically explained, offline-compatible, and sufficiently contrasted.

Return the final design once. Do not narrate the process or wrap the JSON in Markdown.
