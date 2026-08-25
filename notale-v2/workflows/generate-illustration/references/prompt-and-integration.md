# Prompt and integration reference

## Prompt grammar

Use one concrete clause for each decision:

1. **Subject:** what exists in the frame.
2. **Framing:** wide/close, viewpoint, subject position, empty region.
3. **Treatment:** documentary illustration, cut-paper, ink, matte 3D, or another justified medium.
4. **Light and palette:** direction, contrast, temperature, restrained palette.
5. **Background:** spatial context and desired complexity.
6. **Exclusions:** no text, labels, logos, diagrams, watermark requests, or surplus subjects.

Avoid mood-only prompts. Replace “futuristic, stunning, cinematic” with observable choices.

## Exact-information boundary

Never ask the image model to render:

- labels or readable prose;
- formulas, axes, scales, or quantities;
- a correct mechanism or ordered process;
- an identifiable historical event as if it were a photograph;
- anatomy whose exact structure is the lesson.

Build those layers in DOM/SVG/canvas and keep them independently editable.

## Integration checklist

- Preserve aspect ratio and intended focal point.
- Put readable overlays on a controlled contrast layer rather than directly on noisy pixels.
- Keep the bottom-right generated-content mark visible.
- Store prompt, model, size, and file name in the generated manifest.
- Use the same treatment clause for a coherent series.
- Reject rather than retouch an image whose subject or composition is wrong.

