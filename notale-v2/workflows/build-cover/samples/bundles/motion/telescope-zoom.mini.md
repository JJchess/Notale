<sample id="telescope-zoom" category="motion" variant="mini">
  <file path="samples/motion/telescope-zoom/pages/index.html">
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="description" content="For the planet, a layered telescope zoom cover">
  <meta name="color-scheme" content="light">
  <title>For the planet</title>
  <link rel="preload" href="assets/img-big.jpg" as="image" fetchpriority="high">
  <link rel="stylesheet" href="assets/style.css">
  <script src="assets/gsap.min.js" defer></script>
  <script src="assets/app.js" defer></script>
</head>
<body>
  <main class="viewport" id="viewport">
    <section class="stage" id="stage" aria-labelledby="cover-title">
      <div class="media" aria-hidden="true">
        <div class="media-layer back"><img src="assets/img-big.jpg" alt=""></div>
        <div class="media-layer front f1"><img src="assets/img-big.jpg" alt=""></div>
        <div class="media-layer front f2"><img src="assets/img-big.jpg" alt=""></div>
        <div class="media-layer front f3"><img src="assets/img-big.jpg" alt=""></div>
        <div class="media-layer front f4"><img src="assets/img-big.jpg" alt=""></div>
        <div class="media-layer front f5"><img src="assets/img-big.jpg" alt=""></div>
        <div class="media-layer front f6"><img src="assets/img-big.jpg" alt=""></div>
      </div>
      <h1 class="title" id="cover-title"><span class="left">for the</span><span class="right">planet</span></h1>
      <div class="orbit" aria-hidden="true">
        <img src="assets/img-1.webp" alt=""><img src="assets/img-2.webp" alt="">
        <img src="assets/img-3.webp" alt=""><img src="assets/img-4.webp" alt="">
        <img src="assets/img-9.webp" alt=""><img src="assets/img-6.webp" alt="">
        <img src="assets/img-7.webp" alt=""><img src="assets/img-8.webp" alt="">
        <img src="assets/img-9.webp" alt=""><img src="assets/img-10.webp" alt="">
      </div>
    </section>
  </main>
</body>
</html>
```
  </file>
  <file path="samples/motion/telescope-zoom/pages/assets/style.css">
```css
*,*::before,*::after{box-sizing:border-box}
html,body{width:100%;height:100%;margin:0;overflow:hidden}
body{background:#10100f;color:#1a1a1a;font-family:"Helvetica Neue",Arial,sans-serif;overscroll-behavior:none}
.viewport{position:fixed;inset:0;display:grid;place-items:center;overflow:hidden;touch-action:none}
.stage{position:absolute;width:1600px;height:900px;overflow:hidden;isolation:isolate;background:#fff;transform:scale(var(--fit,1));transform-origin:50% 50%;contain:layout paint}
.media{position:absolute;inset:0;z-index:1;transform-origin:50% 50%;will-change:transform}
.media-layer,.media-layer img{position:absolute;inset:0;width:100%;height:100%}
.media-layer{transform-origin:50% 50%}.media-layer img{object-fit:cover;object-position:center}
.front{filter:blur(2px);will-change:transform,filter}
.front img{-webkit-mask:url("mask.png") 50% 50%/cover no-repeat;mask:url("mask.png") 50% 50%/cover no-repeat}
.f1{transform:scale(1)}.f2{transform:scale(.85)}.f3{transform:scale(.6)}.f4{transform:scale(.45)}.f5{transform:scale(.3)}.f6{transform:scale(.15)}
.title{position:absolute;left:50%;top:50%;z-index:3;display:flex;margin:0;font-size:48px;font-weight:500;line-height:78px;letter-spacing:-.025em;transform:translate(-50%,-65%) scaleX(1.18);white-space:nowrap}
.title span{display:inline-block;will-change:transform}
.orbit{position:absolute;inset:0;z-index:4;perspective:900px;pointer-events:none}
.orbit img{position:absolute;width:160px;height:auto;transform-style:preserve-3d;backface-visibility:hidden;will-change:transform}
.orbit img:nth-child(1){left:-48px;top:240px}.orbit img:nth-child(2){left:320px;top:80px}
.orbit img:nth-child(3){left:424px;top:128px}.orbit img:nth-child(4){right:288px;top:288px}
.orbit img:nth-child(5){right:160px;top:80px}.orbit img:nth-child(6){left:160px;bottom:80px}
.orbit img:nth-child(7){left:360px;bottom:128px}.orbit img:nth-child(8){left:720px;bottom:48px}
.orbit img:nth-child(9){right:240px;bottom:80px}.orbit img:nth-child(10){right:112px;bottom:144px}
@media(prefers-reduced-motion:reduce){.media,.front,.title span,.orbit img{will-change:auto}}
```
  </file>
  <file path="samples/motion/telescope-zoom/pages/assets/app.js">
```javascript
(() => {
  "use strict";

  const clampProgress = gsap.utils.clamp(0, 1);
  const easeProgress = gsap.parseEase("power1.inOut");
  const frontScales = [1, .85, .6, .45, .3, .15];
  const keySteps = {
    ArrowDown: .12, ArrowRight: .12, PageDown: .28,
    ArrowUp: -.12, ArrowLeft: -.12, PageUp: -.28
  };

  const viewport = document.getElementById("viewport");
  const stage = document.getElementById("stage");
  const media = stage.querySelector(".media");
  const fronts = [...stage.querySelectorAll(".front")];
  const orbitImages = [...stage.querySelectorAll(".orbit img")];
  const titleLeft = stage.querySelector(".left");
  const titleRight = stage.querySelector(".right");
  const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");

  let events;
  let timeline;
  let progressTween;
  let progressState = { value: 0 };
  let targetProgress = 0;
  let reducedMotion = false;
  let dragStart;
  let initialized = false;

  function fitStage() {
    const scale = Math.min(innerWidth / 1600, innerHeight / 900);
    stage.style.setProperty("--fit", scale);
  }

  function render() {
    const progress = clampProgress(progressState.value);
    const eased = easeProgress(progress);
    timeline?.progress(progress, false);
    media.style.transform = `scale(${eased})`;
    titleLeft.style.transform = `translate3d(${eased * (-894 + titleLeft.offsetWidth) - 8}px,0,0)`;
    titleRight.style.transform = `translate3d(${eased * (894 - titleRight.offsetWidth)}px,0,0)`;
    stage.style.setProperty("--progress", eased);
    stage.dataset.progress = progress.toFixed(4);
  }

  function setProgress(value, instant = false) {
    if (!initialized) return;
    targetProgress = clampProgress(value);
    if (reducedMotion) {
      targetProgress = progressState.value = 0;
      render();
      return;
    }
    progressTween?.kill();
    if (instant) {
      progressState.value = targetProgress;
      render();
      return;
    }
    progressTween = gsap.to(progressState, {
      value: targetProgress,
      duration: Math.min(1.5, 0.55 + Math.abs(targetProgress - progressState.value) * 1.15),
      ease: "power3.out",
      overwrite: true,
      onUpdate: render
    });
  }

  function listen(target, type, handler, options = {}) {
    target.addEventListener(type, handler, { ...options, signal: events.signal });
  }

  function onWheel(event) {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 900 : 1;
    setProgress(targetProgress + event.deltaY * unit / 900);
  }

  function onKeyDown(event) {
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setProgress(event.key === "End" ? 1 : 0);
    } else if (keySteps[event.key]) {
      event.preventDefault();
      setProgress(targetProgress + keySteps[event.key]);
    }
  }

  function onPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragStart = { id: event.pointerId, y: event.clientY, progress: targetProgress };
    viewport.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!dragStart || dragStart.id !== event.pointerId) return;
    event.preventDefault();
    setProgress(dragStart.progress + (dragStart.y - event.clientY) / 700);
  }

  function endDrag(event) {
    if (!dragStart || dragStart.id !== event.pointerId) return;
    dragStart = null;
    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
  }

  function onMotionChange(event) {
    reducedMotion = event.matches;
    if (reducedMotion) setProgress(0, true);
  }

  function onVisibilityChange() {
    if (!progressTween) return;
    document.hidden ? progressTween.pause() : progressTween.resume();
  }

  function destroy() {
    if (!initialized) return;
    initialized = false;
    if (dragStart && viewport.hasPointerCapture(dragStart.id)) {
      viewport.releasePointerCapture(dragStart.id);
    }
    dragStart = null;
    events.abort();
    progressTween?.kill();
    timeline?.kill();
    progressTween = timeline = null;
  }

  function init() {
    destroy();
    initialized = true;
    events = new AbortController();
    progressState = { value: 0 };
    targetProgress = 0;

    gsap.set(orbitImages, {
      z: 0,
      transformStyle: "preserve-3d",
      backfaceVisibility: "hidden",
      force3D: true
    });
    gsap.set(fronts, {
      scale: index => frontScales[index],
      filter: "blur(2px)"
    });
    timeline = gsap.timeline({ paused: true })
      .to(orbitImages, {
        z: 900,
        duration: 1,
        ease: "power1.inOut",
        stagger: { amount: 0.2, from: "center" }
      })
      .to(fronts, {
        scale: 1,
        duration: 1,
        ease: "power1.inOut",
        delay: 0.1
      }, 0.6)
      .to(fronts, {
        filter: "blur(0px)",
        duration: 1,
        ease: "power1.inOut",
        delay: 0.4,
        stagger: { amount: 0.2, from: "end" }
      }, 0.6);

    reducedMotion = motionQuery?.matches ?? false;
    listen(window, "resize", fitStage);
    listen(window, "wheel", onWheel, { passive: false });
    listen(window, "keydown", onKeyDown);
    listen(viewport, "pointerdown", onPointerDown);
    listen(viewport, "pointermove", onPointerMove, { passive: false });
    listen(viewport, "pointerup", endDrag);
    listen(viewport, "pointercancel", endDrag);
    listen(viewport, "lostpointercapture", endDrag);
    listen(document, "visibilitychange", onVisibilityChange);
    listen(window, "pagehide", destroy, { once: true });
    if (motionQuery) listen(motionQuery, "change", onMotionChange);
    fitStage();
    render();
  }

  window.TelescopeCover = {
    init,
    destroy,
    setProgress: (progress, instant = true) => setProgress(progress, instant),
    getProgress: () => progressState.value,
    getTarget: () => targetProgress
  };
  init();
})();
```
  </file>
  <omitted path="assets/gsap.min.js">provided by the deck chassis or the vendored library index; not part of this sample</omitted>
  <omitted path="assets/img-1.webp">ten nested-scale photographs (img-1 … img-10) shown in the archive strip</omitted>
  <omitted path="assets/img-10.webp">ten nested-scale photographs (img-1 … img-10) shown in the archive strip</omitted>
  <omitted path="assets/img-2.webp">ten nested-scale photographs (img-1 … img-10) shown in the archive strip</omitted>
  <omitted path="assets/img-3.webp">ten nested-scale photographs (img-1 … img-10) shown in the archive strip</omitted>
  <omitted path="assets/img-4.webp">ten nested-scale photographs (img-1 … img-10) shown in the archive strip</omitted>
  <omitted path="assets/img-6.webp">ten nested-scale photographs (img-1 … img-10) shown in the archive strip</omitted>
  <omitted path="assets/img-7.webp">ten nested-scale photographs (img-1 … img-10) shown in the archive strip</omitted>
  <omitted path="assets/img-8.webp">ten nested-scale photographs (img-1 … img-10) shown in the archive strip</omitted>
  <omitted path="assets/img-9.webp">ten nested-scale photographs (img-1 … img-10) shown in the archive strip</omitted>
  <omitted path="assets/img-big.jpg">full-frame hero photograph used for the back and front media layers</omitted>
</sample>
