<!-- 这一份是 build-interaction 的 交付前检查。动手完成之后、交付之前读。 -->
<!-- 切自单份 interactive-widget.md(93,524 B,曾占建页输入 35.7%);正文原样搬运,未改写。 -->

## 14. Machine-made failure signatures

Remove these before delivery.

### Page disguised as component

- repeats the page title and subtitle;
- creates its own full-background visual theme;
- adds chapter labels, navigation, footer, or page count;
- includes several article sections;
- owns global keyboard shortcuts;
- applies global selectors or resets.

Repair by restoring one root, one teaching region, and one model.

### Form-to-number pseudo-interaction

- controls dominate the composition;
- the model is tiny or absent;
- action changes only a numeric card;
- relationship is described in text rather than drawn;
- sliders operate independent quantities with no shared model.

Repair by making the affected object dominant and placing the value beside its direct visual consequence.

### Dashboard cabinet

- three or more equal cards hold heterogeneous status, prose, and values;
- every piece of information has a border;
- a tall sidebar compresses the stage;
- duplicated charts present no different explanatory dimension;
- status is styled as a KPI.

Repair by moving values and annotations onto the stage, keeping one boxed readout at most, and demoting history or internal structure.

### Invisible affordance

- drag works only after accidental discovery;
- a tooltip or instruction pill explains an unmarked object;
- hover is the only way to reveal essential information;
- thin lines have thin hit regions;
- touch and keyboard cannot reach the state.

Repair with handles, hover/focus preview, cursors, semantic alternatives, and larger invisible hit targets.

### Fake causality

- an animation plays but the displayed numbers are scripted separately;
- nodes flash in order without local values or rules;
- a metric changes on a timer unrelated to the drawn model;
- a transformation is a cross-fade;
- a success state appears after a fixed number of clicks rather than evidence.

Repair by sharing one state and computing each view from the same snapshot.

### Unfair comparison

- alternatives use different samples, axes, crops, clocks, or starting states;
- each plot rescales independently;
- one run starts later;
- divergent values vanish;
- a preferred alternative receives more visual detail.

Repair by freezing invariants, aligning scales, and controlling all runs through one action.

### State drift

- control value, geometry, label, and readout disagree;
- direct manipulation does not update the keyboard alternative;
- autoplay and manual step race;
- reset creates new random data unintentionally;
- an old animation overwrites a newer input;
- selection is stored in both DOM classes and JavaScript arrays.

Repair with one canonical state, one transition path, and one render.

### Decorative motion

- everything pulses or floats;
- glow substitutes for direction or magnitude;
- entrance animation repeats on every update;
- a long transition delays routine adjustment;
- continuous RAF runs on a static component;
- reduced motion removes evidence.

Repair by assigning each motion a causal job and leaving a persistent state.

### Generic visual slop

- gradient mesh or glass panel unrelated to subject;
- emoji headings;
- bilingual double labels;
- instruction stickers;
- excessive pills;
- giant generic number;
- arbitrary card hover lift;
- inconsistent radii and border weights;
- many accent colors without stable semantics;
- tiny labels and unformatted floating-point output.

Repair by inheriting the host theme and defining one subject-specific signature.

### False completion

- “Done” appears because every step was visited, though the relationship is still unclear;
- correct/incorrect is invented for an open-ended instrument;
- conclusion appears before the learner creates evidence;
- final motion ends on an empty or reset state;
- the component cannot replay its primary action.

Repair by defining a domain completion or reveal condition and preserving the final evidence.

### Fragile engineering

- page-level ID lookup reaches outside the component;
- pointer coordinates ignore host scaling;
- timers or observers survive remount;
- generated history grows without bound;
- Canvas text is the only accessible explanation;
- layout depends on fixed pixel widths inside a smaller host region;
- resize moves graphics but not hit regions;
- third-party rendering is used where analytic geometry would be clearer.

Repair through the technical contract, not a visual patch.

## 15. Acceptance and delivery

### Review the learning argument first

Ask in order:

1. Can a viewer identify the model, current state, and primary action within two seconds?
2. Does the primary action alter a meaningful quantity?
3. Does that quantity visibly change the model itself?
4. Is the direct consequence stronger than the readout or explanation?
5. Can the learner identify what stayed invariant?
6. Does measured evidence quantify rather than replace direct evidence?
7. Does interpretation follow the relevant evidence?
8. Is one claim taught through one coherent model?

Any “no” is a design failure even when the page renders cleanly.

### Review craft

1. Is one element visually dominant?
2. Is the concept signature specific to the subject?
3. Does the component inherit rather than replace the page theme?
4. Are cause, consequence, selection, and constraint visually distinct?
5. Are controls adjacent to what they change?
6. Are values and explanations attached to evidence?
7. Are comparable views aligned and fair?
8. Does the current state remain legible when paused?
9. Are all visible numbers formatted deliberately?
10. Have machine-made patterns been removed?

### State smoke matrix

Exercise every state that exists:

| State | Required observation |
|---|---|
| Initial | Representative model, primary affordance, current consequence, and essential labels are visible |
| Hover/focus | Actionable target responds without shifting layout; focus is visible |
| Primary pointer action | Logical quantity, model geometry/behavior, and every dependent view update together |
| Keyboard/touch alternative | Reaches the same logical state and evidence |
| Intermediate | Relationship remains inspectable; labels and identity persist |
| Diagnostic extreme | Threshold, reversal, saturation, divergence, invalidity, or completion remains legible |
| Invalid attempt | Last valid model persists; attempted object and exact constraint are identifiable |
| Reveal | Interpretation appears only after its evidence and does not erase that evidence |
| Pause | Current state is stable and meaningful |
| Reset | Exact initial state returns; stale feedback, history, and active work are removed |
| Rapid input | No animation stack, stale write, lost pointer, or unbounded history |
| Resize/page scale | Drawing, overlay, controls, hit regions, and labels remain aligned |
| Reduced motion | Same information, states, and actions remain available |
| Destroy/remount | No duplicate listener, observer, timer, loop, canvas, or renderer |

### Pattern-specific checks

### Technical delivery gate

Require:

- zero JavaScript errors;
- zero failed required resources;
- no overflow, clipping, nested scrolling, or unreachable controls;
- no host selector, style, event, or lifecycle pollution;
- no stale coordinated view;
- no lost final value after rapid input;
- exact reset;
- safe repeated teardown;
- expected behavior under the host page scale;
- required `Check` screenshots for materially different visual states.

Passing automated checks does not establish quality. Inspect the initial, active, diagnostic, and reset states as images. Confirm the evidence is visually dominant and the component reads as one designed instrument rather than a collection of functioning controls.

### Delivery report

Report only what was actually implemented and verified:

- learner action;
- changed quantity;
- direct visual evidence;
- alternate input path;
- diagnostic/reveal state;
- reset and cleanup behavior;
- last checks run.

Do not claim interaction quality from code inspection alone. Do not report a state you did not exercise.
