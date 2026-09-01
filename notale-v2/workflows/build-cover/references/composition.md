# Authored Cover Composition

The representative still must read as a complete cover rather than a miniature content page. HTML, SVG, Canvas, supplied media, and restrained motion may support that frame, but none replaces its authored composition.

## Convert the brief into a frame

Write a compact frame specification before styling:

| Decision | Required answer |
|---|---|
| Subject cue | What concrete object, material, process, place, or gesture makes the topic recognizable? |
| Protagonist | What receives attention first? Choose one object, figure, word, or spatial event. |
| Supporting evidence | Which zero to three elements make the protagonist meaningful? |
| Gaze path | In what order should the eye encounter protagonist, title, and supporting cue? |
| Title field | Which quiet region remains readable at every supported crop? |
| Crop policy | What may crop, what must remain complete, and where is the focal anchor? |
| Representative frame | Which exact still should survive thumbnails, capture, and reduced motion? |
| Motion role | What may drift, settle, or respond without changing the cover's identity? |

If the subject is abstract, turn it into a process verb before choosing imagery: branching, compressing, orbiting, dissolving, accumulating, separating, translating. Show the process through one concrete system instead of collecting symbolic icons.

## Pass the single-frame test

A strong cover frame has:

- one concrete protagonist;
- no more than three simultaneously active supporting elements;
- one legible gaze path;
- one quiet title field;
- one characteristic subject cue that would not fit an unrelated topic.

When a new element becomes active, subordinate, dim, crop, or remove an old one. Do not solve weak hierarchy by adding more glow, blur, labels, or decorative particles.

Test the frame in grayscale and at thumbnail size before refining it. If the protagonist and title field disappear, repair scale and placement rather than color.

## Build a subject-specific visual world

Resolve color and typography from the supplied theme, then derive the rest of the visual language from the subject:

- **silhouette:** make the protagonist recognizable from its functional outline before adding detail;
- **geometry:** borrow ratios, paths, cross-sections, tools, notation, or spatial behavior that belong to the subject;
- **material:** choose one texture vocabulary—hatching, stipple, fibers, strata, traces, facets, or particles—because it matches the subject;
- **semantic roles:** use theme colors consistently for field, structure, protagonist, secondary cue, and exception;
- **signature detail:** add one small but memorable event that could not be transferred unchanged to an unrelated cover.

Use a continuous gradient only for a continuous physical or spatial property such as heat, depth, density, or illumination. Use discrete theme roles for categories and states. Texture should come from repeatable marks or material logic, not from a blur/noise overlay that hides weak geometry.

## Lay out by occupied regions

Describe the composition as proportions before pixels. Record approximate bounds for:

- protagonist;
- title and subtitle;
- supporting cue;
- intentional empty space;
- crop reserve outside the focal region.

Use foreground, middle ground, and background only when depth helps the gaze path. A flat composition can be stronger. If layers exist, assign each a role:

- background establishes field, scale, or atmosphere;
- middle ground carries the governing structure;
- foreground creates entry, framing, or controlled occlusion.

Do not let every layer carry equal contrast or detail. Preserve the strongest edge, color contrast, or scale change for the protagonist or title.

## Integrate the title

- Place the title in designed negative space, not over the least inconvenient part of a busy image.
- Treat line breaks as composition. Break on semantic phrases and test the longest real title.
- Keep title, subtitle, and metadata in distinct roles; do not add labels merely to fill space.
- Let type share one property with the subject world—proportion, rhythm, material, alignment, or motion—without imitating it literally.
- Keep authored text in DOM or SVG. Canvas text is acceptable only when text itself belongs to the rendered image and an accessible equivalent exists.
- Protect the title field with contrast and spatial quiet before using shadows, outlines, or backdrop blur.

## Give the frame controlled life

Motion remains subordinate to the composition. Use it to maintain presence, clarify depth, or acknowledge entry—not to create a second narrative.

- Choose at most one ambient behavior for the field and one settling response for the protagonist.
- Vary speed by layer: the protagonist or governing structure moves least after settling; peripheral material may drift more slowly.
- Prefer CSS transitions or Web Animations for a few DOM/SVG tracks. Use one Canvas clock when drawn material must evolve.
- Animate theme-neutral properties such as transform, clip, stroke progress, opacity, density, or local displacement; do not animate the title continuously.
- Define `initial`, `settled`, and `reduced` states. Replay cancels owned animations before returning to `initial`.
- Under reduced motion, render the representative still immediately. Stop nonessential loops while hidden and on teardown.

If understanding requires watching a setup and payoff, strengthen the representative still until its identity survives without that transition.

## Build in four passes

1. **Thumbnail:** block only protagonist, title field, and gaze direction in grayscale.
2. **Geometry:** fix occupied regions, crop behavior, depth, and actual title line breaks.
3. **Material:** assign theme color roles, then derive texture, stroke, and lighting from the subject cue.
4. **Subtraction:** remove the weakest supporting element and restore it only if the subject becomes less legible.

Judge each pass at the target aspect ratio and at the narrowest supported crop. Avoid polishing a composition that has not passed the thumbnail test.

## Diagnose weak covers

| Failure | Cause | Repair |
|---|---|---|
| Poster collage | Several motifs compete as protagonists | Choose the motif that best names the subject; subordinate or delete the rest |
| Title pasted on top | No title field was reserved | Move the visual mass or redesign its silhouette around the title |
| Generic atmosphere | Palette and effects could fit any topic | Replace one decorative motif with a characteristic material, tool, or process |
| Abstract icon soup | Nouns were illustrated independently | Choose one process verb and show its transformation in a single system |
| False emptiness | Large unused area has no tension or direction | Let an edge, gaze, trajectory, or scale relationship activate the empty field |
| Accidental crop | Responsive behavior was left to overflow | Name the focal anchor and define what may crop at each boundary |
| Annotation page | Explanatory labels compete with the title | Move the explanation to a page; retain only the subject cue |

## Verify the representative still

- The exact title is readable without a protective effect doing all the work.
- The protagonist is recognizable at full size and thumbnail size.
- The gaze path reaches the title without crossing several equal-strength focal points.
- The frame still works in grayscale and under the narrowest supported crop.
- The opening and settled frames preserve the same protagonist, title field, and hierarchy when restrained motion exists.
- No decorative element could be removed without changing nothing.
- The frame establishes the subject or register without attempting to explain the whole lesson.
