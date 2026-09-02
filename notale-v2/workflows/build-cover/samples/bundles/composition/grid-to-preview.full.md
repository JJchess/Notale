<sample id="grid-to-preview" category="composition" variant="full">
  <file path="samples/composition/grid-to-preview/pages/index.html">
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="color-scheme" content="light">
  <title>Domestic Objects</title>
  <link rel="stylesheet" href="assets/style.css">
  <script src="assets/gsap.min.js" defer></script>
  <script src="assets/app.js" defer></script>
</head>
<body class="loading">
  <main class="viewport">
    <section class="stage" aria-labelledby="cover-title">
      <h1 id="cover-title" class="cover-title">Domestic Objects</h1>
      <div class="composition">
        <ul class="object-grid" aria-label="Domestic objects"></ul>
        <div class="preview-grid" aria-hidden="true"></div>
      </div>
    </section>
  </main>
</body>
</html>
```
  </file>
  <file path="samples/composition/grid-to-preview/pages/assets/style.css">
```css
@font-face{font-family:DejaVu;src:url(DejaVuSerif.ttf) format("truetype");font-display:block}
:root{--paper:#efefef;--ink:#000;--fit:1;font-family:DejaVu,serif;color:var(--ink);background:var(--paper)}
*{box-sizing:border-box}
html,body{width:100%;height:100%;margin:0;overflow:hidden}
body{background:var(--paper);-webkit-font-smoothing:antialiased}
button{font:inherit;color:inherit;border:0;padding:0;background:none}
img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 50%}
.viewport{position:fixed;inset:0;overflow:hidden}
.stage{position:absolute;left:50%;top:50%;width:1600px;height:900px;overflow:hidden;background:var(--paper);transform:translate(-50%,-50%) scale(var(--fit));transform-origin:center}
.cover-title{position:absolute;z-index:1;left:66px;top:7px;margin:0;font-size:80px;font-weight:400;line-height:1.08;letter-spacing:-.06em;white-space:nowrap}
.composition{position:absolute;inset:76px 18px 18px;overflow:hidden}
.object-grid,.preview-grid{position:absolute;inset:24px 48px 14px;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(2,1fr);column-gap:80px;row-gap:80px;list-style:none}
.object{position:relative;width:100%;height:100%;contain:size;cursor:pointer;outline:0;touch-action:manipulation}
.object::after{content:"";position:absolute;inset:-5px;border:2px solid transparent;pointer-events:none}
.object:focus-visible::after{border-color:var(--ink)}
.object-image{pointer-events:none}
.preview-grid{pointer-events:none;z-index:2}
.preview{position:relative;grid-row:1/span 2;grid-column:auto/span 2;width:100%;height:100%;opacity:0;will-change:transform,opacity}
.preview.--left{grid-column:1/span 2}.preview.--right{grid-column:3/span 2}
.preview-images{display:grid;width:100%;height:100%;overflow:hidden}
.preview-image{grid-area:1/1;opacity:0;will-change:opacity}
.preview-name{position:absolute;z-index:4;top:calc(100% + 7px);left:0;margin:0;font-size:10px;line-height:1.35;letter-spacing:.025em;text-transform:uppercase;white-space:nowrap}
.masked-preview{position:absolute;z-index:3;inset:0;background:var(--paper);will-change:clip-path}
.loading::before,.loading::after{content:"";position:fixed;z-index:20;pointer-events:none}
.loading::before{inset:0;background:var(--paper)}
.loading::after{top:50%;left:50%;width:100px;height:1px;margin-left:-50px;background:var(--ink);animation:load 1.5s ease-in-out infinite alternate}
@keyframes load{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@media(prefers-reduced-motion:reduce){.loading::after{animation:none}}
```
  </file>
  <file path="samples/composition/grid-to-preview/pages/assets/app.js">
```javascript
(() => {
  const {gsap} = window;
  const PRODUCTS = [
    ["Candle holder", "A candle holder with glass, mosaic and chrome details"],
    ["Cow vase", "A vase in the shape of a cow, with a plant inside"],
    ["Chrome and blue book shelf", "A blue and chrome bookshelf"],
    ["Wooden sidetable with smoke glass detail", "A wooden sidetable with one part in smoked glass"],
    ["Yellow armchair", "A yellow armchair"],
    ["Wooden cabinet with fluted glass", "A wooden cabinet with doors of fluted glass"],
    ["Orange clock", "An orange clock with beige organic hands"],
    ["Red chair with chrome legs", "A red chair with chrome legs"],
  ];
  const objectGrid = document.querySelector(".object-grid");
  const previewGrid = document.querySelector(".preview-grid");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const listeners = new AbortController();
  const listen = (target, type, handler) =>
    target.addEventListener(type, handler, {signal: listeners.signal});

  const productButtons = PRODUCTS.map(([name, description], index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    const image = new Image();
    Object.assign(button, {className: "object", type: "button"});
    button.dataset.index = index;
    button.setAttribute("aria-label", name);
    button.setAttribute("aria-pressed", "false");
    Object.assign(image, {
      className: "object-image",
      src: `media/product-${index + 1}.webp`,
      alt: description,
      width: 1024,
      height: index === 6 ? 1024 : 1536,
    });
    button.append(image);
    item.append(button);
    objectGrid.append(item);
    return button;
  });

  class PreviewController {
    constructor(side, productIds, affectedIds) {
      this.affectedButtons = affectedIds.map(index => productButtons[index]);
      this.imagesByProduct = {};
      this.node = document.createElement("article");
      this.node.className = `preview --${side}`;
      const imageStack = document.createElement("div");
      imageStack.className = "preview-images";

      productIds.forEach(productId => {
        this.imagesByProduct[productId] = [0, 1, 2].map(detail => {
          const image = new Image();
          Object.assign(image, {
            className: "preview-image",
            alt: "",
            width: 1024,
            height: 1536,
            src: `media/product-${productId + 1}${detail ? `-detail-${detail}` : ""}.webp`,
          });
          imageStack.append(image);
          return image;
        });
      });
      this.name = document.createElement("p");
      this.name.className = "preview-name";
      this.mask = document.createElement("div");
      this.mask.className = "masked-preview";
      this.node.append(imageStack, this.name, this.mask);
      previewGrid.append(this.node);
      this.allImages = [...imageStack.children];
      this.buildTimeline();
    }

    crossMask(width, height) {
      return `polygon(${50 - width / 2}% 0,${50 + width / 2}% 0,${50 + width / 2}% ${50 - height / 2}%,100% ${50 - height / 2}%,100% ${50 + height / 2}%,${50 + width / 2}% ${50 + height / 2}%,${50 + width / 2}% 100%,${50 - width / 2}% 100%,${50 - width / 2}% ${50 + height / 2}%,0 ${50 + height / 2}%,0 ${50 - height / 2}%,${50 - width / 2}% ${50 - height / 2}%)`;
    }

    buildTimeline() {
      const width = this.node.offsetWidth;
      const height = this.node.offsetHeight;
      const gap = 80;
      const openMask = this.crossMask(gap / width * 100, gap / height * 100);
      const closedMask = this.crossMask(0, 0);
      this.timeline = gsap.timeline({
        paused: true,
        defaults: {duration: .5, ease: "power2.inOut"},
      })
        .addLabel("preview", 0)
        .addLabel("products", 0)
        .to(this.node, {opacity: 1}, "preview")
        .to(this.node, {
          scaleX: (width - gap) / width,
          scaleY: (height - gap) / height,
          transformOrigin: "center center",
        }, "preview")
        .to(this.affectedButtons, {
          opacity: 0,
          x: index => index % 2 ? -40 : 40,
          y: index => index < 2 ? 40 : -40,
        }, "products")
        .fromTo(this.mask, {clipPath: openMask}, {clipPath: closedMask}, "preview");
    }

    startGallery(productId) {
      if (reducedMotion.matches) return;
      const images = this.imagesByProduct[productId];
      this.gallery = gsap.timeline({repeat: -1});
      gsap.set(images.slice(1), {opacity: 0});
      images.forEach(image => this.gallery
        .set(images, {opacity: 0})
        .set(image, {opacity: 1})
        .to(image, {duration: 0, opacity: 1}, "+=0.5"));
    }

    show(productId) {
      this.gallery?.kill();
      this.name.textContent = PRODUCTS[productId][0];
      gsap.set(this.allImages, {opacity: 0});
      gsap.set(this.imagesByProduct[productId][0], {opacity: 1});
      reducedMotion.matches ? this.timeline.progress(1).pause() : this.timeline.play();
      this.startGallery(productId);
    }

    hide() {
      this.gallery?.kill();
      this.gallery = null;
      reducedMotion.matches ? this.timeline.progress(0).pause() : this.timeline.reverse();
    }

    reset() {
      this.gallery?.kill();
      this.timeline.kill();
      gsap.set(this.node, {clearProps: "opacity,transform"});
      gsap.set(this.affectedButtons, {clearProps: "opacity,transform"});
      gsap.set(this.mask, {clearProps: "clipPath"});
      gsap.set(this.allImages, {opacity: 0});
    }

    rebuild() {
      this.reset();
      this.buildTimeline();
    }

    destroy() {
      this.reset();
    }
  }

  const leftPreview = new PreviewController("left", [2, 3, 6, 7], [0, 1, 4, 5]);
  const rightPreview = new PreviewController("right", [0, 1, 4, 5], [2, 3, 6, 7]);
  const previewFor = button => +button.dataset.index % 4 < 2 ? rightPreview : leftPreview;
  let activeButton = null;
  let hoverTimer = 0;
  let inputType = "keyboard";
  let touchLocked = false;
  let disposed = false;

  function clearHoverTimer() {
    clearTimeout(hoverTimer);
    hoverTimer = 0;
  }

  function open(button) {
    if (disposed) return;
    clearHoverTimer();
    if (activeButton === button) return;
    if (activeButton) {
      previewFor(activeButton).hide();
      activeButton.setAttribute("aria-pressed", "false");
    }
    activeButton = button;
    activeButton.setAttribute("aria-pressed", "true");
    previewFor(activeButton).show(+activeButton.dataset.index);
  }

  function close(expectedButton) {
    if (disposed) return;
    clearHoverTimer();
    if (!activeButton || expectedButton && expectedButton !== activeButton) return;
    previewFor(activeButton).hide();
    activeButton.setAttribute("aria-pressed", "false");
    activeButton = null;
    touchLocked = false;
  }

  function scheduleOpen(button) {
    clearHoverTimer();
    hoverTimer = setTimeout(() => open(button), 100);
  }

  productButtons.forEach(button => {
    listen(button, "pointerenter", event => {
      if (event.pointerType === "mouse" && !touchLocked) scheduleOpen(button);
    });
    listen(button, "pointerleave", event => {
      if (event.pointerType === "mouse" && !touchLocked && document.activeElement !== button) close(button);
    });
    listen(button, "pointerdown", event => inputType = event.pointerType);
    listen(button, "click", event => {
      if (!["touch", "pen"].includes(inputType)) return;
      event.preventDefault();
      if (activeButton === button) close(button);
      else {
        touchLocked = true;
        open(button);
      }
    });
    listen(button, "focus", () => {
      if (!["touch", "pen"].includes(inputType)) open(button);
    });
    listen(button, "blur", () => queueMicrotask(() => {
      if (!touchLocked && !productButtons.includes(document.activeElement)) close();
    }));
  });

  function fitStage() {
    document.documentElement.style.setProperty("--fit", Math.min(innerWidth / 1600, innerHeight / 900));
  }

  let resizeFrame = 0;
  listen(window, "resize", () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(fitStage);
  });
  listen(window, "keydown", event => {
    inputType = "keyboard";
    if (event.key !== "Escape") return;
    close();
    if (productButtons.includes(document.activeElement)) document.activeElement.blur();
  });
  listen(reducedMotion, "change", () => {
    const selectedButton = activeButton;
    leftPreview.rebuild();
    rightPreview.rebuild();
    if (selectedButton) previewFor(selectedButton).show(+selectedButton.dataset.index);
  });

  fitStage();
  const imageReady = image => image.complete
    ? image.decode().catch(() => {})
    : new Promise(resolve => {
      image.addEventListener("load", resolve, {once: true});
      image.addEventListener("error", resolve, {once: true});
    });
  Promise.all([...document.images].map(imageReady))
    .then(() => document.body.classList.remove("loading"));

  window.__cover = {
    open: index => open(productButtons[index]),
    close: () => close(),
    get active() {
      return activeButton ? +activeButton.dataset.index : null;
    },
  };
  window.addEventListener("pagehide", () => {
    clearHoverTimer();
    cancelAnimationFrame(resizeFrame);
    listeners.abort();
    close();
    disposed = true;
    leftPreview.destroy();
    rightPreview.destroy();
    delete window.__cover;
  }, {once: true});
})();
```
  </file>
  <omitted path="assets/gsap.min.js">provided by the deck chassis or the vendored library index; not part of this sample</omitted>
</sample>
