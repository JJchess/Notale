import type { PresentationView } from "./controller";
/** Preview the same destination that advancing the presentation will choose. */
export function upcoming(view: PresentationView) {
  const { state, slides, snapshot } = view;
  if (!state || state.ended) return;
  const index = slides.findIndex((slide) => slide.id === state.slideId),
    current = slides[index];
  if (!current) return;
  if (state.step < state.max) return { slide: current, step: state.step + 1 };
  const next =
    slides[index + 1] ??
    (snapshot?.document.presentation.loop ? slides[0] : undefined);
  return next ? { slide: next, step: 0 } : undefined;
}
