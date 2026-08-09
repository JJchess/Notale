# Notale Page Composition

Compose exactly one 1280×720 HTML-native lecture page. Treat this entrypoint as a page-level visual
reasoning system, not a miniature deck workflow. Do not ask the user questions, generate style
previews, build navigation, wrap the fragment in a 1920×1080 deck, deploy it, or export it.

## Respect ownership

- Preserve `PageContext.visualContract`, plus `page.terminology` and `page.notation`. Translate those
  global decisions into this page without replacing them with a new theme or redefining reserved
  `--notale-*` variables.
- Preserve the one `page.claim` and design for `page.learningAction`. Use `narrative` to make the page
  fulfill its role in the whole deck, but do not expose learning actions, page IDs, link relations,
  planning cues, source IDs, or design rationale as visible copy.
- Let the Builder choose the final title, subtitle if genuinely needed, visual subject, composition,
  proportions, media treatment, and controls. The Planner owns sequence and global continuity, not
  the layout of this page.
- Use `sources` and their guardrails as the factual boundary. Composition may clarify evidence; it must not
  create a new subject-matter claim.
- Use this entrypoint for presentation and composition only. When a simulation, evaluator, algorithm,
  equation, state machine, or code runtime is assigned, let that executable model own instructional
  state and render its output. Never substitute staged DOM changes for a real model.

## Derive the composition from the idea

Before writing HTML, silently reduce the page to four decisions:

1. State the exact proposition the learner should be able to see by the end of the page.
2. Identify the visible evidence that makes the proposition believable: a contrast, transformation,
   trace, mechanism, hierarchy, annotated artifact, code/result correspondence, or decision.
3. Choose one dominant visual anchor that carries that evidence. Give it enough area to be read at a
   glance; do not distribute importance evenly across many boxes.
4. Arrange supporting text, labels, and controls around the anchor according to their relationship to
   it. Remove anything that does not help the assigned learning action.

Do not select a layout merely because the page is called a worked example, section break, simulation,
or assessment. Select a spatial grammar from the content relationship:

- For **comparison or misconception**, create an unequal split, shared baseline, overlay, or aligned
  before/after field so differences can be scanned without rereading prose.
- For **sequence or algorithmic trace**, use one continuous path, strip, timeline, or state field with
  a clear direction. Keep the current transition visually dominant; avoid one card per step.
- For **mechanism or causality**, center the mechanism and place inputs, forces, dependencies, or
  consequences along meaningful axes or links.
- For **transformation**, make source and result share coordinates where possible. Use motion,
  morphing, annotation, or a restrained before/after boundary to reveal what changed and what stayed
  invariant.
- For **hierarchy or decomposition**, use scale, containment, indentation, or a tree whose geometry
  expresses ownership. Do not fake hierarchy with a uniform grid.
- For **argument, proof, or evidence**, give the claim and decisive evidence different visual weight;
  connect premises to the exact conclusion they support.
- For **code and output**, make code, execution state, and result form one reading path. Highlight the
  line or expression responsible for the visible state instead of presenting an ornamental editor.
- For a **section threshold**, use a strong typographic or symbolic field with one memorable image or
  diagrammatic gesture. Do not fill the empty space with summary cards.

Combine grammars only when the central proposition truly contains both relationships. Prefer one
clear composition over a comprehensive dashboard.

## Build the fixed stage

- Return one fragment with a single semantic page root marked `data-notale-page`. Size it to
  `width: 1280px; height: 720px`,
  position it relative, and contain all page-owned visuals inside it. Do not emit document shell tags.
- Design at the final size. Use deliberate outer margins, usually 52–80px, and reserve breathing room
  around the dominant anchor. Do not rely on scrolling, hover, or browser reflow to reveal required
  content.
- Establish a decisive hierarchy. A useful default range is 42–68px for the main title, 22–32px for
  important explanatory text, and at least 18px for labels and controls. Depart from it only when the
  composition provides equally legible scale.
- Use no more than two text families already available offline. Select serif, sans, display, or
  monospace roles from the global art direction; never fetch fonts. Use weight, width, case, and
  spacing intentionally instead of decorating every label.
- Apply the provided `--notale-*` variables when available and derive page-local variables from them.
  Commit to a dominant background/foreground relationship and one controlled accent. Avoid timid
  rainbow distribution and automatic purple-on-white gradients.
- Preserve readable contrast for all essential text, data, focus indicators, and controls. Muted text
  must remain readable, not merely aesthetic.
- Use depth sparingly through overlap, scale, line weight, texture, or shadow. Prefer two or three
  meaningful planes over a collection of floating cards.
- Make alignment visibly intentional. Asymmetry is welcome when it expresses emphasis, but edges,
  baselines, axes, and connector endpoints must still resolve cleanly.

## Design the anchor, annotations, and copy

- Let the anchor occupy roughly one third to two thirds of the usable stage unless the page is
  deliberately typographic. A diagram, dataset, equation, code trace, historical artifact, or model
  state should look like the subject, not like a thumbnail inside a generic component.
- Prefer labels attached directly to the relevant mark, region, line, or state. Use legends only when
  direct annotation would create more clutter.
- Turn prose into spatial evidence: short claims, precise annotations, equations, contrasts, and
  captions. Keep a paragraph only when its syntax is itself necessary to understand the idea.
- Write a title that advances the proposition. Avoid generic labels such as “Overview”, “Key Points”,
  “Interactive Demo”, or text that only repeats the course topic.
- Omit subtitles, eyebrows, chips, badges, and instructional microcopy unless each carries information
  that cannot be expressed by hierarchy or placement.
- Prefer honest native shapes, SVG, Canvas, local media, or typographic composition. Do not use emoji
  as interface icons or fabricate documentary imagery with CSS.

## Integrate interaction without weakening the page

- Start in a meaningful, fully rendered state that already communicates the setup and gives the
  learner something to inspect. Never make the first frame blank or hide all essential content behind
  `opacity: 0` entrance animations.
- Add controls only when changing an input, choice, trace position, or execution state reveals new
  evidence for the learning action. A decorative toggle or “next” button is not an interaction.
- Place controls near the state they affect and make the consequence visible in the same reading path.
  Keep bounded deterministic defaults and include a clear reset only when exploration can leave the
  learner in a confusing state.
- Render domain-model output into DOM, SVG, or Canvas. Event handlers may submit inputs/actions or
  move a trace cursor; they may not hand-author educational outcomes.
- Keep keyboard focus visible and use semantic buttons, inputs, labels, and status text. Do not encode
  the only distinction by color.

## Use motion as explanation

- Prefer a complete static first frame. Use motion to expose a transition, dependency, ordering, or
  state change—not to compensate for an unstructured layout.
- Keep one coordinated motion idea. Use CSS, Web Animations API, or native `requestAnimationFrame`
  only; do not assume third-party globals unless another assigned skill explicitly supplies them.
- Avoid long decorative entrances, looping ambient motion behind text, and staggered reveals that
  delay comprehension. Essential content must remain visible when animation is disabled.
- Implement `prefers-reduced-motion` by removing nonessential motion and preserving the same final
  information state.

## Reject generic page patterns

Do not produce a dashboard, card wall, equal three-column feature grid, KPI strip, glassmorphism
template, repeated rounded rectangles, or title-plus-bullets layout unless the content relationship
itself requires that exact structure. Do not surround every sentence, equation, or step with a panel.
Avoid excessive pills, icons, gradients, borders, drop shadows, and labels. Distinctiveness should
come from the subject, spatial argument, typography, and global art direction—not decorative volume.

## Preflight before writing

Inspect the planned fragment at 1280×720 and correct it before `page_write`:

- Confirm one proposition, one dominant anchor, and one obvious reading path.
- Confirm every required element fits without clipping or scroll and no dense text block becomes tiny.
- Confirm the first frame is meaningful with animation paused and all essential content visible.
- Confirm contrast, focus, direct annotations, connector endpoints, and control/state proximity remain
  legible against the resolved background.
- Confirm there are no remote assets, imports, unavailable globals, document shell tags, placeholders,
  or deck-level navigation/export behaviors.
- Confirm any teaching interaction projects the output of its assigned executable model.

Then write the single fragment and follow the core Builder check-and-submit workflow.
