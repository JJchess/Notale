(function () {
  "use strict";

  const frames = () => Array.from(document.querySelectorAll("iframe.notale-slide-frame"));
  const prevButton = () => document.querySelector('[data-deck-action="prev"]');
  const nextButton = () => document.querySelector('[data-deck-action="next"]');
  const overviewButton = () => document.querySelector('[data-deck-action="overview"]');

  function send(frame, type, detail) {
    if (frame && frame.contentWindow) {
      frame.contentWindow.postMessage({ source: "notale-deck", type, detail: detail || {} }, "*");
    }
  }

  function syncVisibility(currentSlide) {
    for (const frame of frames()) {
      const visible = frame.closest("section") === currentSlide;
      send(frame, visible ? "notale:visible" : "notale:hidden", {
        pageId: frame.dataset.pageId || "",
      });
    }
  }

  function syncDeckBar() {
    const indices = Reveal.getIndices();
    const total = Reveal.getTotalSlides();
    const current = Reveal.getSlidePastCount() + 1;
    if (prevButton()) prevButton().disabled = indices.h === 0 && indices.v === 0;
    if (nextButton()) nextButton().disabled = current >= total;
  }

  function initialize() {
    if (!window.Reveal) {
      document.body.innerHTML = '<main class="notale-runtime-error">Reveal.js runtime failed to load.</main>';
      return;
    }

    Reveal.initialize({
      hash: true,
      hashOneBasedIndex: true,
      slideNumber: "c/t",
      controls: false,
      progress: true,
      center: false,
      transition: "slide",
      backgroundTransition: "fade",
      width: 1280,
      height: 720,
      margin: 0,
      viewDistance: 3,
      plugins: window.RevealNotes ? [RevealNotes] : [],
    });

    Reveal.on("ready", (event) => {
      for (const frame of frames()) send(frame, "notale:ready", { pageId: frame.dataset.pageId || "" });
      syncVisibility(event.currentSlide);
      syncDeckBar();
    });
    Reveal.on("slidechanged", (event) => {
      syncVisibility(event.currentSlide);
      syncDeckBar();
    });
    if (prevButton()) prevButton().addEventListener("click", () => Reveal.prev());
    if (nextButton()) nextButton().addEventListener("click", () => Reveal.next());
    if (overviewButton()) {
      overviewButton().addEventListener("click", () => {
        Reveal.toggleOverview();
        overviewButton().classList.toggle("on", Reveal.isOverview());
      });
      Reveal.on("overviewshown", () => overviewButton().classList.add("on"));
      Reveal.on("overviewhidden", () => overviewButton().classList.remove("on"));
    }
    window.addEventListener("resize", () => {
      for (const frame of frames()) send(frame, "notale:resize", { width: innerWidth, height: innerHeight });
    });
  }

  window.addEventListener("message", (event) => {
    const data = event.data || {};
    if (data.source !== "notale-slide") return;
    if (data.type === "notale:error") {
      console.error("[notale slide]", data.message || "page runtime error");
      return;
    }
    if (data.type !== "notale:navigate" || !window.Reveal) return;
    if (data.direction === "next") Reveal.next();
    if (data.direction === "prev") Reveal.prev();
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
})();
