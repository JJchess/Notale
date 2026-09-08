"""Style Director gate regressions; no model calls or local font dependency."""
import unittest

from core import director


def theme(description="页面底色", contract="", extra_css="", outside="", prefix=""):
    return f"""/* ==== INTERFACE ====
{prefix}token --bg #F4F6F2 {description}
论点 光合作用的透光冷绿底。
{contract}
==== /INTERFACE ==== */
{outside}
:root {{ --bg: #F4F6F2; {extra_css} }}
"""


class DirectorGateTests(unittest.TestCase):
    def check(self, css):
        return director.gates(css, {}, [])

    def test_plain_theme_passes(self):
        self.assertEqual(self.check(theme()), [])

    def test_contract_prohibitions_and_material_metaphors_pass(self):
        for contract in (
            "禁令 严禁出现任何承载区块底色的卡片或面板层。",
            "材质 生漆墨木：取自汉代简牍黑漆底板。\n禁令 禁止任何卡片底色块堆叠。",
        ):
            with self.subTest(contract=contract):
                self.assertEqual(self.check(theme(contract=contract)), [])

    def test_token_surface_descriptions_still_fail(self):
        for word in ("承载面", "底板", "卡片底", "面板", "容器背景", "区块底色"):
            for prefix in ("", "   ", " * "):
                with self.subTest(word=word, prefix=prefix):
                    self.assertTrue(any("接口块" in error for error in
                                        self.check(theme(word, prefix=prefix))))

    def test_renamed_surface_token_description_still_fails(self):
        css = theme(contract="token --context #A1B2C3 图表承载面")
        self.assertTrue(any("接口块" in error for error in self.check(css)))

    def test_actual_surface_tokens_still_fail(self):
        for name in ("surface", "panel", "card", "board", "panel-bg"):
            with self.subTest(name=name):
                errors = self.check(theme(extra_css=f"--{name}: #A1B2C3;"))
                self.assertTrue(any("不许定义承载面 token" in error for error in errors))

    def test_comments_outside_interface_are_not_token_permissions(self):
        self.assertEqual(self.check(theme(outside="/* token --example 禁止面板 */")), [])


if __name__ == "__main__":
    unittest.main()
