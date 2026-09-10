# Motion Engine Recipes

Read only the section for the selected engine. Keep named states and the teaching sequence independent of the engine so reduced motion and reset can render them directly.

## CSS transitions

Use classes or data attributes to represent semantic states:

```css
.subject {
  transform: translateX(0);
  transition: transform 240ms cubic-bezier(.22, .8, .3, 1), opacity 180ms ease-out;
}
[data-state="settled"] .subject { transform: translateX(var(--result-x)); }
@media (prefers-reduced-motion: reduce) {
  .subject { transition-duration: 1ms; }
}
```

Toggle one state attribute in JavaScript. Listen for `transitionend` only when the next semantic beat depends on completion, and add a cancellation-safe fallback rather than treating the event as guaranteed.

For the one-time page-load entrance, stagger a shared reveal class instead of hand-timing each element:

```css
.reveal {
  opacity: 0;
  transform: translateY(30px);
  transition: opacity .6s cubic-bezier(.16,1,.3,1), transform .6s cubic-bezier(.16,1,.3,1);
}
[data-state="ready"] .reveal { opacity: 1; transform: translateY(0); }
.reveal:nth-child(1) { transition-delay: .1s; }
.reveal:nth-child(2) { transition-delay: .2s; }
.reveal:nth-child(3) { transition-delay: .3s; }
```

This is for the page's own one-time entrance only — the moment the composition first becomes visible. Do not reuse `.reveal`/stagger timing to mark a teaching state change; state changes use the `[data-state]` toggle above so replay and reset stay exact.

## Web Animations API

Retain and cancel every animation before replay:

```js
let active = [];

function cancelMotion() {
  active.forEach(animation => animation.cancel());
  active = [];
}

function play() {
  cancelMotion();
  applyReadyState();
  if (Deck.reduced()) return applySettledState();
  const animation = subject.animate(
    [{ transform: "translateX(0)" }, { transform: "translateX(260px)" }],
    { duration: 700, easing: "cubic-bezier(.22,.8,.3,1)", fill: "forwards" }
  );
  active.push(animation);
  animation.finished.then(applySettledState).catch(() => {});
}
```

Use `animation.pause()`, `play()`, and `currentTime` when playback controls need them. Never use unresolved `finished` promises as the only source of canonical state.

## GSAP timeline

Use one timeline with defaults and named labels; do not chain delays across unrelated tweens:

```js
let timeline = null;

function buildTimeline() {
  timeline?.kill();
  applyReadyState();
  timeline = gsap.timeline({ paused: true, defaults: { ease: "power2.out" } });
  timeline.addLabel("focus", 0)
    .to(subject, { autoAlpha: 1, duration: .24 }, "focus")
    .addLabel("change")
    .to(subject, { x: 260, duration: .7 }, "change")
    .addLabel("evidence", "-=.12")
    .to(evidence, { autoAlpha: 1, duration: .24 }, "evidence");
  return timeline;
}

function destroy() {
  timeline?.kill();
  timeline = null;
}
```

Set reduced-motion states directly rather than constructing a zero-duration timeline. Put a ScrollTrigger on a top-level timeline only when the page actually scrolls; fixed Notale stages normally use explicit controls instead.

## Canvas with the Notale chassis

For deterministic, state-driven redraws use `Deck.autofit()`. For continuous explanatory motion use one `Deck.loop()`:

```js
let stopLoop = () => {};

function startLoop() {
  stopLoop();
  resetModel();
  stopLoop = Deck.loop((time, dt) => {
    if (dt === 0) setModelAt(time);
    else updateModel(Math.min(dt, 34));
    draw();
  }, { still: 2400 });
}
```

Choose `still` at a frame containing the evidence, not an empty start. Let `Deck.loop()` handle reduced motion and hidden tabs; call `stopLoop()` on reset and teardown.

## Lottie

Use Lottie only with an existing local animation asset. Keep controls and explanations in HTML, expose Play/Pause/Replay, and map useful segments to named states. Destroy the player and remove its event listeners on teardown. Under reduced motion, seek to an informative frame and stop. Do not use Lottie as the mutable scientific model or fetch a new remote asset at runtime.

## Shared cleanup

Create an idempotent `destroy()` that cancels the active engine, aborts listeners, disconnects observers, clears timers, and releases page-owned graphics resources. Register it once with `pagehide`. Call the same cancellation path before rebuilding or replaying the sequence.
