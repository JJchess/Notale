---
name: shape-typography
description: "Create or repair the projected type hierarchy of a Notale interactive lecture. Use for Chinese or mixed-script page titles, teaching copy, labels, legends, controls, formulas, units, and live numeric readouts on a fixed 1600x900 lesson canvas."
---

# Shape Typography

Make every written layer readable from the back of a classroom and visibly tied to its teaching role. Treat type as part of the diagram, not as copy placed after the layout.

## Reference routing

Complete this routing before any page mutation, including `Write`, `Edit`, `Patch`, or a modifying `Bash` command:

1. Read [projected-type-system.md](references/projected-type-system.md).
2. Also read [cjk-numeric-math.md](references/cjk-numeric-math.md) when the page mixes Chinese with Latin terms, abbreviations, measurements, formulas, coordinates, or changing values.
3. Do not load unrelated references.

## Preserve the Notale contract

- Work on the fixed `1600x900` stage and evaluate the scaled projected result, not only a browser at arm's length.
- Preserve theme tokens, semantic colors, supplied copy, equations, citations, and the shared page contract.
- Use local/system fonts already available to the build. Do not add CDN font requests.
- Keep body and sentence-like explanatory text at least `16px`, controls/legends/captions/hints at least `14px`, numeric ticks at least `12px`, and multiline line-height at least `1.35`.
- Shorten, regroup, or split content before violating those floors.
- Do not turn a lecture page into editorial or marketing typography; prioritize explanation, comparison, and live state.

## Workflow

### 1. Inventory text by teaching role

Classify every visible string before assigning a size:

- page claim or question;
- section heading;
- lead explanation;
- supporting sentence;
- diagram label or annotation;
- control label and action;
- legend or caption;
- live number, unit, formula, axis, or tick;
- source note or uncertainty qualifier.

Remove decorative labels that merely repeat position or section order. Rewrite long interface copy as a direct action or observation while preserving factual meaning.

### 2. Establish a role-based scale

Define a small set of shared tokens with names that describe function, not arbitrary steps. Start with the projected type ranges, then adjust upward for younger audiences, long viewing distance, or weak projection.

Use no more than:

- one display role for the page claim;
- one body family for Chinese and prose;
- one numeric/utility family when tabular values or code-like notation justify it.

Prefer weights, width, position, and controlled contrast over many font sizes. Do not use tiny uppercase labels or wide tracking as a universal section marker.

### 3. Shape the page claim

- Keep a page title or question to one line when possible and two lines at most.
- Break at semantic boundaries; keep verbs with their objects and numbers with units.
- Let the title's width and the main visual negotiate space together. Do not set an oversized title and squeeze the explanatory visual afterward.
- Use the subject's vocabulary plainly. Remove filler such as “接下来我们将” or “如图所示.”
- Emphasize at most one meaningful phrase with weight, color, or a family variant; do not inject a decorative second family into one headline.

### 4. Shape Chinese, Latin, numbers, and formulas

- Keep Chinese body tracking near normal. Avoid letter-spacing used to manufacture sophistication.
- Keep paragraph line lengths compact enough to scan while watching the visual; prefer roughly `18–32` Han characters per line for sustained explanation.
- Use tabular figures for changing values and aligned comparisons.
- Keep a number and its unit in one visual group; distinguish their scale without detaching their meaning.
- Align formulas by relation or baseline, not by bounding-box center.
- Give subscripts, superscripts, minus signs, decimal points, Greek symbols, and CJK punctuation enough vertical and horizontal clearance.
- Use monospace only for numbers, coordinates, code, or a genuine instrument readout—not for normal Chinese paragraphs.

### 5. Attach words to the visual

- Place labels close to the feature they identify and align them to a shared label lane when several compete.
- Keep leader lines from crossing glyphs. Give overlaid labels a quiet local backing rather than a heavy card.
- Keep legend order consistent with spatial order in the diagram.
- Place controls and their live values in the same reading neighborhood.
- Keep annotations shorter than prose; move explanation into a lead or state-dependent note when a label exceeds two lines.
- Reserve muted color for secondary information, never for text that the learner must read to answer the page's question.

### 6. Implement stable text behavior

- Define and consume shared `--fs-*` role tokens in the theme instead of scattering one-off sizes.
- Add sensible fallback stacks for CJK coverage; keep the fallback's apparent size close to the primary face.
- Use `font-variant-numeric: tabular-nums` or an equivalent font feature on changing and aligned numbers.
- Constrain text boxes explicitly enough that intentional line breaks remain stable.
- Avoid transforms for fitting type; transforms distort focus outlines and do not repair layout measurements.
- Keep button and control labels on one line when their action is short; never abbreviate a teaching term until it becomes ambiguous.

### 7. Review under projection constraints

Render at `1600x900` and inspect a reduced 16:9 preview. Read every visible string, including initial, selected, feedback, error, and reduced-motion states.
Preserve the page's working scaffold asset paths while reshaping the document; typography work does not justify moving or breaking shared CSS and script wiring.

Check that:

- the page claim, visual, and live state form an obvious reading order;
- all text meets the role floors and multiline leading requirement;
- the longest real strings fit without clipping, overlap, or accidental ellipsis;
- labels remain legible over the busiest image or animation frame;
- numbers do not shift when values change and units remain attached;
- Chinese punctuation, Latin words, formulas, and emphasis do not create awkward gaps;
- no low-contrast muted text carries essential teaching information.

When text does not fit, revise in this order: remove repetition, rewrite more directly, widen the text region, rebalance neighboring regions, split the state/page, then reduce within the allowed role range. Never solve overflow by hiding it.
Treat any Render resource, JavaScript, clipping, or overflow failure as unfinished work; repair it and Render again.

## Deliverable

Return the requested artifact with a documented type-role mapping and all visible states implemented. When only a typography specification is requested, provide the font stacks, role tokens, weights, line heights, widths, numeric behavior, and line-break rules so another agent can apply them without inventing a new scale.
