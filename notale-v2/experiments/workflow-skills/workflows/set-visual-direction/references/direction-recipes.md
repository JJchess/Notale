# Subject-led direction recipes

Read this reference when the brief gives content but no usable art direction. Select one row as a starting vocabulary, then replace generic nouns with details from the actual lesson.

## Direction families

| Lesson world | Material and geometry | Useful signature | Keep quiet | Common failure |
|---|---|---|---|---|
| Biology and ecology | specimen paper, membrane layers, branching paths, field labels | one organism/system whose parts reveal or react | surrounding controls and metadata | decorating everything with leaves or green gradients |
| Chemistry and materials | bench glass, calibrated vessels, molecular bonds, phase boundaries | one transformation chamber with observable before/after states | containers not involved in the reaction | neon “lab” styling with no measured relationship |
| Physics and engineering | instrument panels, ruled axes, cutaway parts, force paths | one manipulable apparatus or annotated mechanism | panels that do not report a value | adding sci-fi grids and gauges unrelated to the model |
| Earth and climate | strata, contour lines, transects, time bands, sampled maps | one spatial cross-section tied to measured change | legends and source notes | using a cinematic planet as background when scale is the lesson |
| Astronomy | observation field, orbital geometry, spectral bands, calibrated darkness | one scale or motion contrast the learner can manipulate | chrome, glass, and glow | filling empty space with stars until labels disappear |
| History and humanities | archival paper, marginalia, timelines, maps, material artifacts | one primary source placed against a visible claim/evidence structure | transcription and citations | sepia decoration without evidentiary structure |
| Society and statistics | civic documents, ledgers, connected cases, measured distributions | one population pattern that changes with assumptions | explanatory prose | dashboard chrome that makes mock values look authoritative |

## Build the palette from roles

1. Sample a background family from the subject or a supplied image.
2. Choose text and quiet-line values that remain distinct after reducing contrast.
3. Assign color only to concepts that recur or must be compared.
4. Use one accent when the lesson has one focal state; use multiple hues only for stable categories with a visible legend.
5. Keep warm and cool neutrals from drifting across pages.
6. Avoid invented precision: do not imply laboratory or statistical authority through arbitrary readouts or colors.

Prefer a restrained token set:

```css
:root {
  --bg: /* stage field */;
  --text: /* primary projected text */;
  --muted: /* secondary text */;
  --line: /* structural rules */;
  --focus: /* keyboard focus */;
  --concept-a: /* named lesson meaning */;
  --concept-b: /* only when the lesson needs it */;
}
```

## Choose a signature that teaches

A strong signature is both memorable and useful:

- let a lung cross-section become the control and the explanation;
- let tectonic strata form the page's bands and reveal order;
- let a lever or circuit route labels through the real force/current path;
- let archival annotations connect a claim to its primary-source evidence;
- let an uncertainty band expand as assumptions change.

Reject signatures that survive unchanged when the topic changes. A glowing orb, generic grid, floating particles, three equal cards, or a large decorative number is not a direction by itself.

## Direction contract template

```text
Thesis: <subject source> through <visual mechanism>, revealing <relationship>.
Palette: <token → lesson meaning>; neutrals: <family>; projector strategy: <contrast choice>.
Material: <one material> with <edge/light behavior>.
Geometry: <radius/cut/line rule>.
Type roles: <display>; <body>; <numeric/utility if required>.
Signature: <one teaching device>.
Media: <crop/tint/annotation rule>.
Motion: <communication purpose and reduced-motion still> or static.
```

Use this contract as a constraint during implementation, not as prose to display on the page.
