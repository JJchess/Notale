---
name: design-motion
description: "Plan and implement purposeful motion for a Notale lecture page when change over time, continuity, sequencing, or action feedback carries the teaching point. Use for staged explanations, state transitions, animated diagrams, playback controls, or coordinated timelines; include a meaningful still state, deterministic replay and reset, reduced-motion behavior, and lifecycle cleanup. Do not use merely to decorate every section or to design the underlying learning interaction."
---

# Design Motion

Use motion to explain one change, preserve one relationship, or confirm one learner action. Design the page's still states first; motion connects those states and must never be the only carrier of meaning.

## Reference routing

Before any page mutation, including `Write`, `Edit`, `Patch`, or a modifying `Bash` command, select one motion engine and read [motion-engine-recipes.md](references/motion-engine-recipes.md). Read only the section for CSS, Web Animations API, GSAP, Canvas, or Lottie that matches the selected engine. Do not load another engine recipe or unrelated references.

## 1. Define the motion claim

1. Read the page specification, shared contract, `CHASSIS.md`, and available library list.
2. Write one private sentence: “Motion shows **what changes**, from **state A** to **state B**, so the learner can infer **C**.”
3. Identify the primary moving subject, the evidence that must remain readable, and the final state worth pausing on.
4. Decide whether motion starts on load, by explicit learner action, or after a state change. Prefer explicit playback for explanatory sequences longer than a brief transition.
5. Delete motions that do not explain hierarchy, causality, continuity, progress, or feedback.

## 2. Storyboard stable states

Define named beats before writing animation code:

- `ready`: all controls and the starting model are legible.
- `focus`: the relevant subject is identified without hiding context.
- `change`: one transformation or causal step occurs.
- `evidence`: values, paths, annotations, or comparisons reveal the consequence.
- `settled`: the explanatory end state remains readable until replay or reset.

Use only the beats needed. Give each beat observable visual and textual state. Make replay return through `ready`; do not reverse a destructive simulation and assume it equals reset.

## 3. Select one engine

- Use CSS transitions for hover, press, selection, and simple two-state changes.
- Use the Web Animations API for a small controllable sequence without an existing motion dependency.
- Use GSAP only when it is already available and multiple elements require labels, overlap, seeking, or coordinated cancellation.
- Use `Deck.loop()` for Canvas or continuously computed diagrams; retain its stop function and choose an informative reduced-motion still.
- Use Lottie only when a suitable authored asset already exists and the animation is illustrative rather than the live data model.
- Avoid adding an external library for one transition. Do not mix engines for the same sequence.

## 4. Choreograph the explanation

1. Animate the primary subject first; introduce supporting labels or traces at the beat where they become useful.
2. Keep the context stable enough to compare before and after. Prefer transforms and opacity over layout-changing properties.
3. Use a small shared motion vocabulary: one quick feedback duration, one state-transition duration, one explanatory duration, and one or two easing curves.
4. Keep labels attached to the object or value they explain. Update textual evidence at the same semantic beat as the visual change.
5. Freeze at `settled`; do not loop a teaching sequence forever. Reserve continuous loops for a process whose continuity is itself meaningful.
6. Make Play/Pause, Step, Replay, or Reset visible when the learner needs control. Route every control through one timeline/controller state.

## 5. Preserve all access paths

- Keep the initial and final states understandable without animation.
- Under `prefers-reduced-motion`, jump between named states or use a short opacity change; retain controls, sequence order, evidence, and completion.
- Provide a textual status or step label when timing communicates progression.
- Keep focus visible and avoid automatically moving focus as beats advance.
- Never flash rapidly, create unbounded parallax, or make essential text move while it must be read.
- Give touch and keyboard users the same playback and replay controls as pointer users.

## 6. Make replay deterministic and cleanup complete

Create one controller that owns animations, timers, observers, and listeners. Before Play or Replay, cancel the previous run, restore canonical state, apply the exact ready frame, then start once. Ignore or deliberately restart rapid duplicate commands; never stack timelines.

Pause hidden work, avoid a large time delta after resume, and destroy every timeline, animation, observer, listener, loop, and temporary graphics resource on teardown. Prefer the chassis lifecycle helpers instead of a second global loop.

## Deliverable contract

- Modify only the assigned page file unless the task explicitly grants other files.
- Preserve `#stage`, page metadata, and shared asset interfaces; use only libraries already exposed by the chassis.
- Keep named states, controller actions, textual evidence, reduced-motion behavior, deterministic replay/reset, and cleanup in page-owned code.
- Leave the page in a complete, informative state when animation is unavailable.
- Report the motion claim, trigger, engine, reduced-motion behavior, replay/reset behavior, and checks actually run.

## Minimal runtime smoke

1. Open the page and confirm `ready` is informative before playback.
2. Run one complete sequence and confirm each named beat appears once, in order, with synchronized visual and textual evidence.
3. Pause or step where offered, then replay; confirm the second run begins from the same ready state and ends identically.
4. Activate controls rapidly and confirm that no duplicate loop, timer, or timeline survives.
5. Exercise reduced motion and confirm an informative still or instant state sequence, not missing content.
6. Run the available page `Check` at `ready`, one changing beat, and `settled`; require zero JavaScript errors, failed resources, clipping, overflow, and unreachable text at every beat.
7. If any Render report contains a failure marker, keep editing and Render again until the report is clean. Leave aesthetic and pedagogical judgment to human review rather than synthetic visual thresholds.
