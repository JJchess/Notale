"""Independent OpenHarness workers used by the deterministic Notale workflow.

``managed.py`` owns run-local sessions, task ledgers, lazy assigned skills,
permissioned tools, structured submission gates, compaction checkpoints, resume,
and Builder-local check/repair turns. ``runtime.py`` is the narrow QueryEngine event adapter;
``research.py`` and ``builder.py`` implement the fan-out worker roles.
"""
