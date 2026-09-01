<sample id="grid-to-preview" category="composition" variant="mini">
  <file path="samples/composition/grid-to-preview/mini/pages/index.html">
```html
<!doctype html>
<html lang="en">
<head>
 <meta charset="utf-8">
 <meta name="viewport" content="width=device-width,initial-scale=1">
 <title>Domestic Objects</title>
 <link rel="stylesheet" href="assets/style.css">
 <script src="assets/gsap.min.js" defer></script>
 <script src="assets/app.js" defer></script>
</head>
<body>
 <main class="viewport">
 <section class="stage" aria-labelledby="cover-title">
 <h1 id="cover-title">Domestic Objects</h1>
 <div class="composition">
 <ul class="object-grid" aria-label="Domestic objects">
 <li>
 <button class="object" data-product="0" aria-label="Candle holder"
 aria-pressed="false"><img src="media/product-1.webp" alt="Candle holder"></button>
 </li>
 <li><img src="media/product-2.webp" alt="Cow vase"></li>
 <li><img src="media/product-3.webp" alt="Chrome and blue book shelf"></li>
 <li>
 <button class="object" data-product="3"
 aria-label="Wooden sidetable with smoke glass detail"
 aria-pressed="false"><img src="media/product-4.webp" alt="Wooden sidetable"></button>
 </li>
 <li><img src="media/product-5.webp" alt="Yellow armchair"></li>
 <li><img src="media/product-6.webp" alt="Wooden cabinet with fluted glass"></li>
 <li><img src="media/product-7.webp" alt="Orange clock"></li>
 <li><img src="media/product-8.webp" alt="Red chair with chrome legs"></li>
 </ul>
 <div class="preview-grid" aria-hidden="true">
 <article class="preview right" data-product="0" data-affected="2,3,6,7">
 <div class="preview-images">
 <img class="preview-image" src="media/product-1.webp" alt="">
 <img class="preview-image" src="media/product-1-detail-1.webp" alt="">
 <img class="preview-image" src="media/product-1-detail-2.webp" alt="">
 </div>
 <p class="preview-name">Candle holder</p><div class="masked-preview"></div>
 </article>
 <article class="preview left" data-product="3" data-affected="0,1,4,5">
 <div class="preview-images">
 <img class="preview-image" src="media/product-4.webp" alt="">
 <img class="preview-image" src="media/product-4-detail-1.webp" alt="">
 <img class="preview-image" src="media/product-4-detail-2.webp" alt="">
 </div>
 <p class="preview-name">Wooden sidetable with smoke glass detail</p>
 <div class="masked-preview"></div>
 </article>
 </div>
 </div>
 </section>
 </main>
</body>
</html>
```
  </file>
  <file path="samples/composition/grid-to-preview/mini/pages/assets/app.js">
```javascript
(() => {
 "use strict";
 const objectGrid = document.querySelector(".object-grid");
 const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
 const aborter = new AbortController();
 const listen = (target, type, handler, options = {}) =>
 target.addEventListener(type, handler, { ...options, signal: aborter.signal });
 listen(window, "load", () => document.querySelectorAll("img").forEach(image => {
 if (image.naturalWidth) return;
 image.hidden = true;
 image.closest(".preview,li")?.setAttribute("data-error", "true");
 }));
 const gsap = window.gsap;
 if (!gsap) return;
 function crossMask(width, height) {
 const left = 50 - width / 2;
 const right = 50 + width / 2;
 const top = 50 - height / 2;
 const bottom = 50 + height / 2;
 return `polygon(${left}% 0,${right}% 0,${right}% ${top}%,100% ${top}%,` +
 `100% ${bottom}%,${right}% ${bottom}%,${right}% 100%,${left}% 100%,` +
 `${left}% ${bottom}%,0 ${bottom}%,0 ${top}%,${left}% ${top}%)`;
 }
 function createPreview(node) {
 const productId = Number(node.dataset.product);
 const mask = node.querySelector(".masked-preview");
 const width = node.offsetWidth;
 const height = node.offsetHeight;
 const affectedIds = node.dataset.affected.split(",").map(Number);
 const affected = affectedIds.map(index => objectGrid.children[index].firstElementChild);
 const timeline = gsap.timeline({
 paused: true,
 defaults: { duration: .5, ease: "power2.inOut" }
 })
 .to(node, {
 opacity: 1,
 scaleX: (width - 80) / width,
 scaleY: (height - 80) / height,
 transformOrigin: "center center"
 }, 0)
 .to(affected, {
 opacity: 0,
 x: index => index % 2 ? -40 : 40,
 y: index => index < 2 ? 40 : -40
 }, 0)
 .fromTo(mask, {
 clipPath: crossMask(80 / width * 100, 80 / height * 100)
 }, { clipPath: crossMask(0, 0) }, 0);
 return { productId, node, timeline };
 }
 const previews = [...document.querySelectorAll(".preview")].map(createPreview);
 const previewByProduct = new Map(previews.map(preview => [preview.productId, preview]));
 let activeButton = null;
 let pointerType = "keyboard";
 let disposed = false;
 function closePreview() {
 if (!activeButton) return;
 const preview = previewByProduct.get(Number(activeButton.dataset.product));
 preview.node.classList.remove("cycling");
 reducedMotion.matches ? preview.timeline.progress(0).pause() : preview.timeline.reverse();
 activeButton.setAttribute("aria-pressed", "false");
 activeButton = null;
 }
 function openPreview(button) {
 if (disposed || activeButton === button) return;
 closePreview();
 activeButton = button;
 button.setAttribute("aria-pressed", "true");
 const preview = previewByProduct.get(Number(button.dataset.product));
 preview.node.classList.add("cycling");
 reducedMotion.matches ? preview.timeline.progress(1).pause() : preview.timeline.play();
 }
 const buttons = [...objectGrid.querySelectorAll(".object")];
 const buttonFrom = event => event.target.closest?.(".object");
 listen(objectGrid, "pointerover", event => {
 const button = buttonFrom(event);
 if (button && event.pointerType === "mouse") openPreview(button);
 });
 listen(objectGrid, "pointerout", event => {
 const button = buttonFrom(event);
 if (button && event.pointerType === "mouse" && document.activeElement !== button) closePreview();
 });
 listen(objectGrid, "pointerdown", event => pointerType = event.pointerType);
 listen(objectGrid, "click", event => {
 const button = buttonFrom(event);
 if (!button || pointerType !== "touch") return;
 event.preventDefault();
 activeButton === button ? closePreview() : openPreview(button);
 });
 listen(objectGrid, "focusin", event => {
 if (buttonFrom(event) && pointerType !== "touch") openPreview(buttonFrom(event));
 });
 listen(objectGrid, "focusout", () => queueMicrotask(() => {
 if (!buttons.includes(document.activeElement)) closePreview();
 }));
 function fitStage() {
 document.documentElement.style.setProperty(
 "--fit", Math.min(innerWidth / 1600, innerHeight / 900)
 );
 }
 listen(window, "resize", fitStage);
 listen(window, "keydown", event => {
 pointerType = "keyboard";
 if (event.key !== "Escape") return;
 closePreview();
 if (buttons.includes(document.activeElement)) document.activeElement.blur();
 });
 function dispose() {
 if (disposed) return;
 closePreview();
 disposed = true;
 aborter.abort();
 previews.forEach(preview => {
 preview.node.classList.remove("cycling");
 preview.timeline.progress(0).kill();
 });
 }
 listen(window, "pagehide", dispose, { once: true });
 fitStage();
})();
```
  </file>
</sample>
