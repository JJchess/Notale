"""Independent OpenHarness workers used by the deterministic Notale workflow.

``managed.py`` owns run-local sessions, task ledgers, lazy assigned skills,
permissioned tools, structured submission gates, compaction checkpoints, resume,
the QueryEngine event loop, and Builder-local check/repair turns. ``research.py`` and
``builder.py`` implement the fan-out worker roles.
"""
