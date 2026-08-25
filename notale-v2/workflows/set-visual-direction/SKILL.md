---
name: set-visual-direction
description: "Define and apply a subject-specific visual world for a Notale interactive lecture. Use when choosing or repairing the palette, materials, image treatment, signature motif, surface language, and shared theme before composing 1600x900 projected lesson pages."
---

# Set Visual Direction

Create a visual world that helps explain the lesson. Treat the lecture subject, audience, projection conditions, and available media as the source of the design; do not turn the page into a generic product landing page.

## Reference routing

Complete this routing before any page mutation, including `Write`, `Edit`, `Patch`, or a modifying `Bash` command:

1. Read [direction-recipes.md](references/direction-recipes.md).
2. Also read [material-and-effects.md](references/material-and-effects.md) when the direction uses glass, tactile surfaces, technical frames, particles, grids, dithering, glow, or another atmospheric effect.
3. Do not load unrelated references.

## Preserve the Notale contract

- Design for one fixed `1600x900` logical stage that is scaled by the chassis and never scrolls.
- Keep `#stage`, the page contract, shared theme interfaces, semantic colors, and supplied assets intact.
- Optimize for a classroom projector: make the hierarchy survive lower contrast, ambient light, scaling, and viewing from the back of the room.
- Keep the first frame informative. Let decoration remain behind the lesson and ignore pointer input.
- Prefer local assets and installed libraries. Do not introduce a CDN or a new framework to achieve a look.
- Preserve an existing, explicit art direction unless the task asks for a redesign.

## Workflow

### 1. Read the lesson before styling it

Extract these facts from the brief, plan, contract, page spec, and assets:

- the lesson's single claim and conceptual contrast;
- audience age, prior knowledge, and projection setting;
- physical materials, instruments, places, organisms, diagrams, or historical artifacts native to the subject;
- semantic color requirements and existing brand constraints;
- the page's primary explanatory visual and interaction;
- any real media whose lighting or palette must remain legible.

Resolve missing aesthetic details from those facts. Ask only when two directions would change the lesson's meaning; otherwise make and record a justified choice.

### 2. Write a one-sentence direction thesis

State the visual world as:

`<subject source> expressed through <material/light/geometry>, so <audience> can perceive <teaching relationship>.`

Reject a thesis made only from mood words such as “premium,” “futuristic,” or “beautiful.” Name something observable from the subject.

### 3. Commit the visual system

Define a compact direction contract before coding:

1. **Palette:** choose a background family, readable text, neutrals, and only the semantic hues the lesson needs.
2. **Material:** choose one surface logic such as paper, instrument glass, field notebook, engraved metal, specimen tray, or plain flat color.
3. **Geometry:** choose one edge/radius and line-weight family. Reuse it across panels, controls, and diagrams.
4. **Type roles:** name display, body, and optional numeric/utility roles; leave detailed shaping to `shape-typography`.
5. **Signature:** choose one memorable visual device that embodies the topic, not a decorative effect pasted over it.
6. **Media:** define crop, contrast, tint, annotation, and attribution behavior.
7. **Motion:** state what motion communicates, or explicitly choose a static direction.

### 4. Allocate visual emphasis

- Spend boldness on the explanatory visual or one signature element, not on every surface.
- Use at most one ambient background family and one material treatment.
- Keep the strongest contrast at the teaching claim, live state, or selected comparison.
- Reserve semantic colors for their concepts. Keep unrelated structure neutral.
- Keep the page in one light/dark family; permit one deliberate inversion only when it encodes a real transition.
- Remove an effect if it competes with labels, diagram edges, controls, or the lecturer's pointing target.

### 5. Implement through shared tokens

- Define `--bg`, `--text`, `--font-sans`, `--focus`, and named semantic colors in the shared theme.
- Encode roles rather than raw appearance: use names such as `--cause`, `--observed`, or `--uncertain`, not `--blue-1` when color carries meaning.
- Tune overlays against the actual imagery instead of applying a stock opacity.
- Keep shadows tinted to the surface family and quiet enough for projection.
- Make focus, selected, disabled, and reduced-motion states part of the same material language.
- Keep one-off spectacle in the page implementation; do not pollute the shared theme with a single page's effect.

### 6. Review the rendered direction

Render representative pages at `1600x900`, including the densest page and one media- or interaction-heavy page. Inspect screenshots rather than trusting CSS names.

Check that:

- the subject is recognizable after hiding the title;
- the central relationship reads before the decoration;
- foreground text and diagram lines remain clear on a dim or washed-out display;
- palette, edge logic, material, and type roles remain consistent across pages;
- no generic dark-gradient, purple-glow, glass-card, or card-grid default has replaced subject-specific reasoning;
- the still frame works with animation disabled;
- focus and selected states remain unmistakable without relying on glow alone.

Revise the direction contract first when several pages fail in the same way. Patch an individual page only when the exception is genuinely local.

## Deliverable

Return the requested artifact plus a concise direction contract containing the thesis, palette semantics, material, geometry, type roles, signature, media treatment, and motion rule. When editing a Notale build, implement the contract in the existing shared theme and page files rather than creating a parallel design system.
