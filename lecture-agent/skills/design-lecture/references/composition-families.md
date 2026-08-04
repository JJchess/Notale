# Composition family contracts

Coordinates are compiled after block and asset generation on a 12×12 artboard. Treat spans as half-open boundaries from 1 through 13. Keep the title in an explicit safe region; overlap only a clipped, lower-z feature/background or a decoration.

| Family | Spatial signature | Use when | Positive test | Failure test |
|---|---|---|---|---|
| `full-bleed-hero` | Edge-to-edge feature; title occupies one quiet quadrant | Open with one proposition or context | Squinting reveals one dominant promise | Body cards compete with the title |
| `text-over-image` | Background feature; text stays inside the opposite safe zone | Image establishes place, object, or mood | Subject and text remain independently readable | Text crosses the subject or lacks overlay contrast |
| `cutout-split` | Isolated subject and compact text column share one axis | A person/object is compared with an explanation | Cutout edge creates the division | Two generic cards merely sit side by side |
| `annotated-specimen` | Central faithful object; small callouts sit on outer rails | Labels explain visible parts or evidence | Every callout points to something observable | Callouts become detached mini-essays |
| `focal-object` | One centered anchor with a subordinate relationship rail | One construct organizes a few relationships | The eye lands on the object before prose | Several equal objects erase the focal hierarchy |
| `process-path` | Ordered horizontal stages with a visible direction | Static stages or causes must be read in order | Order remains clear without paragraph text | Dynamic states are frozen instead of using sim |
| `before-after` | Two staggered states with a shared change axis | Change itself is the evidence | Changed marks align and can be scanned together | States are shown sequentially rather than together |
| `comparison` | Balanced parallel fields in the first frame | Alternatives require equal inspection | Labels, scale, and baseline are comparable | One side is visually privileged without reason |
| `experiment-setup` | Apparatus/phenomenon dominates; variables and method occupy a rail | Manipulation, measurement, and output must connect | Variable → apparatus → measurement is traceable | Decorative lab imagery replaces the setup |
| `proof-equation-stage` | Derivation owns the wide stage; prose is a footer/rail | Formal reasoning is the primary evidence | Conditions and transformation sequence are visible | Formula is squeezed into a generic split card |
| `data-evidence` | Plot/table dominates; conclusion and source sit on a narrow rail | A quantitative claim depends on data | Claim points to a visible mark and provenance | Large headline hides axes or uncertainty |
| `collage` | Offset artifacts form one editorial reading path | Several sourced artifacts jointly support a narrative | Scale and overlap establish a deliberate sequence | Equal thumbnails become an unstructured gallery |
| `poster` | Oversized native headline and one visual field | A transition or synthesis needs one memorable claim | Message reads from a distance | Poster treatment hides methods on evidence pages |
| `research-figure` | Main figure plus method/result/limitation rail | Dense inspection and uncertainty matter | Evidence and limitation can be read together | Figure becomes decorative wallpaper |
| `interactive-stage` | Sim/runtime receives at least two-thirds of usable area | Learner action and feedback are the evidence | Controls, state, and output stay visible together | Explanation cards shrink the interactive surface |

## Selection and repair

- Select by evidence relationship, not by subject name or desired novelty.
- Use real asset aspect ratio and focal point to choose the split and title safe side.
- Widen prose rails for dense text; do not shrink a stage below readable minimums.
- Never place formula, table, chart, diagram, graph, sim, or runtime evidence in a narrow caption rail. Give two wide evidence blocks a balanced field and move only short prose to the footer/rail.
- Avoid adjacent identical signatures unless the repetition is the comparison.
- Use motifs as rhythmic punctuation on selected pages, not as the same decorative stamp on every page.
- If validation fails, remove fragile overlap and use the same family's safe axis. Never collapse to `flow`.
