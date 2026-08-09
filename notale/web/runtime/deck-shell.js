(function () {
  "use strict";

  const frames = () => Array.from(document.querySelectorAll("iframe.notale-slide-frame"));
  const prevButton = () => document.querySelector('[data-deck-action="prev"]');
  const nextButton = () => document.querySelector('[data-deck-action="next"]');
  const overviewButton = () => document.querySelector('[data-deck-action="overview"]');
  const overviewRoot = () => document.querySelector("[data-deck-overview]");
  const overviewScroll = () => document.querySelector("[data-deck-overview-scroll]");
  const overviewGrid = () => document.querySelector("[data-deck-overview-grid]");
  const overviewCount = () => document.querySelector("[data-deck-overview-count]");
  const overviewCloseButton = () => document.querySelector('[data-deck-action="close-overview"]');
  let overviewIntersectionObserver = null;
  let overviewResizeObserver = null;

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

  function isOverviewOpen() {
    return Boolean(overviewRoot() && !overviewRoot().hidden);
  }

  function setOverviewButtonState(open) {
    if (!overviewButton()) return;
    overviewButton().classList.toggle("on", open);
    overviewButton().setAttribute("aria-pressed", String(open));
  }

  function scaleOverviewFrame(preview) {
    const frame = preview && preview.querySelector("iframe.deck-overview-frame");
    if (!frame || !preview.clientWidth) return;
    frame.style.transform = `scale(${preview.clientWidth / 1280})`;
  }

  function loadOverviewFrame(card) {
    const frame = card.querySelector("iframe.deck-overview-frame");
    if (!frame || !frame.dataset.src) return;
    frame.addEventListener("load", () => {
      scaleOverviewFrame(card.querySelector(".deck-overview-preview"));
      send(frame, "notale:ready", { pageId: frame.dataset.pageId || "", overview: true });
      send(frame, "notale:visible", { pageId: frame.dataset.pageId || "", overview: true });
    }, { once: true });
    frame.src = frame.dataset.src;
    delete frame.dataset.src;
    scaleOverviewFrame(card.querySelector(".deck-overview-preview"));
  }

  function teardownOverviewGrid() {
    if (overviewIntersectionObserver) overviewIntersectionObserver.disconnect();
    if (overviewResizeObserver) overviewResizeObserver.disconnect();
    overviewIntersectionObserver = null;
    overviewResizeObserver = null;
    if (overviewGrid()) overviewGrid().replaceChildren();
  }

  function buildOverviewGrid() {
    teardownOverviewGrid();
    const slides = Reveal.getSlides();
    const currentSlide = Reveal.getCurrentSlide();
    if (overviewCount()) overviewCount().textContent = `${slides.length} 页`;

    for (const [index, slide] of slides.entries()) {
      const sourceFrame = slide.querySelector("iframe.notale-slide-frame");
      if (!sourceFrame) continue;
      const pageId = sourceFrame.dataset.pageId || `p${index + 1}`;
      const card = document.createElement("article");
      card.className = "deck-overview-card";
      card.dataset.current = String(slide === currentSlide);
      card.setAttribute("role", "listitem");

      const hit = document.createElement("button");
      hit.type = "button";
      hit.className = "deck-overview-hit";
      hit.setAttribute("aria-label", `前往第 ${index + 1} 页，${pageId}`);
      if (slide === currentSlide) hit.setAttribute("aria-current", "page");
      hit.addEventListener("click", () => {
        const indices = Reveal.getIndices(slide);
        Reveal.slide(indices.h, indices.v);
        closeOverview(false);
      });

      const preview = document.createElement("div");
      preview.className = "deck-overview-preview";
      preview.setAttribute("aria-hidden", "true");
      const frame = document.createElement("iframe");
      frame.className = "deck-overview-frame";
      frame.dataset.pageId = pageId;
      frame.dataset.src = sourceFrame.getAttribute("src") || "";
      frame.setAttribute("sandbox", "allow-scripts");
      frame.setAttribute("loading", "lazy");
      frame.setAttribute("tabindex", "-1");
      frame.setAttribute("aria-hidden", "true");
      preview.appendChild(frame);

      const meta = document.createElement("div");
      meta.className = "deck-overview-meta";
      meta.setAttribute("aria-hidden", "true");
      const number = document.createElement("span");
      number.className = "deck-overview-index";
      number.textContent = String(index + 1).padStart(2, "0");
      const id = document.createElement("span");
      id.textContent = pageId;
      meta.append(number, id);
      card.append(hit, preview, meta);
      overviewGrid().appendChild(card);
    }

    if ("ResizeObserver" in window) {
      overviewResizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) scaleOverviewFrame(entry.target);
      });
      for (const preview of overviewGrid().querySelectorAll(".deck-overview-preview")) {
        overviewResizeObserver.observe(preview);
      }
    }

    const cards = Array.from(overviewGrid().querySelectorAll(".deck-overview-card"));
    if ("IntersectionObserver" in window) {
      overviewIntersectionObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          loadOverviewFrame(entry.target);
          overviewIntersectionObserver.unobserve(entry.target);
        }
      }, { root: overviewScroll(), rootMargin: "320px 0px" });
      for (const card of cards) overviewIntersectionObserver.observe(card);
    } else {
      for (const card of cards) loadOverviewFrame(card);
    }
  }

  function openOverview() {
    if (isOverviewOpen() || !overviewRoot() || !overviewGrid()) return;
    overviewRoot().hidden = false;
    document.documentElement.classList.add("deck-overview-open");
    document.body.classList.add("deck-overview-open");
    const reveal = document.querySelector(".reveal");
    if (reveal) reveal.inert = true;
    const deckBar = document.querySelector(".ppt-bar");
    if (deckBar) deckBar.inert = true;
    setOverviewButtonState(true);
    syncVisibility(null);
    buildOverviewGrid();
    requestAnimationFrame(() => {
      const current = overviewGrid().querySelector('[data-current="true"]');
      if (!current) return;
      current.scrollIntoView({ block: "center" });
      const hit = current.querySelector("button.deck-overview-hit");
      if (hit) hit.focus({ preventScroll: true });
    });
  }

  function closeOverview(restoreFocus = true) {
    if (!isOverviewOpen()) return;
    teardownOverviewGrid();
    overviewRoot().hidden = true;
    document.documentElement.classList.remove("deck-overview-open");
    document.body.classList.remove("deck-overview-open");
    const reveal = document.querySelector(".reveal");
    if (reveal) reveal.inert = false;
    const deckBar = document.querySelector(".ppt-bar");
    if (deckBar) deckBar.inert = false;
    setOverviewButtonState(false);
    syncVisibility(Reveal.getCurrentSlide());
    if (restoreFocus && overviewButton()) overviewButton().focus();
  }

  function toggleOverview() {
    if (isOverviewOpen()) closeOverview();
    else openOverview();
  }

  function handleShellKeydown(event) {
    const target = event.target;
    const editable = target instanceof Element && Boolean(
      target.closest("input, textarea, select, [contenteditable=true]")
    );
    if (editable || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key.toLowerCase() === "o") {
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleOverview();
      return;
    }
    if (!isOverviewOpen()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeOverview();
      return;
    }
    const scroller = overviewScroll();
    const amount = Math.max(80, scroller.clientHeight * 0.82);
    const scrollKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", " "];
    if (!scrollKeys.includes(event.key)) return;
    event.stopImmediatePropagation();
    if (
      event.key === " "
      && target instanceof Element
      && target.matches("button.deck-overview-hit")
    ) return;
    event.preventDefault();
    if (event.key === "ArrowDown") scroller.scrollBy({ top: 80 });
    if (event.key === "ArrowUp") scroller.scrollBy({ top: -80 });
    if (event.key === "PageDown" || event.key === " ") scroller.scrollBy({ top: amount });
    if (event.key === "PageUp") scroller.scrollBy({ top: -amount });
    if (event.key === "Home") scroller.scrollTo({ top: 0 });
    if (event.key === "End") scroller.scrollTo({ top: scroller.scrollHeight });
  }

  function initialize() {
    if (!window.Reveal) {
      document.body.innerHTML = '<main class="notale-runtime-error">Reveal.js runtime failed to load.</main>';
      return;
    }

    document.addEventListener("keydown", handleShellKeydown, true);

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
      overviewButton().setAttribute("aria-pressed", "false");
      overviewButton().addEventListener("click", toggleOverview);
    }
    if (overviewCloseButton()) overviewCloseButton().addEventListener("click", () => closeOverview());
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
