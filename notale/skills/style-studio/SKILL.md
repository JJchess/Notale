---
name: style-studio
description: Generate one concrete, run-local design Skill for an HTML-native lecture deck before planning its pages. Use when the root Planner must turn a topic, audience, and narrative intention into a coherent visual system that independent Builders can apply without relying on a preset style category.
---

# Style Studio

Create the design source of truth for this run. Do not select a packaged theme and do not design
individual pages. Produce a new Skill whose decisions are specific enough that many independent
Builders will create pages from the same visual world while retaining freedom to compose each page
around its own claim.

Complete this work before page planning:

1. Infer a visual thesis from the subject, audience, language, and intended learning journey.
2. Derive a coherent design grammar from meaningful structures inside the subject.
3. Write the Builder-facing Skill described below.
4. Call `style` exactly once with the Skill and its tokens.
5. Wait for the successful tool result. Only then plan the lecture in the next model turn.

## Treat the Skill as source, not decoration

The generated Skill is the source of truth. Its CSS tokens are only a small executable projection of
that source. A palette cannot carry the design by itself. The Skill must also control typography,
spatial rhythm, hierarchy, semantic encodings, recurring motifs, media treatment, interaction, and
the boundary between continuity and variation.

Keep style and content separate:

- The Skill defines how this deck consistently makes visual decisions.
- The lecture plan defines claims, learning actions, and narrative relationships.
- Content assets provide evidence; they do not define the style merely by being present.
- Builders choose page-specific compositions after receiving both contracts.

Never put page copy, exact page layouts, HTML, page numbers, or chapter-by-chapter art direction in
the Skill. Never describe a layout template that every Builder should repeat.

## Derive rather than categorize

Start from relationships that matter in the subject: causality, conflict, sequence, uncertainty,
scale, transformation, material evidence, spatial movement, comparison, or accumulation. Convert
those relationships into visual behavior. The resulting thesis should become meaningfully wrong if
copied unchanged to an unrelated lecture.

Avoid preset labels such as "modern", "editorial", "technical", "playful", or "archival" as the
reason for a decision. Such words may summarize a result, but must never replace concrete choices.
Do not combine recognizable styles merely for variety. Build one system with controlled range.

When references are present, extract relationships rather than copying surfaces: palette balance,
type hierarchy, geometry, spacing rhythm, image handling, material qualities, and motion logic.
Never copy their text, branding, lesson-specific imagery, or signature composition.

## Author the concrete Builder Skill

Give it a short topic-derived slug and a one-sentence description. Write its body as direct
instructions to a Builder. Make it self-contained: the Builder will receive this body but not this
meta-Skill, private Planner reasoning, profiles, or supporting reference files.

The generated Skill specializes the Builder profile; it never replaces or weakens it. Include the
following non-negotiable page contract in the Builder-facing body, expressed concisely and without
turning it into a generic implementation tutorial:

- Build one self-contained 1280×720 HTML fragment with exactly one `data-notale-page` root.
- Use injected `--notale-*` tokens and never redefine reserved tokens.
- Keep the page fully offline. Require no CDN, remote font, remote image, fetch, remote import,
  placeholder asset, or undeclared third-party global. Choose system/local-safe font stacks only.
- Make interaction project state from a real algorithm, equation, rule, dataset, or state machine.
  Keep the page static when interaction would not improve the learning action.
- Treat the task's available tools as a hard capability boundary. Never require an unassigned tool.
- Keep visible content limited to subject knowledge and learning feedback. Never expose page numbers,
  Skill names, implementation instructions, or Agent work records.

If a design choice conflicts with this contract, change the design choice. Never reinterpret these
constraints as optional aesthetic guidance.

Use the following sections. Replace the labels with concrete decisions rather than explaining the
framework.

### Visual thesis

State in one sentence how the subject becomes a visual world. Name the tension, rhythm, material, or
point of view that unifies the deck.

### Identity

Specify the typographic voice, weights, scale contrast, material qualities, line behavior, edge
treatment, depth, and texture. Use offline-safe font stacks. Explain what carries authority and what
feels provisional, active, historical, computed, or observed when those distinctions matter.

### Spatial grammar

Define outer breathing room, alignment logic, density, focal scale, reading order, and the
relationship between text and the dominant evidence. State reusable principles, not fixed grids or
slide templates. Require one clear visual carrier rather than generic cards or dashboard chrome.

### Semantic encoding

Assign stable meanings to the smallest useful set of colors, shapes, line styles, scale changes, or
motion behaviors. Encoding must help interpretation, not merely decorate. Say where an encoding must
remain invariant across pages.

### Recurring motif

Choose one subject-derived object, trace, geometry, or material gesture. Explain how it can recur and
evolve when the argument advances, reverses, accumulates evidence, or returns to an earlier idea.
Keep it flexible enough for different page types.

### Media treatment

Explain how photographs, historical artifacts, generated illustrations, diagrams, charts,
equations, quotations, and code enter the same visual world when used. Preserve evidentiary integrity:
style may frame or annotate an artifact but must not falsify it.

Limit this section to visual treatment of media that the page task and assigned tools already make
available. Do not select, request, recommend, or assume `find_image`, `make_image`, or any provider;
tool allocation belongs to the Planner and the Builder profile. Preserve these media boundaries in
the generated Skill:

- Identifiable people, documents, places, and historical events may use only an assigned
  `find_image` capability.
- `make_image` may be used only when already assigned and only for clearly non-documentary editorial
  illustration; it must not fabricate recognizable historical evidence.
- Without an assigned media tool, use no remote asset, invented local path, or placeholder.
- Styling may crop, frame, label, or annotate evidence only when its meaning remains intact.

### Motion and interaction

Define a small vocabulary of information-bearing actions such as trace, reveal, isolate, reorder,
compare, accumulate, or return. Tie each action to a semantic change. Require the interface to
project the state of a real algorithm, equation, rule, dataset, or state machine. Static content
should remain static when action adds no learning value.

### Continuity and controlled variation

List the invariants that make blurred pages recognizable as one deck. Then specify the limited axes
Builders may vary for chapter transitions, narrative scenes, worked examples, code, simulations, or
synthesis. Repeat the decision system, not a single composition.

### Avoid

Ban the likely failure modes for this particular subject. Include generic presentation furniture,
irrelevant decoration, ambiguous color reuse, motif overuse, style drift, and any visual effect that
would weaken the subject's credibility.

## Define executable tokens

Submit exactly these required string tokens, with optional `mono`:

- `bg`: dominant deck field
- `surface`: contrasting embedded surface
- `ink`: primary text and high-authority marks
- `muted`: secondary text and low-emphasis marks
- `accent`: primary semantic emphasis
- `accent-2`: distinct secondary semantic emphasis
- `line`: dividers, axes, and structural strokes
- `font`: offline-safe body/display CSS font stack
- `mono`: optional offline-safe code/data CSS font stack

Use literal CSS-compatible values. Do not include braces, semicolons, angle brackets, `url()`, remote
fonts, CSS declarations, or variable names. Keep contrast usable on the dominant field. The body must
explain what the accents mean; tokens without semantics are incomplete.

## Preflight the Skill

Before calling `style`, verify all of the following:

- It is clearly derived from this topic and audience.
- It gives Builders decisions they can execute, not mood-board adjectives.
- It establishes both invariants and meaningful variation.
- It contains no exact page layout, page copy, HTML, or hidden dependency.
- It includes the immutable Builder page contract and does not weaken any role constraint.
- Its motif and encodings carry meaning across the whole narrative.
- Its media section describes treatment only, never allocates tools or providers.
- Its token values are complete, safe, offline-compatible, and consistent with the prose.
- It would produce coherence even if every page were built independently.

If any check fails, revise the Skill before submission. A successful `style` result fixes the design
contract for the run; do not create a second style or silently replace it during planning.
