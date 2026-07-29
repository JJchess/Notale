id: S-003
title: Architecture rule stated only in prose rots as the code grows
kind: observed
context: PROJECT_STRUCTURE.md §1 states the hexagonal dependency direction ("依赖只能向下，永不向上，永不成环"); introduced with the a5c9 rewrite that established the layers.
trigger: A rule that lives only as documentation has no cost to violate; a later edit imports "upward" (e.g. domain importing an adapter) and nothing objects until the design has already rotted.
bad_outcome: The stated layering silently decays into a tangle — the doc says one thing and the import graph says another.
why_it_matters: The whole point of the hexagon (swappable adapters, domain testable via ports) collapses once a single upward import lands unchecked; PROJECT_STRUCTURE.md §5 itself titles the fix "依赖规则的机器强制（否则规范会腐烂）".
status: addressed
addressed_by: M-002

## Notes
The repo already recognized this failure and closed it with import-linter; M-002 ratifies that existing mechanism into the registry.
