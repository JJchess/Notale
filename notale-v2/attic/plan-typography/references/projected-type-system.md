# Projected type system

Read this reference when defining or auditing the shared type tokens for a Notale lecture.

## Recommended role ranges

These are projected-canvas starting ranges, not browser UI defaults. Never go below the hard floors in the skill.

| Role | Starting range | Line height | Typical use |
|---|---:|---:|---|
| Page claim `--fs-h1` | `34–44px` | `1.08–1.2` | one- or two-line question/claim |
| Section heading `--fs-h2` | `22–28px` | `1.15–1.3` | named region or comparison dimension |
| Lead `--fs-lead` | `19–23px` | `1.35–1.5` | principal explanatory sentence |
| Body `--fs-body` | `17–20px` | `1.45–1.65` | sustained explanation |
| Secondary sentence `--fs-sec` | `16–18px` | `1.4–1.6` | limitation, evidence note, feedback |
| Label `--fs-label` | `14–17px` | `1.3–1.45` | controls, annotations, legends, captions |
| Numeric tick `--fs-tick` | `12–14px` | `1.2–1.35` | digits/symbols only, never prose |
| Big live value `--fs-value` | `30–64px` | `1` | one changing result or comparison value |

Increase body, labels, and controls first when the room is large. Oversizing the title while leaving the explanatory text small does not improve projection readability.

## Family strategy

- Prefer a body family with complete Simplified Chinese glyphs and clear punctuation.
- Let the display role use the body family's stronger width/weight when a distinct display face has incomplete CJK coverage.
- Add a utility/mono face only for aligned numbers, coordinates, formulas, or code.
- Keep the stack short and stable. Test the actual fallback rather than naming a font that is not installed.

Example structure:

```css
:root {
  --font-sans: "Noto Sans SC", "Source Han Sans SC", system-ui, sans-serif;
  --font-display: var(--font-sans);
  --font-num: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
  --fs-h1: 38px;
  --fs-h2: 24px;
  --fs-lead: 20px;
  --fs-body: 18px;
  --fs-sec: 16px;
  --fs-label: 15px;
  --fs-tick: 13px;
}
```

Replace unavailable font names; do not fetch them remotely.

## Hierarchy rules

- Use no more than four perceptible text weights on one page.
- Keep body weight regular or medium enough to survive projector washout.
- Signal primary hierarchy with size and position; use color only when it also carries lesson meaning.
- Keep essential text at high contrast. Secondary text may be quieter but must remain readable.
- Avoid all-caps English labels above every heading. Use a label only when it names a real variable, category, source, or state.
- Avoid long italic passages. Italic CJK fallback varies and often becomes less readable at distance.
- Keep underlines for links or a specific annotation convention, not general emphasis.

## Fit discipline

- Keep sustained Chinese prose near `18–32` characters per line.
- Keep title blocks to one or two lines and explanatory annotations to one or two short lines.
- Keep a control label and its control visibly paired.
- Set explicit max widths based on the composition; do not rely on arbitrary `<br>` tags to repair a fluid box.
- If an intentional title break is necessary, place it at a semantic boundary and test it with the actual font.

## Projection review

Inspect full size, a reduced preview, and a low-contrast simulation. Verify thin strokes, punctuation, muted text, and labels over imagery. Prefer slightly larger text and fewer words to heavier shadows, outlines, or glows.
