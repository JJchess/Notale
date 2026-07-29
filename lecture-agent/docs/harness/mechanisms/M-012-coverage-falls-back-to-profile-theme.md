id: M-012
title: Coverage's by_theme falls back to profile.theme when the top-level (config-echo) field is empty
status: advisory
trigger: Aggregating ledger.jsonl records into by_theme inside viewer/build_coverage.py::build().
behavior_change: theme resolution becomes rec.get("theme") or (rec.get("profile") or {}).get("theme") or "(unknown)" — the config-forced value still wins when present (keeps the config-driven-experiment case unchanged), but a free-choice run (no cfg.theme override) now falls back to the model's actual selection recorded in profile.theme instead of collapsing to "(unknown)".
enforcement_point: None. viewer/ has no Python test suite (build_coverage.py, like the rest of viewer/, is stdlib-only with no existing test precedent), so this round did not add one. Verified manually: after the fix, a genre_routing ledger entry with top-level theme=None and profile.theme="lab" now aggregates under "lab" instead of "(unknown)".
enforcement_type: none
failure_mode: Nothing blocks a future edit from reverting to the top-level-only read, silently breaking by_theme for any future free-choice experiment the same way S-012 did — the schema's own rule (enforcement_type: none → status: advisory) reflects that honestly.
scenarios: S-012
rejects_example: n/a (advisory — no enforcement to defeat)
cost: One extra dict lookup per record; no schema change, no new dependency.
decision: D-012
