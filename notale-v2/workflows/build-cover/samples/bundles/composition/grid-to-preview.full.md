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
</sample>
