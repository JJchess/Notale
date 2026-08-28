# Set Visual Direction

Create a visual world that helps explain the lesson. Treat the lecture subject, audience, projection conditions, and available media as the source of the design; do not turn the page into a generic product landing page.

The subject, the audience, and the setting are stated at the top of this prompt — read them as the design brief. Resolve missing aesthetic details from them and commit to a justified choice; there is no second call in which to ask.

Optimize for a classroom projector: make the hierarchy survive lower contrast, ambient light, scaling, and viewing from the back of the room. Keep the first frame informative. Let decoration remain behind the lesson and ignore pointer input.

## 1. Write a one-sentence direction thesis

State the visual world as:

`<subject source> expressed through <material/light/geometry>, so <audience> can perceive <teaching relationship>.`

Reject a thesis made only from mood words such as “premium,” “futuristic,” or “beautiful.” Name something observable from the subject.

## 2. Commit the visual system

Define a compact direction contract before coding:

1. **Palette:** choose a background family, readable text, neutrals, and only the semantic hues the lesson needs.
2. **Material:** choose one surface logic such as paper, instrument glass, field notebook, engraved metal, specimen tray, or plain flat color. Use one material family across the deck — vary elevation or opacity, not the underlying metaphor.
3. **Geometry:** choose one edge/radius and line-weight family. Reuse it across panels, controls, and diagrams.
4. **Type roles:** name display, body, and optional numeric/utility roles; leave detailed per-page shaping (line length, CJK/Latin/number mixing, label attachment) to the page's own build workflow. Source distinctive fonts (Google Fonts, Fontshare, or another already-installed family) rather than defaulting to Inter, Roboto, Arial, or the system font stack — reserve a monospace/system look for a deliberate technical-instrument direction, not as the fallback when nothing else was chosen.
5. **Signature:** choose one memorable visual device that embodies the topic, not a decorative effect pasted over it.
6. **Media:** define crop, contrast, tint, annotation, and attribution behavior.
7. **Motion:** state what motion communicates, or explicitly choose a static direction.

## 3. Build the palette from roles

1. Sample a background family from the subject or a supplied image.
2. Choose text and quiet-line values that remain distinct after reducing contrast.
3. Assign color only to concepts that recur or must be compared.
4. Use one accent when the lesson has one focal state; use multiple hues only for stable categories with a visible legend.
5. Keep warm and cool neutrals from drifting across pages.
6. Avoid invented precision: do not imply laboratory or statistical authority through arbitrary readouts or colors.

Keep the set restrained: a stage field, projected text, secondary text, structural rules, keyboard focus, and one named token per lesson meaning that actually recurs.

Encode roles rather than raw appearance: use names such as `--cause`, `--observed`, or `--uncertain`, not `--blue-1` when color carries meaning.

## 4. Allocate visual emphasis

- Spend boldness on the explanatory visual or one signature element, not on every surface.
- Keep the page in one light/dark family; permit one deliberate inversion only when it encodes a real transition.
- Remove an effect if it competes with labels, diagram edges, controls, or the lecturer's pointing target.
- Commit to a decorative effect only after the explanatory visual, type, and controls already work without it.
- Keep shadows tinted to the surface family and quiet enough for projection.
- Make focus, selected, disabled, and reduced-motion states part of the same material language.
- Keep one-off spectacle in the page implementation; do not pollute the shared theme with a single page's effect.

## 5. Choose a signature that teaches

A strong signature is both memorable and useful:

- let a lung cross-section become the control and the explanation;
- let tectonic strata form the page's bands and reveal order;
- let a lever or circuit route labels through the real force/current path;
- let archival annotations connect a claim to its primary-source evidence;
- let an uncertainty band expand as assumptions change.

Reject signatures that survive unchanged when the topic changes. A glowing orb, generic grid, floating particles, three equal cards, or a large decorative number is not a direction by itself.

## 6. Direction contract template

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
