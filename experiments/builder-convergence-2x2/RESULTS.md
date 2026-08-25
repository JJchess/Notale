# Terra medium · screen 01

Run: `terra-medium-screen-01` · 2026-08-25 · 8 pages × 4 arms.

## Integrity

- 32/32 tasks ended naturally on `no_tool_use`; no task hit 100 calls.
- 32/32 final artifacts passed the same external Check, which was not fed back to the Agent.
- 32/32 loaded every assigned Skill through the model's own choice; the runner never nagged.
- Read-only dependency hashes were identical before and after the run.

## Results

| arm | total calls | median | mean | within 32 | hard Check |
|---|---:|---:|---:|---:|---:|
| legacy-builder | 139 | 15.0 | 17.38 | 8/8 | 8/8 |
| workflow-builder | 104 | 12.0 | 13.00 | 8/8 | 8/8 |
| legacy-lab | 141 | 15.0 | 17.62 | 7/8 | 8/8 |
| workflow-lab | 107 | 13.5 | 13.38 | 8/8 | 8/8 |

The only run above 32 calls was `page-18 / legacy-lab` at 41 calls. It had already loaded its Skill; the tail was an Edit→Render repair loop.

## Decision

- New workflows pass the screening rule with Builder tools: 7/8 paired call wins, 35 fewer calls, equal 8/8 hard quality.
- New workflows improve total calls with Lab tools by 34, but win only 5/8 with one tie, so that contrast does not pass the predeclared 6/8 rule.
- The Lab tool surface does not improve convergence: it loses the screening comparison under both Skill conditions. Do not replace Builder's tool set based on this run.
- All five pages that historically hit 100 calls now finished in 7–22 calls across the four conditions. This shows that the old long tail is not inevitable, but this screen changed both model and the tool-neutral wording; it does not by itself separate those two causes.

The next production candidate is the reorganized workflow content with the existing Builder tools. Blind visual review remains separate from the machine gate.
