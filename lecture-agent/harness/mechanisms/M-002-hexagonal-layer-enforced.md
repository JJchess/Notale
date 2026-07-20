id: M-002
title: Hexagonal layer direction is machine-enforced in CI, not just documented
status: accepted
trigger: Any commit/PR that changes imports in the lecture_agent package. Does NOT apply to the viewer/ tree (separate JS project) or to test-only import shims.
behavior_change: The dependency direction (schema/utils < ports < {domain,adapters} < agent < app) is a machine contract, not prose; an upward or cross-layer import is caught mechanically instead of at review time (or never).
enforcement_point: .importlinter declares 5 contracts (layers + domain-not-adapters + agent-not-adapters + ports-pure + schema-pure); the CI `contract` step runs `lint-imports` and any violating import FAILS the step, which blocks the merge. Locally `make contract` reproduces it.
enforcement_type: workflow-gate
failure_mode: A dependency is smuggled in via a runtime import inside a function body or via importlib, which the static import graph may miss. Mitigation: the layering is load-bearing for mypy and the tests, so most evasions surface elsewhere.
scenarios: S-003
rejects_example: domain/generation/widget.py adding `from ...adapters.llm import FakeClient` — lint-imports fails the domain-not-adapters contract and the PR cannot merge.
cost: One `lint-imports` run per CI job (seconds); one-time cost of writing the 5 contracts.
decision: D-002

## Notes
PROJECT_STRUCTURE.md §5 titles this "依赖规则的机器强制（否则规范会腐烂）" — the repo already converted the principle into a mechanism. This record ratifies existing reality into the registry.
