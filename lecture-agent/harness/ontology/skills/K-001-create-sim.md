id: K-001
name: create-sim
status: proposed
scope: Producing interactive sim blocks — registry engines (dynamics1d, searchCompare), sim.custom, and the sim.widget escape hatch — plus the plan→build→repair subrecipe for widgets.
anti_triggers: Do NOT use dynamics1d to fake signal synthesis / Fourier series / multi-variable motion / second-order oscillators (those need a widget). Do NOT reach for widget when a registry engine, sim.custom, or a declarative block (flow/compare/chart) expresses the idea. If none fit, do NOT place a sim at all — explain with flow/compare instead.
activation_signal: The planner decided a block should be an animatable/interactive demonstration (an algorithmic process, geometric construction, motion, or arbitrary interaction) rather than a static figure.
routing: route static data display to create-chart; route bespoke non-interactive layout to create-freeform; route ordinary prose/list/quiz to create-content.
enforcement_point: none yet — engine/skill routing correctness currently lives in planner prompts + create-sim contracts.json, not a routing test. Stays proposed until a routing check exists.

## Notes
Captures A16's "选引擎（防误用）" as a recorded negative boundary. The one concrete failure mode (consts must be numeric; oscillators need custom/widget) is already mechanically caught by validate.mjs; the broader "don't shoehorn / don't place a sim at all" judgment is unenforced, hence proposed.
