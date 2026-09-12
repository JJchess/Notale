export interface DeckOptions { index?: number; total?: number; initialStep?: number }

type StepListener = (step: number) => void;
const listeners = new Set<StepListener>();
let currentStep = 0;
let maximumStep = 0;
let initialized = false;

function discoverMaximum(): number {
  return Math.max(0, ...Array.from(document.querySelectorAll<HTMLElement>("[data-deck-step]"), (node) => Number(node.dataset.deckStep) || 0));
}

function render(): void {
  for (const node of document.querySelectorAll<HTMLElement>("[data-deck-step]")) {
    const visible = (Number(node.dataset.deckStep) || 0) <= currentStep;
    node.toggleAttribute("hidden", !visible);
    node.setAttribute("aria-hidden", String(!visible));
  }
  document.documentElement.dataset.deckStep = String(currentStep);
  for (const listener of listeners) listener(currentStep);
  dispatchEvent(new CustomEvent("notale:step", { detail: { step: currentStep, maximum: maximumStep } }));
  parent.postMessage({ type: "notale:step", step: currentStep, maximum: maximumStep }, "*");
}

function setStep(value: number): number {
  currentStep = Math.max(0, Math.min(maximumStep, Math.trunc(value)));
  render();
  return currentStep;
}

export const Deck = {
  init(options: DeckOptions = {}) {
    maximumStep = discoverMaximum();
    setStep(options.initialStep ?? 0);
    initialized = true;
    document.documentElement.dataset.ready = "true";
    parent.postMessage({ type: "notale:ready", page: options.index, total: options.total, steps: maximumStep }, "*");
    return Deck;
  },
  next: () => setStep(currentStep + 1),
  previous: () => setStep(currentStep - 1),
  setStep,
  getState: () => ({ step: currentStep, maximum: maximumStep }),
  onStep(listener: StepListener) { listeners.add(listener); return () => listeners.delete(listener); },
  token(name: string) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); },
};

declare global { interface Window { Deck: typeof Deck } }
window.Deck = Deck;

addEventListener("message", (event) => {
  if (event.data?.type === "notale:set-step" && Number.isFinite(event.data.step)) setStep(event.data.step);
});
addEventListener("keydown", (event) => {
  if (event.defaultPrevented || /INPUT|TEXTAREA|SELECT/.test((event.target as Element | null)?.tagName ?? "")) return;
  if (["ArrowRight", "PageDown"].includes(event.key) && currentStep < maximumStep) { event.preventDefault(); Deck.next(); }
  if (["ArrowLeft", "PageUp"].includes(event.key) && currentStep > 0) { event.preventDefault(); Deck.previous(); }
});
addEventListener("DOMContentLoaded", () => { if (!initialized) Deck.init(); });
