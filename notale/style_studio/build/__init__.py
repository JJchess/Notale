"""StyleBuild: create and evolve StylePacks from sparse user intent.

Ported from deckbase ``style_studio.build``. Every path funnels through
``service.merge_and_fill`` so a pack is always written validated, with a
``BUILD_REPORT.md`` recording where each field came from.
"""

from __future__ import annotations
