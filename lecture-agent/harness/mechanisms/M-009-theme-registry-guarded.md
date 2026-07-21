id: M-009
title: Theme descriptions live in a structured registry (pure-visual, sourced), guarded by a bijection test
status: accepted
trigger: Any Theme enum member. Applies whenever a theme is added/removed or its description edited. Independent of block-type routing (M-008).
behavior_change: Theme "when to use" text moved from a hand-written prompt clause into domain/themes.py::THEME_DESCS — one ThemeDesc per enum member (tagline + mood + formality/density/scheme + source), pure-visual and discipline-free, rendered into the plan menu by theme_menu(). The directional nudge (named default / discipline binding) is deleted; selection is left entirely to the model's aesthetic judgment (no push to a default, no forced variety). Descriptions are lifted from each theme's origin (13 from refs/frontend-slides/bold-template-pack, lab/slate from viewer CSS), not invented.
enforcement_point: tests/test_themes.py asserts (a) THEME_DESCS bijects the Theme enum, (b) every theme appears in theme_menu with a non-empty line, and (c) the skeleton prompt lists all themes and no longer contains the deleted bias phrases ("别总默认"/"研究公报"/"理工实验"/…). Runs in the CI `test` step (pytest); a failure BLOCKS the merge.
enforcement_type: script
failure_mode: The guard proves each theme has a description and that the named bias phrases are gone; it cannot prove a tagline is truly discipline-free or well-written — that leans on code review. A theme added without a THEME_DESCS entry fails the bijection test (caught), but a subtly biased tagline passes.
scenarios: S-009
rejects_example: adding a Theme enum member (or a CSS [data-theme] block) without a THEME_DESCS entry — test_themes.py's bijection assertion fails; and re-introducing a discipline/default-nudge phrase into the theme prompt — the drops-bias-patch assertion fails.
cost: One pytest module per CI run; the menu is assembled once per generation.
decision: D-009

## Notes
Deliberately does NOT adopt genui's discipline tags or its "variety is a goal / never reuse a direction" mandate — both are forms of bias (forced-sameness and forced-variety respectively). See D-009.
