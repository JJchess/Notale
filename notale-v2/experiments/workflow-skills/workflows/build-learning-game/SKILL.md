---
name: build-learning-game
description: "Turn one learning objective into a compact, playful, rule-driven learning game on a Notale lecture page with persistent world state, consequential choices, immediate evidence-based feedback, a meaningful completion condition, deterministic replay/reset, and accessible controls. Use for resource trade-offs, route building, spatial challenges, construction, systems, or small simulations where actions change the next decision. Do not use for conventional quizzes, flashcards, independent classification questions, or matching exercises whose world does not change."
---

# Build Learning Game

Build one playable learning loop, not a collection of mini-features. Make the rule system carry the concept and let the learner see why an action worked.

## 1. Pass the game—not quiz—gate

A learning game must have this loop:

> Observe a world → act on it → see a rule-driven consequence → adapt the next action.

Reject `read prompt → choose answer/category → reveal explanation → next prompt`. That is a quiz even when it has cards, points, animation, a progress bar, or a playful theme.

Require all four:

- state persists across actions;
- at least one action changes what is possible or desirable next;
- success or failure emerges from the rule model rather than an answer key;
- replay supports a different strategy, path, or outcome.

Classification or matching may appear only as a subordinate action inside a changing system—for example, sorting cargo changes vehicle balance and the remaining route. If the category judgment is the whole loop, route it to a quiz or ordinary interaction instead.

## 2. Reduce the objective to one loop

Write one private sentence:

> The learner **uses one core verb** on **one model** to discover or demonstrate **one result**.

Then define:

- the learning objective and misconception the game exposes;
- the initial state and information visible before play;
- the allowed and invalid actions;
- the rule that maps actions to consequences;
- the evidence shown after every meaningful action;
- the completion or failure condition;
- the result explanation and exact replay/reset behavior.

Remove currencies, collectibles, timers, levels, lives, and scores unless the learning model makes them meaningful. Do not reward clicking alone.

## 3. Choose a mechanic from the concept

- Use allocation or trade-offs when constrained resources and consequences are the lesson.
- Use route or network building when connectivity and cost are the lesson.
- Use spatial placement, construction, steering, timing, or collection when position and sequence change the world.
- Use prediction only when the revealed result updates a persistent model and forces a follow-up choice.
- Use direct manipulation or a small simulation when changing variables reveals causal behavior.

Prefer native HTML and semantic DOM for controls and discrete pieces, SVG for precise relationships, and Canvas for a dense live model. Keep instructions, status, controls, and result text in HTML regardless of visual medium.

Read [game-model-recipes.md](references/game-model-recipes.md) only when implementing deterministic state transitions, seeded variation, timed play, or a host-observable state event.

## 4. Implement the model before the presentation

1. Create a fresh initial-state factory and a serializable canonical state.
2. Route every action through one transition function. Keep validation and scoring in the model, not scattered across click handlers.
3. Derive legal moves, feedback, completion, score if justified, and result metrics from actual rules.
4. Reject invalid actions without corrupting state and explain the relevant rule.
5. Keep randomness seeded and resettable. Use a fixed arrangement when variation adds no learning value.
6. Render the whole current state from the model. Never let CSS classes or canvas pixels become the only record of progress.
7. Keep only the short action trace needed to explain the result; avoid unbounded history.

## 5. Build the teaching feedback loop

For each action, show three things together:

1. what changed in the model;
2. why the rule produced that consequence;
3. what the learner can do next.

Use local feedback near the changed object plus one restrained textual status. Separate selection from correctness and do not rely on red/green alone. Delay the final explanation until the learner has acted, but keep enough context visible to make an informed move.

End clearly. Freeze or disable only the actions that no longer apply, show the evidence behind the result, and offer Replay or Reset in the same region. If failure is possible, make it informative and immediately recoverable.

## 6. Add game feel without faking a game

- Give the player a visible avatar, tool, object, map, board, or world state to act on—not only answer buttons.
- Use anticipation, motion, sound only when opted in, spatial response, and a satisfying settle to make consequences feel tangible.
- Keep the core action understandable within 15 seconds and the first consequence visible within one or two actions.
- Create tension from the learning rule: limited space, time, energy, stability, route cost, competing needs, or changing conditions.
- Avoid badges, confetti, lives, and arbitrary points as substitutes for agency. Polish strengthens a game loop; it cannot create one.

## 7. Make play accessible and robust

- Use visible buttons and labeled controls; keep focus order and `:focus-visible` intact.
- Provide keyboard and touch paths to every rule-relevant action. Pair drag/drop with select-and-place, arrow/button, or other non-drag controls.
- Use Pointer Events, pointer capture, cancellation, `.no-pan` only on the drag surface, and `Deck.pt()` for scaled-stage coordinates.
- Announce concise progress and completion through `aria-live="polite"`; do not narrate every visual tick.
- Under reduced motion, apply actions instantly or step between stable states while preserving every rule, consequence, and completion path.
- Use readable text for instructions and results; do not bake UI or game state into imagery.

## 8. Make replay exact and cleanup final

On reset or replay, cancel timers, animation, pointer ownership, and pending callbacks before replacing state with a fresh factory result. Restore the same seeded arrangement, initial instructions, enabled controls, and a predictable focus target. Repeat play without duplicated listeners or accelerated timers.

Collect listener removal, observers, timers, animation frames, `Deck.loop()` stops, audio, and graphics disposal in one idempotent cleanup routine. Invoke it on page teardown and before re-initialization.

## Deliverable contract

- Modify only the assigned page file unless the task explicitly grants other files.
- Preserve `#stage`, page metadata, and shared asset interfaces; use only available local libraries.
- Keep the objective, rules, canonical state, transition logic, rendering, feedback, completion, replay/reset, and cleanup together in page-owned code.
- Provide a visible Replay or Reset action and an explicit textual result.
- Do not invent exact scientific metrics, probabilities, or scores; use only supplied data or transparent model-derived values.
- Report the core verb, rule model, completion condition, input alternatives, reset behavior, and checks actually run.

## Minimal runtime smoke

1. Open the initial state and confirm that the objective, allowed action, model, and current status are visible.
2. Confirm the first action changes the world and creates a non-trivial next decision; if it only advances to another prompt, reject the concept as a quiz.
3. Perform one valid action and confirm model state, visual evidence, and textual feedback change together.
4. Perform an invalid or boundary action and confirm state remains valid with useful guidance.
5. Reach completion through one full play path and confirm the result follows from the trace or metrics, not an answer key.
6. Replay with a different strategy and confirm the path or outcome can differ while rules stay stable.
7. Replay or reset, repeat the first action, and confirm the same initial state and deterministic outcome.
8. Exercise keyboard/non-drag and touch/pointer paths where applicable; trigger controls rapidly and confirm no duplicated work.
9. Run the available page `Check` for initial, progress, completion, and reset states; require zero JavaScript errors and zero failed resources. Fix runtime, clipping, and unreachable-action failures. Leave fun, visual finish, and teaching quality to human acceptance rather than synthetic aesthetic gates.
