id: S-012
title: build_coverage.py's by_theme aggregation reads the config-echo field, not the model's actual choice
kind: observed
context: viewer/build_coverage.py::build(), aggregating ledger.jsonl records into by_theme for coverage.html.
trigger: The ledger's top-level "theme" field on an ExperimentRecord mirrors cfg.theme (the input override — see app/container.py::_record_experiment) — it is only populated when a run forces a specific theme. genre_routing.yaml deliberately leaves theme unset so the model chooses freely (this is the whole point of the experiment). build_coverage.py's by_theme aggregation read only rec.get("theme"), defaulting to "(unknown)" — so every genre_routing record would have landed in "(unknown)", making it impossible to see the actual theme distribution the experiment was designed to reveal.
bad_outcome: The real model-selected theme is recorded elsewhere on the same ledger entry — domain/telemetry/profile.py::profile_deck(doc) captures theme=doc.get("theme") into the record's nested "profile" field — but build_coverage.py never reads it. Verified concretely: ledger record for 梯度下降与学习率 had top-level theme=None but profile.theme="lab" (matching the actual saved deck JSON's theme field).
why_it_matters: A coverage tool that silently reports "(unknown)" for every free-choice run looks like a data problem, not a tool bug — it would have made the whole genre_routing verification (the reason this experiment was designed) unreadable without anyone noticing why.
status: addressed
addressed_by: M-012

## Notes
Found while sanity-checking one ledger record before trusting the coverage output — worth generalizing: any new "let the model choose freely" experiment should double-check which ledger field actually carries the free choice before relying on an existing aggregator built for the config-forced case.
