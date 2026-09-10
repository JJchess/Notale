---
name: get-illustration
description: "Generate and integrate one explanatory illustration (atmosphere, setting, material). Not for data or precise geometry."
---

# Generate Illustration

Use generated pixels for visual context, never as the source of an exact answer.

## Reference routing

Before the first generation script run or page mutation—including `Write`, `Edit`, `Patch`, or a modifying `Bash` command—read [prompt-and-integration.md](references/prompt-and-integration.md). Do not load unrelated references.

## 1. Decide whether generation is valid

Classify the requested image before prompting:

- Use a real reference for a named person, event, place, specimen, artifact, or instrument.
- Use HTML, SVG, canvas, or a charting library for labels, quantities, mechanisms, sequences, and exact geometry.
- Generate only atmosphere, material, setting, metaphor, or a stylized object whose details are not claims.

If the image would still teach the right thing after small visual inaccuracies, generation is suitable. Otherwise choose a deterministic representation.

## 2. Reserve the composition

Decide the crop, subject position, empty copy area, light direction, and bottom-right exclusion zone before writing the prompt. Generated images carry an `AI生成` mark; keep critical content away from that corner.

For a set of pages, freeze a treatment clause covering palette, lighting, camera distance, texture, and stylization. Repeat that clause verbatim across prompts.

## 3. Generate a small spread

Write the prompt in this order: subject, framing, treatment, background, exclusions. Always exclude text, labels, logos, diagrams, and extra subjects.

```bash
python3 <skill-dir>/scripts/gen.py \
  "wide lunar habitat workbench, subject on left, empty dark area on right, \
  restrained documentary illustration, cool side light, no people, no text, no labels, no logos" \
  --out assets/img/lunar-workbench.png --n 2
```

Use 2048×1152 by default. Do not request fewer than 921,600 pixels. Generate two variants when framing is uncertain; do not produce a large unreviewed batch.

## 4. Inspect and integrate

Open every result at full page crop. Reject stray text, wrong objects, misleading anatomy, inconsistent treatment, unusable empty space, or a focal subject hidden by the UI.

Place all teaching labels, values, arrows, legends, and formulas in accessible page code above the image. Keep the original prompt log beside the output. Use meaningful alt text that states the visual role without pretending invented detail is evidence.

## 5. Verify the delivered page

Open the page locally and confirm the asset loads, the crop survives the 1600×900 composition, foreground text remains readable, and the `AI生成` marker is not obscured. Regenerate rather than patching a fundamentally wrong image.
