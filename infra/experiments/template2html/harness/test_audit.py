import json
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile

from audit import NS, audit_static, inventory, static_links


class AuditTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.pptx = self.root / 'template.pptx'
        self.output = self.root / 'output'
        self.output.mkdir()
        # Non-default geometry and out-of-numeric-order IDs catch the teacher's
        # fixed 7/15 counts, slideN enumeration and 1280x720 assumptions.
        with ZipFile(self.pptx, 'w') as z:
            z.writestr('ppt/presentation.xml', f'''<p:presentation xmlns:p="{NS['p']}" xmlns:r="{NS['r']}">
              <p:sldIdLst><p:sldId id="256" r:id="rB"/><p:sldId id="257" r:id="rA"/></p:sldIdLst>
              <p:sldSz cx="9144000" cy="6858000"/></p:presentation>''')
            z.writestr('ppt/_rels/presentation.xml.rels', '''<Relationships>
              <Relationship Id="rA" Type="x/slide" Target="slides/slide2.xml"/>
              <Relationship Id="rB" Type="x/slide" Target="slides/slide9.xml"/></Relationships>''')
            for num in (2, 9):
                z.writestr(f'ppt/slides/slide{num}.xml', f'<p:sld xmlns:p="{NS["p"]}"><p:cSld><p:spTree><p:graphicFrame/></p:spTree></p:cSld></p:sld>')
                z.writestr(f'ppt/slides/_rels/slide{num}.xml.rels', '''<Relationships>
                  <Relationship Id="rL" Type="x/slideLayout" Target="../slideLayouts/slideLayout8.xml"/>
                  <Relationship Id="rH" Type="x/hyperlink" Target="https://example.com" TargetMode="External"/>
                  </Relationships>''')
            z.writestr('ppt/slideLayouts/slideLayout8.xml', f'<p:sldLayout xmlns:p="{NS["p"]}"/>')

    def test_order_geometry_and_relationships(self):
        data = inventory(self.pptx)
        self.assertEqual(data['slides'], ['ppt/slides/slide9.xml', 'ppt/slides/slide2.xml'])
        self.assertEqual(data['sizeEMU']['cx'], 9144000)
        self.assertEqual(data['unusedLayouts'], [])
        rels = data['parts'][data['slides'][0]]['relationships']
        self.assertTrue(rels['rL']['exists'])
        self.assertTrue(rels['rH']['external'])
        self.assertIsNone(rels['rH']['exists'])
        self.assertEqual(data['parts'][data['slides'][0]]['features']['graphicFrame'], 1)

    def test_fabricated_validation_does_not_override_missing_source(self):
        (self.output / 'rendered').mkdir()
        (self.output / 'rendered/validation.json').write_text(json.dumps({'sourceIntegrity': 'pass'}))
        self.assertEqual(audit_static(self.pptx, self.output)['gates']['sourceIntegrity']['status'], 'fail')

    def test_tampered_source(self):
        (self.output / 'reference').mkdir()
        (self.output / 'reference/original.pptx').write_bytes(self.pptx.read_bytes())
        self.assertEqual(audit_static(self.pptx, self.output)['gates']['sourceIntegrity']['status'], 'pass')
        (self.output / 'reference/original.pptx').write_bytes(b'changed')
        self.assertEqual(audit_static(self.pptx, self.output)['gates']['sourceIntegrity']['status'], 'fail')

    def test_missing_nonportable_and_css_resources(self):
        (self.output / 'index.html').write_text('<img src="missing.png"><a href="../template.pptx">out</a><a href="#x">anchor</a><script src="https://example.com/a.js"></script>')
        (self.output / 'style.css').write_text('a {background: url("lost.png")}')
        result = static_links(self.output)
        self.assertEqual(result['status'], 'fail')
        self.assertEqual(len(result['missingOrNonPortable']), 3)
        self.assertEqual(len(result['external']), 1)

    def test_claimed_counts_and_missing_pages_fail(self):
        (self.output / 'reference').mkdir()
        (self.output / 'reference/structure.json').write_text(json.dumps({
            'slides': [{'id': 'slide-01', 'items': [{'source': 'ppt/slides/slide1.xml', 'id': '2'}]}], 'layouts': []}))
        gate = audit_static(self.pptx, self.output)['gates']['coverage']
        self.assertEqual(gate['status'], 'fail')
        self.assertEqual(gate['counts']['slides']['input'], 2)
        self.assertEqual(len(gate['badSourceIds']), 1)
        self.assertEqual(gate['missingPages'], ['slides/slide-01.html'])

    def test_same_count_but_wrong_canvas_fails(self):
        (self.output / 'reference').mkdir()
        data = {'size': [1280, 720], 'slides': [], 'layouts': []}
        for kind, ids in [('slides', ['slide-01', 'slide-02']), ('layouts', ['layout-01'])]:
            (self.output / kind).mkdir()
            for ident in ids:
                data[kind].append({'id': ident, 'items': []})
                (self.output / kind / (ident+'.html')).write_text('')
        (self.output / 'reference/structure.json').write_text(json.dumps(data))
        gate = audit_static(self.pptx, self.output)['gates']['coverage']
        self.assertFalse(gate['canvasAspectRatioMatchesInput'])
        self.assertEqual(gate['status'], 'fail')


if __name__ == '__main__':
    unittest.main()
