# Authored Cover Motion

Authored change over time must establish the subject or produce the title frame. Design the still composition, visual material, title behavior, timeline, reduced-motion state, and lifecycle as one sequence.

## Establish the visual world

Before storyboarding, choose:

- one concrete protagonist or governing spatial event;
- one subject-derived material and shape vocabulary;
- one quiet title field and one focal anchor that survive every key state;
- theme roles for field, structure, protagonist, evidence, and exception;
- one primary motion verb that makes the topic recognizable.

Construct recognizable silhouettes and functional parts before adding particles or effects. Use background, middle ground, and foreground only when each layer has a different spatial or temporal role. Repetition, hatching, traces, or generated texture must describe the material; glow, blur, grain, and parallax cannot be the visual premise.

## Design states before animation

Storyboard three to five key states:

1. **Setup:** an unresolved gap, imbalance, hidden relationship, or incomplete process.
2. **Commit:** the visual system begins one unmistakable action.
3. **Transformation:** the subject-defining change becomes visible.
4. **Payoff:** the action resolves into the representative title frame.
5. **Hold:** the resolved frame remains readable long enough to become the cover.

Not every sequence needs all five drawings, but it must have a setup and payoff. A zoom that ends without revealing a concrete informational anchor is decorative; remove it.

For every key state, mark:

- protagonist bounds;
- title safe region;
- gaze or motion direction;
- elements entering, leaving, or becoming subordinate;
- the frame that reduced motion will show.

Approve the key states as still compositions before interpolating between them.

## Give motion a visual grammar

Use one primary motion verb: assemble, unfold, trace, compress, collide, orbit, disperse, focus, reveal. Secondary motion may support it but must not create a competing event.

Shape important movement as:

- **anticipation:** a small cue that establishes direction or stored energy;
- **action:** the shortest readable path through the meaningful change;
- **follow-through:** a restrained settling response;
- **hold:** a stable result rather than perpetual idle motion.

Choose easing from the physical or semantic behavior. Mechanical locking, elastic material, floating matter, and camera movement should not share the same easing curve.

## Separate visual and title tracks

Treat the subject system and title as coordinated tracks rather than one animation list.

- The subject track creates the opening gap and closes it.
- The title track enters when its field is stable enough to read.
- If the title is visible throughout, keep moving detail out of its field.
- Do not animate every line of text separately unless the reading order itself is the concept.
- Hold the final title state; do not immediately loop back through the payoff.

When a loop is requested, find a quiet reset point. The loop boundary must not erase the title before it has been read or create a visible jump in the governing system.

## Implement named states

Represent the sequence with named states or timeline labels. Do not scatter unrelated timeouts through event handlers.

For a short DOM/SVG sequence, cancel before replaying:

```js
let active = [];

function playCover() {
  active.forEach(animation => animation.cancel());
  active = [
    subject.animate(subjectFrames, subjectTiming),
    title.animate(titleFrames, titleTiming)
  ];
}

function settleCover() {
  active.forEach(animation => animation.cancel());
  active = [];
  root.dataset.coverState = 'settled';
}
```

Use CSS transitions for a small state change, WAAPI for a few coordinated DOM/SVG tracks, and a timeline library only when labels, overlap, seeking, or replay synchronization materially reduce complexity. Canvas and p5 sequences should derive their phase from one clock or state machine.

When GSAP is already available, build one owned timeline with defaults and labels matching the storyboard states. Use its position parameter for overlap instead of distributing `delay` values across tweens. Keep the subject and title as coordinated child timelines only when nesting makes ownership clearer. Before replay or teardown, `kill()` the owned timeline and reconstruct the named start state; do not leave completion callbacks from an earlier run able to win later.

For any implementation, preserve one authoritative playhead and state label. DOM classes, partially interpolated transforms, and timer completion are views of that state, not its source of truth.

## Preserve the still

Reduced motion is a designed state, not an animation with a shorter duration.

- Render the representative title frame immediately.
- Preserve the subject cue and completed relationship.
- Remove ambient drift, parallax, camera travel, and repeated entrances.
- Keep replay optional; never require motion to reveal the title.

Pause nonessential loops while the document is hidden. On resize, either preserve normalized progress or settle and reconstruct the representative frame; do not leave half-interpolated geometry.

## Diagnose weak motion

| Failure | Cause | Repair |
|---|---|---|
| Motion wallpaper | Elements move but no relationship changes | Name one setup and one payoff or return to a still |
| Endless intro | No hold was budgeted | Shorten the action and protect a readable final state |
| Naked zoom | Scale changes without a destination | End on a concrete subject cue or delete the camera move |
| Equal activity | Every layer moves at similar speed and contrast | Assign one primary motion and quiet the rest |
| Title collision | The visual track ignores the title field | Reserve the field in every key state, not only the final frame |
| Replay stacking | Timers or animations accumulate | Cancel active work and restore the named initial state before replay |
| Reduced-motion blank | Meaning exists only during interpolation | Design and render the payoff as a complete still |

## Verify the sequence

- Inspect setup, transformation, payoff, hold, and reduced-motion states as stills.
- Confirm the primary motion verb is recognizable without narration.
- Confirm the title remains readable for a stable interval.
- Replay rapidly and verify that tracks do not stack or finish out of order.
- Resize during or after playback and verify the title field and focal anchor.
- Confirm teardown stops timelines, animation frames, observers, and listeners.
- Confirm the final frame remains a strong cover at thumbnail size and in grayscale, independent of animation memory.
