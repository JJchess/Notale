# CJK, numeric, and formula shaping

Read this reference for mixed Chinese/Latin content, units, live values, axes, and formulas.

## Chinese text

- Use normal tracking for body text. If a short display title needs spacing, keep the adjustment subtle and inspect punctuation.
- Keep opening punctuation from hanging alone at a line end and closing punctuation from starting a new line.
- Avoid a final line containing only one or two characters. Rewrite or adjust the text box before tightening type.
- Break parallel statements at equivalent syntactic points so a comparison scans evenly.
- Keep technical terms intact. Introduce an abbreviation once before using it alone.
- Prefer sentence case for Latin terms embedded in Chinese unless the official name requires capitals.

## Numbers and units

- Group number and unit with a nonbreaking space or one inline wrapper: `37&nbsp;°C`, `12.4 km`, `3.2×`.
- Use a true minus sign `−` for signed values and an en dash only for a range when appropriate.
- Use `font-variant-numeric: tabular-nums` for live values, tables, axes, and side-by-side comparisons.
- Reserve monospaced type for fields where alignment matters; proportional numbers are often better inside prose.
- Align decimals when values are compared. Keep precision consistent and justified by the data.
- Do not fabricate decimal precision or measurements for visual texture.
- Make the unit smaller than a hero value only when they remain one group and the unit stays above the label floor.

Useful pattern:

```css
.reading {
  display: inline-flex;
  align-items: baseline;
  gap: .22em;
  font-variant-numeric: tabular-nums lining-nums;
}
.reading__value { font-family: var(--font-num); font-size: var(--fs-value); }
.reading__unit { font-size: var(--fs-label); }
```

## Formulas and symbols

- Align a sequence of equations at `=` or another shared relation sign.
- Keep variables visually distinct from explanatory Chinese, but do not style every symbol as code.
- Give subscripts and superscripts enough line box height; inspect clipping at the container edges.
- Use proper symbols (`×`, `·`, `−`, `≈`, `≤`, `≥`) instead of ambiguous ASCII substitutes where the lesson requires mathematical meaning.
- Keep formula definitions close to the formula. Put longer derivations in a dedicated region or progressive state.
- Add a text alternative for a formula rendered only in canvas/SVG.
- Avoid centering mixed equations solely by their bounding boxes when aligned relations communicate structure better.

## Axes, legends, and controls

- Keep axis labels in the body/label family and ticks in the numeric role.
- Match legend order to the diagram's spatial or semantic order.
- Use complete terms on controls; do not make a learner decode an abbreviation to operate the model.
- Keep live readouts from reflowing the control cluster by reserving width for the longest valid value.
- Test negative values, maximum precision, long category names, and feedback text rather than only the initial state.
