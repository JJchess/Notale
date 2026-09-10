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
