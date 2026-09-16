import tempfile
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET
from zipfile import ZipFile

from convert import SVG, normalize_svg, static_slides, gradient_opacities, restore_gradient_opacity


class ConversionTests(unittest.TestCase):
    def test_shared_definition_ids_are_scoped_per_slide(self):
        raw = f'<svg xmlns="{SVG}"><defs><clipPath id="clip"><rect width="5" height="5"/></clipPath></defs><g clip-path="url(#clip)"><text>Original</text></g></svg>'
        with tempfile.TemporaryDirectory() as tmp:
            one = normalize_svg(raw, 1, Path(tmp), 100, 50)
            two = normalize_svg(raw, 2, Path(tmp), 100, 50)
        self.assertIn('url(#s1-node-0)', ET.tostring(one, encoding='unicode'))
        self.assertIn('url(#s2-node-0)', ET.tostring(two, encoding='unicode'))
        self.assertEqual(''.join(one.itertext()), 'Original')

    def test_static_export_resolves_master_before_slide_without_player(self):
        raw = f'''<svg xmlns="{SVG}" xmlns:ooo="http://xml.openoffice.org/svg/export">
        <defs><g id="ooo:meta_slides"><g id="ooo:meta_slide_0" ooo:slide="page" ooo:master="master"/></g>
        <g id="master"><g class="Background"><rect id="background"/></g><g class="BackgroundObjects"><text>Logo</text><text visibility="hidden">Hidden</text></g></g></defs>
        <g id="page"><text>Content</text></g><script>unwantedPlayer()</script></svg>'''
        result = ET.fromstring(static_slides(raw)[0])
        texts = [e.text for e in result.iter(f'{{{SVG}}}text')]
        self.assertEqual(texts, ['Logo', 'Content'])
        self.assertFalse(list(result.iter(f'{{{SVG}}}script')))

    def test_unsorted_ooxml_gradient_stops_replace_wrong_transparency_mask(self):
        xml = '''<root xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:gradFill><a:gsLst>
        <a:gs pos="100000"><a:srgbClr val="00498A"><a:alpha val="78000"/></a:srgbClr></a:gs>
        <a:gs pos="0"><a:srgbClr val="660874"/></a:gs></a:gsLst></a:gradFill></root>'''
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/'sample.pptx'
            with ZipFile(path, 'w') as package:
                package.writestr('ppt/slideLayouts/slideLayout1.xml', xml)
            opacities = gradient_opacities(path)
        root = ET.fromstring(f'''<svg xmlns="{SVG}"><defs><mask id="wrong"/>
        <linearGradient id="fill"><stop offset="0" stop-color="rgb(102,8,116)"/><stop offset="1" stop-color="rgb(0,73,138)"/></linearGradient></defs>
        <g style="mask:url(#wrong)"><path fill="url(#fill)"/></g></svg>''')
        restore_gradient_opacity(root, opacities)
        self.assertEqual([e.get('stop-opacity') for e in root.iter(f'{{{SVG}}}stop')], ['1', '0.78'])
        self.assertFalse(list(root.iter(f'{{{SVG}}}mask')))
        self.assertNotIn('url(#wrong)', ET.tostring(root, encoding='unicode'))


if __name__ == '__main__':
    unittest.main()
