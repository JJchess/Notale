"""Current Builder handoff contract; independent of historical runs."""

import unittest

from core.artifacts import Brief


class BriefTests(unittest.TestCase):
    def test_handoff_preserves_exactly_description_and_prompt(self):
        values = {"description": "Build page-01", "prompt": "标题\n\n自由散文，原样保留。\n"}
        self.assertEqual(Brief(**values).as_tool_input(), values)


if __name__ == "__main__":
    unittest.main()
