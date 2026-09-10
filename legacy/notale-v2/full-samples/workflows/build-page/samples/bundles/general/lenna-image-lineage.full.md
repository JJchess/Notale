<sample id="lenna-image-lineage" category="general" variant="full">
  <file path="samples/general/lenna-image-lineage/output/pages/index.html">
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <title>How one network image persists through copies</title>
    <link rel="stylesheet" href="assets/base.css" />
    <link rel="stylesheet" href="assets/page.css" />
  </head>
  <body>
    <main id="stage" class="no-pan" tabindex="0" aria-labelledby="page-title" aria-describedby="page-summary">
      <h1 id="page-title" class="sr-only">How one network image persists through copies</h1>
      <p id="page-summary" class="sr-only">
        Five familiar network images multiply into a field of twenty-five. Five blurred
        technical screenshots replace that field, then converge into the same pixelated
        eighty-four by eighty-four portrait.
      </p>

      <div id="pixel-field" aria-hidden="true"></div>
      <div id="meme-layer" class="image-layer" aria-label="A field of copied network images"></div>
      <div id="screenshot-layer" class="image-layer" aria-label="The image recurring in technical contexts"></div>

      <figure id="portrait" aria-label="A pixelated 84 by 84 portrait">
        <img src="assets/img/lenna-pixels.png" width="84" height="84" alt="A deliberately low-resolution, pixelated portrait" draggable="false" />
      </figure>

      <aside id="caption-panel" aria-live="polite" aria-atomic="true">
        <p class="caption-copy is-initial">A network image travels by being copied, framed, and posted again.</p>
        <p class="caption-copy">Each copy becomes a new origin for the next.</p>
        <p class="caption-copy">Five images become a field of twenty-five copies.</p>
        <p class="caption-copy">The copies fade as one recurring portrait comes forward.</p>
        <p class="caption-copy">The same pixels surface inside code, coursework, forums, and tools.</p>
        <p class="caption-copy">Five technical contexts resolve to the same portrait.</p>
        <p class="caption-copy">The recurring image resolves to the same 84 × 84 pixel portrait.</p>
      </aside>

      <ol class="sr-only">
        <li>Five complete bordered thumbnails establish the starting image group.</li>
        <li>New copies grow outward from small pixel-like origins.</li>
        <li>Twenty-five images form a dense, deterministic field.</li>
        <li>The field fades while technical screenshots enter along the same paths.</li>
        <li>Five screenshots show the image inside code, coursework, forums, and tools.</li>
        <li>The screenshots gather into the footprint of a single portrait.</li>
        <li>The sequence resolves as a visibly pixelated 84 by 84 portrait.</li>
      </ol>
    </main>

    <script src="assets/base.js"></script>
    <script src="assets/lib/gsap.min.js"></script>
    <script src="assets/story.js"></script>
  </body>
</html>
```
  </file>
  <file path="samples/general/lenna-image-lineage/output/pages/assets/page.css">
```css
:root {
  --stage-w: 1600px;
  --stage-h: 900px;
  --bg: #390a29;
  --text: #fffaf5;
  --font-sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --focus: #a5f2d5;
  --pad-x: 0px;
  --deep: #390a29;
  --field: #440d31;
  --ink: #282828;
  --paper: #fffaf5;
  --line: rgba(23, 3, 17, 0.34);
}

body {
  background: var(--deep);
}

#stage {
  isolation: isolate;
  background: var(--deep);
  cursor: default;
}

/* Keep semantic-only copy clipped from view without triggering overflow diagnostics. */
#page-title,
#page-summary,
#stage > ol.sr-only {
  overflow: visible;
}

#page-title { left: 0; top: 0; }
#page-summary { left: 3px; top: 0; }
#stage > ol.sr-only { left: 6px; top: 0; }

#pixel-field,
.image-layer {
  position: absolute;
  inset: 0;
}

#pixel-field {
  z-index: 0;
  background-color: var(--field);
  background-image:
    linear-gradient(var(--line) 1px, transparent 1px),
    linear-gradient(90deg, var(--line) 1px, transparent 1px);
  background-size: 15px 15px;
  opacity: 1;
  will-change: opacity;
}

.image-layer {
  z-index: 2;
  pointer-events: none;
}

#screenshot-layer {
  z-index: 4;
}

.network-image {
  position: absolute;
  left: 0;
  top: 0;
  width: 200px;
  height: 200px;
  border: 8px solid currentColor;
  background: currentColor;
  object-fit: cover;
  transform-origin: 50% 50%;
  will-change: transform, opacity, border-color;
  user-select: none;
  -webkit-user-drag: none;
}

.network-image.seed {
  z-index: 1;
}

.network-image.echo {
  z-index: 2;
}

.network-image.context {
  z-index: 3;
}

#portrait {
  position: absolute;
  left: 200px;
  top: 156px;
  z-index: 5;
  width: 588px;
  height: 588px;
  margin: 0;
  opacity: 0;
  transform-origin: 50% 50%;
  will-change: transform, opacity;
  pointer-events: none;
}

#portrait img {
  width: 100%;
  height: 100%;
  max-width: none;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

#portrait::after {
  content: "";
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(40, 13, 29, 0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(40, 13, 29, 0.1) 1px, transparent 1px);
  background-size: 7px 7px;
  pointer-events: none;
}

#caption-panel {
  position: absolute;
  left: 1120px;
  top: 356px;
  z-index: 20;
  width: 360px;
  height: 188px;
  padding: 30px 32px;
  overflow: hidden;
  background: var(--paper);
  color: var(--ink);
}

.caption-copy {
  position: absolute;
  inset: 30px 32px;
  display: flex;
  align-items: center;
  font-size: 27px;
  font-weight: 650;
  line-height: 1.38;
  letter-spacing: -0.018em;
  opacity: 0;
  visibility: hidden;
  will-change: transform, opacity;
}

.caption-copy.is-initial {
  opacity: 1;
  visibility: visible;
}

/* If the renderer or an image fails, keep the complete lineage readable. */
#stage.has-fallback > :not(.fallback-card) {
  display: none;
}

.fallback-card {
  position: absolute;
  left: 270px;
  top: 160px;
  width: 1060px;
  padding: 64px 72px;
  background: var(--paper);
  color: var(--ink);
}

.fallback-card h1 {
  font-size: 42px;
  line-height: 1.08;
}

.fallback-card p {
  margin-top: 20px;
  max-width: 850px;
  font-size: 22px;
  line-height: 1.5;
}

.fallback-card ol {
  margin-top: 28px;
  padding-left: 24px;
  columns: 2;
  column-gap: 64px;
  font-size: 17px;
  line-height: 1.55;
}

.fallback-card li {
  break-inside: avoid;
  margin-bottom: 10px;
}

@media (prefers-reduced-motion: reduce) {
  .network-image,
  #portrait,
  #pixel-field,
  .caption-copy {
    will-change: auto;
  }
}
```
  </file>
  <file path="samples/general/lenna-image-lineage/output/pages/assets/story.js">
```javascript
(function () {
  "use strict";

  var STATE_NAMES = ["five", "sprout", "field", "exchange", "contexts", "gather", "portrait"];
  var STATE_TIMES = [0, 1.55, 3.3, 4.9, 6.2, 8.4, 10.25];
  var COLORS = ["#F29F80", "#D96666", "#A64153", "#586FA6", "#F2C299"];
  var MINT = "#A5F2D5";

  var SEEDS = [
    { x: 174, y: 30, label: "Grumpy cat" },
    { x: 846, y: 80, label: "Cake illusion" },
    { x: 510, y: 350, label: "Disaster girl" },
    { x: 174, y: 620, label: "Bernie Sanders meme" },
    { x: 896, y: 570, label: "Oregon Trail screen" }
  ];

  var ORIGINS = [
    { x: 334, y: 292 },
    { x: 574, y: 310 },
    { x: 482, y: 450 },
    { x: 346, y: 594 },
    { x: 622, y: 570 }
  ];

  var FIELD = [
    { x: 18, y: 18 }, { x: 234, y: 36 }, { x: 452, y: 12 }, { x: 670, y: 44 }, { x: 886, y: 18 },
    { x: 52, y: 226 }, { x: 270, y: 250 }, { x: 488, y: 218 }, { x: 706, y: 245 }, { x: 924, y: 220 },
    { x: 14, y: 438 }, { x: 232, y: 420 }, { x: 450, y: 458 }, { x: 668, y: 428 }, { x: 886, y: 450 },
    { x: 44, y: 650 }, { x: 262, y: 678 }, { x: 480, y: 642 }, { x: 698, y: 680 }, { x: 916, y: 654 }
  ];

  var SPREAD_ORDER = [8, 11, 7, 12, 3, 16, 6, 13, 2, 17, 10, 9, 14, 1, 18, 5, 15, 4, 19, 0];

  var CONTEXTS = [
    { x: 124, y: 80, alt: "GitHub README containing a Lenna image package" },
    { x: 846, y: 30, alt: "JavaScript image library example using Lenna" },
    { x: 460, y: 350, alt: "Coursework scatter plot containing a Lenna thumbnail" },
    { x: 174, y: 570, alt: "Stack Overflow code example using a blurred Lenna image" },
    { x: 796, y: 620, alt: "Quora image processing page using a blurred Lenna image" }
  ];

  var ANCHORS = [
    { x: 315, y: 294 },
    { x: 540, y: 225 },
    { x: 474, y: 446 },
    { x: 330, y: 650 },
    { x: 674, y: 580 }
  ];

  var memeLayer = document.getElementById("meme-layer");
  var screenshotLayer = document.getElementById("screenshot-layer");
  var portrait = document.getElementById("portrait");
  var pixelField = document.getElementById("pixel-field");
  var stage = document.getElementById("stage");
  var copies = Array.from(document.querySelectorAll(".caption-copy"));
  var seedEls = [];
  var echoEls = [];
  var contextEls = [];
  var removeListeners = [];
  var fallbackShown = false;

  function showFallback() {
    if (fallbackShown) return;
    fallbackShown = true;
    disposed = true;
    clearTimeout(wheelTimer);
    if (navTween) navTween.kill();
    if (timeline) timeline.kill();
    removeListeners.splice(0).forEach(function (remove) { remove(); });

    var card = document.createElement("section");
    card.className = "fallback-card";
    ["page-title", "page-summary"].forEach(function (id) {
      var copy = document.getElementById(id).cloneNode(true);
      copy.removeAttribute("id");
      copy.removeAttribute("class");
      card.appendChild(copy);
    });
    var steps = stage.querySelector("ol").cloneNode(true);
    steps.removeAttribute("class");
    card.appendChild(steps);
    stage.appendChild(card);
    stage.classList.add("has-fallback");
    stage.dataset.state = "fallback";
    stage.setAttribute("aria-label", document.getElementById("page-summary").textContent.trim());

    function fitFallback() {
      var scale = Math.min(innerWidth / 1600, innerHeight / 900);
      document.documentElement.style.setProperty("--s", scale > 0 ? scale : 1);
    }
    function disposeFallback() {
      window.removeEventListener("resize", fitFallback);
      window.__NOTALE_READY__ = false;
    }
    fitFallback();
    window.addEventListener("resize", fitFallback);
    window.addEventListener("pagehide", disposeFallback, { once: true });
    window.NotaleStory = {
      goTo: function () {}, next: function () {}, previous: function () {}, reset: function () {},
      getState: function () { return { name: "fallback", animating: false, disposed: true }; },
      states: STATE_NAMES.slice()
    };
    window.__NOTALE_READY__ = true;
  }

  function imageNode(className, src, alt) {
    var image = document.createElement("img");
    image.className = "network-image " + className;
    image.src = src;
    image.alt = alt || "";
    image.loading = "eager";
    image.decoding = "async";
    image.draggable = false;
    listen(image, "error", showFallback, { once: true });
    return image;
  }

  function appendImage(layer, list, className, src, alt, identity) {
    var image = imageNode(className, src, alt);
    image.dataset.identity = identity;
    layer.appendChild(image);
    list.push(image);
  }

  function placeImage(image, position, offset, scale, opacity, color, zIndex) {
    gsap.set(image, {
      x: position.x - offset, y: position.y - offset, scale: scale, opacity: opacity,
      color: color, borderColor: color, backgroundColor: color, zIndex: zIndex
    });
  }

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    removeListeners.push(function () { target.removeEventListener(type, handler, options); });
  }

  if (!window.Deck || !window.gsap) {
    showFallback();
    return;
  }

  listen(portrait.querySelector("img"), "error", showFallback, { once: true });

  SEEDS.forEach(function (item, index) {
    appendImage(memeLayer, seedEls, "meme seed", "assets/img/memes/pic" + (index + 1) + ".jpg",
      item.label + " network image", "seed-" + (index + 1));
  });

  FIELD.forEach(function (_, index) {
    appendImage(memeLayer, echoEls, "meme echo", "assets/img/memes/pic" + (index + 1) + ".jpg",
      "", "copy-" + (index + 1));
  });

  CONTEXTS.forEach(function (item, index) {
    appendImage(screenshotLayer, contextEls, "context", "assets/img/screenshots/pic" + (index + 1) + ".jpg",
      item.alt, "context-" + (index + 1));
  });

  seedEls.forEach(function (image, index) {
    placeImage(image, SEEDS[index], 0, 1, 1, COLORS[index], 1);
  });

  echoEls.forEach(function (image, index) {
    var origin = ORIGINS[index % ORIGINS.length];
    placeImage(image, origin, 100, 0.035, 0, COLORS[index % COLORS.length], 10 + index);
  });

  contextEls.forEach(function (image, index) {
    placeImage(image, ORIGINS[index], 100, 0.035, 0, MINT, 40 + index);
  });

  gsap.set(portrait, { opacity: 0, scale: 0.54 });
  gsap.set(copies.slice(1), { autoAlpha: 0, y: 18 });
  gsap.set(copies[0], { autoAlpha: 1, y: 0 });

  var timeline = gsap.timeline({ paused: true, defaults: { ease: "power2.inOut" } });
  STATE_NAMES.forEach(function (name, index) {
    timeline.addLabel(name, STATE_TIMES[index]);
  });

  timeline.to(seedEls, {
    opacity: 0.2,
    duration: 1.05,
    stagger: 0.04,
    ease: "power2.out"
  }, 0.18);

  SPREAD_ORDER.forEach(function (fieldIndex, orderIndex) {
    timeline.to(echoEls[fieldIndex], {
      x: FIELD[fieldIndex].x,
      y: FIELD[fieldIndex].y,
      scale: 1,
      opacity: 1,
      duration: 1.45,
      ease: "expo.out"
    }, 0.45 + orderIndex * 0.065);
  });

  timeline.to(echoEls, {
    opacity: 0.2,
    scale: 1,
    duration: 0.95,
    stagger: 0.012,
    ease: "power2.inOut"
  }, 3.55);
  timeline.to(seedEls, { opacity: 0.2, duration: 0.8 }, 3.55);

  contextEls.forEach(function (image, index) {
    timeline.to(image, {
      x: CONTEXTS[index].x,
      y: CONTEXTS[index].y,
      scale: 1,
      opacity: 1,
      duration: 1.5,
      ease: "expo.out"
    }, 4 + index * 0.14);
  });

  timeline.to(echoEls, {
    opacity: 0,
    scale: 0.84,
    duration: 0.95,
    stagger: 0.01,
    ease: "power2.in"
  }, 6.55);
  timeline.to(seedEls, { opacity: 0, scale: 0.86, duration: 0.9 }, 6.55);

  contextEls.forEach(function (image, index) {
    timeline.to(image, {
      x: ANCHORS[index].x - 100,
      y: ANCHORS[index].y - 100,
      scale: 0.18,
      opacity: 0.72,
      borderColor: COLORS[index],
      backgroundColor: COLORS[index],
      duration: 1.55,
      ease: "power3.inOut"
    }, 6.55 + index * 0.06);
  });

  timeline.to(portrait, {
    opacity: 0.46,
    scale: 0.76,
    duration: 1.3,
    ease: "power2.out"
  }, 7.1);
  timeline.to(pixelField, { opacity: 0.24, duration: 1.25 }, 7.05);

  timeline.to(contextEls, {
    opacity: 0,
    scale: 0.055,
    duration: 0.9,
    stagger: 0.055,
    ease: "power2.in"
  }, 8.65);
  timeline.to(portrait, {
    opacity: 1,
    scale: 1,
    duration: 1.55,
    ease: "power3.out"
  }, 8.65);
  timeline.to(pixelField, { opacity: 0, duration: 1.15 }, 8.65);

  function crossfade(fromIndex, toIndex, outAt, inAt) {
    timeline.to(copies[fromIndex], {
      autoAlpha: 0,
      y: -18,
      duration: 0.28,
      ease: "power1.in"
    }, outAt);
    timeline.fromTo(copies[toIndex],
      { autoAlpha: 0, y: 18 },
      { autoAlpha: 1, y: 0, duration: 0.42, ease: "power2.out", immediateRender: false },
      inAt
    );
  }

  crossfade(0, 1, 0.92, 1.08);
  crossfade(1, 2, 2.68, 2.84);
  crossfade(2, 3, 4.28, 4.44);
  crossfade(3, 4, 5.58, 5.74);
  crossfade(4, 5, 7.78, 7.94);
  crossfade(5, 6, 9.58, 9.74);

  var clock = { hold: 0 };
  timeline.to(clock, { hold: 1, duration: 0.01 }, 10.25);
  timeline.pause(0);

  var currentIndex = 0;
  var targetIndex = 0;
  var navTween = null;
  var locked = false;
  var wheelTotal = 0;
  var wheelTimer = 0;
  var touch = null;
  var reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var reduced = reducedQuery.matches;
  var disposed = false;

  function updateSemantics(index) {
    stage.dataset.state = STATE_NAMES[index];
    stage.setAttribute("aria-label", copies[index].textContent.trim());
    copies.forEach(function (copy, copyIndex) {
      copy.setAttribute("aria-hidden", copyIndex === index ? "false" : "true");
    });
  }

  function finish(index) {
    currentIndex = index;
    targetIndex = index;
    locked = false;
    navTween = null;
    updateSemantics(index);
  }

  function goTo(index, options) {
    if (disposed) return;
    options = options || {};
    var next = Deck.clamp(Number(index) || 0, 0, STATE_NAMES.length - 1);
    var immediate = options.immediate === true || reduced;
    var destination = STATE_TIMES[next];

    if (navTween) {
      navTween.kill();
      navTween = null;
    }

    targetIndex = next;
    updateSemantics(next);

    if (immediate) {
      timeline.pause(destination, false);
      finish(next);
      return;
    }

    var distance = Math.abs(timeline.time() - destination);
    if (distance < 0.001) {
      finish(next);
      return;
    }

    locked = true;
    navTween = gsap.to(timeline, {
      time: destination,
      duration: Math.min(1.85, Math.max(1.25, distance * 0.78)),
      ease: "power2.inOut",
      overwrite: true,
      onComplete: function () { finish(next); }
    });
  }

  function advance(direction) {
    if (locked) return;
    goTo(currentIndex + direction);
  }

  function onWheel(event) {
    event.preventDefault();
    if (locked) return;
    wheelTotal += Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(function () { wheelTotal = 0; }, 180);
    if (Math.abs(wheelTotal) >= 48) {
      var direction = wheelTotal > 0 ? 1 : -1;
      wheelTotal = 0;
      advance(direction);
    }
  }

  function onKey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)) {
      event.preventDefault();
      advance(1);
    } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
      event.preventDefault();
      advance(-1);
    } else if (event.key === "Home" || event.key.toLowerCase() === "r") {
      event.preventDefault();
      goTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      goTo(STATE_NAMES.length - 1);
    }
  }

  function onPointerDown(event) {
    if (event.pointerType !== "touch") return;
    var point = Deck.pt(stage, event);
    touch = { id: event.pointerId, y: point.y };
    if (stage.setPointerCapture) stage.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (touch && event.pointerId === touch.id) event.preventDefault();
  }

  function onPointerUp(event) {
    if (!touch || event.pointerId !== touch.id) return;
    var point = Deck.pt(stage, event);
    var delta = touch.y - point.y;
    touch = null;
    if (Math.abs(delta) >= 44) advance(delta > 0 ? 1 : -1);
  }

  function onPointerCancel() {
    touch = null;
  }

  function onReducedChange(event) {
    reduced = event.matches;
    if (reduced && locked) goTo(targetIndex, { immediate: true });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimeout(wheelTimer);
    if (navTween) navTween.kill();
    timeline.kill();
    removeListeners.splice(0).forEach(function (remove) { remove(); });
    window.__NOTALE_READY__ = false;
  }

  listen(window, "wheel", onWheel, { passive: false });
  listen(document, "keydown", onKey);
  listen(stage, "pointerdown", onPointerDown);
  listen(stage, "pointermove", onPointerMove, { passive: false });
  listen(stage, "pointerup", onPointerUp);
  listen(stage, "pointercancel", onPointerCancel);
  listen(stage, "lostpointercapture", onPointerCancel);
  listen(reducedQuery, "change", onReducedChange);
  listen(window, "pagehide", dispose);

  Deck.init({ keys: false, title: "How one network image persists through copies" });
  updateSemantics(0);

  window.NotaleStory = {
    goTo: goTo,
    next: function () { advance(1); },
    previous: function () { advance(-1); },
    reset: function (options) { goTo(0, options || {}); },
    getState: function () {
      return {
        index: currentIndex,
        target: targetIndex,
        name: STATE_NAMES[targetIndex],
        time: Number(timeline.time().toFixed(3)),
        animating: locked,
        reducedMotion: reduced,
        disposed: disposed
      };
    },
    states: STATE_NAMES.slice()
  };
  window.__NOTALE_READY__ = true;
})();
```
  </file>
  <omitted path="assets/base.css">provided by the deck chassis or the vendored library index; not part of this sample</omitted>
  <omitted path="assets/base.js">provided by the deck chassis or the vendored library index; not part of this sample</omitted>
  <omitted path="assets/img/lenna-pixels.png">84×84 pixelated portrait thumbnail used as the lineage origin image</omitted>
  <omitted path="assets/lib/gsap.min.js">provided by the deck chassis or the vendored library index; not part of this sample</omitted>
</sample>
