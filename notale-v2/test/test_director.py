"""Style Director gate regressions; no model calls or local font dependency."""
import unittest
from pathlib import Path

from core import director


def theme(description="页面底色", contract="", extra_css="", outside="", prefix=""):
    return f"""/* ==== INTERFACE ====
{prefix}token --bg #F4F6F2 {description}
论点 光合作用的透光冷绿底。
{contract}
==== /INTERFACE ==== */
{outside}
:root {{ --bg: #F4F6F2; --text: #111; --font-sans: sans-serif; {extra_css} }}
"""


class DirectorGateTests(unittest.TestCase):
    def check(self, css):
        return director.gates(css, assets=Path('/tmp'), browser=False)

    def test_plain_theme_passes(self):
        self.assertEqual(self.check(theme()), [])

    def test_contract_prohibitions_and_material_metaphors_pass(self):
        for contract in (
            "禁令 严禁出现任何承载区块底色的卡片或面板层。",
            "材质 生漆墨木：取自汉代简牍黑漆底板。\n禁令 禁止任何卡片底色块堆叠。",
        ):
            with self.subTest(contract=contract):
                self.assertEqual(self.check(theme(contract=contract)), [])

    def test_token_prose_is_not_interpreted_as_surface_permission(self):
        for word in ("承载面", "底板", "卡片底", "面板", "容器背景", "区块底色"):
            for prefix in ("", "   ", " * "):
                with self.subTest(word=word, prefix=prefix):
                    self.assertEqual(self.check(theme(f"页面底色，不用于{word}", prefix=prefix)), [])

    def test_undefined_token_still_fails_without_semantic_keyword_gate(self):
        css = theme(contract="token --context #A1B2C3 不是图表承载面")
        self.assertIn('接口 token 未定义: --context', self.check(css))
        self.assertEqual(self.check(theme(contract="token --context #A1B2C3 不是图表承载面",
                                          extra_css="--context:#A1B2C3;")), [])

    def test_function_and_attribute_commas_do_not_split_local_scope(self):
        for selector in ('.nt-button:is(:hover, :focus-visible)',
                         '.nt-controls:not(:is(.compact, .hidden))',
                         '.nt-controls[data-label="a,b"], .nt-other:has(button, input)'):
            with self.subTest(selector=selector):
                css = theme(outside=selector + '{--surface:#fff;color:var(--text)}')
                self.assertEqual(self.check(css), [])

    def test_top_level_branches_still_enforce_shared_boundaries(self):
        for rule, error in (
            ('.nt-button:is(:hover, :focus-visible), button {color:red}', '共享样式'),
            ('.nt-controls:is(:hover, :focus-visible), :root {--surface:#fff}', '承载面'),
            ('.nt-controls:is(:hover, :focus-visible), #stage {transform:none}', '底盘'),
        ):
            with self.subTest(rule=rule):
                self.assertTrue(any(error in issue for issue in self.check(theme(outside=rule))))

    def test_actual_surface_tokens_still_fail(self):
        for name in ("surface", "panel", "card", "board", "panel-bg"):
            with self.subTest(name=name):
                errors = self.check(theme(extra_css=f"--{name}: #A1B2C3;"))
                self.assertTrue(any("不许定义承载面 token" in error for error in errors))

    def test_comments_outside_interface_are_not_token_permissions(self):
        self.assertEqual(self.check(theme(outside="/* token --example 禁止面板 */")), [])


if __name__ == "__main__":
    unittest.main()
