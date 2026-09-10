#!/usr/bin/env python3
"""Candidate output gates extracted from astra-xiuzhong-01, not a PPTX converter.

No model calls; does not execute the deliverable's Python verification scripts.
The browser adapter targets the observed PPTTemplate/structure.json contract.
Reports and new screenshots must live outside the input and output directories.
"""
import argparse
from collections import Counter
from functools import partial
import hashlib
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import posixpath
import re
import threading
from urllib.parse import unquote, urlsplit
import xml.etree.ElementTree as ET
from zipfile import ZipFile

NS = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
      'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}


def sha256(path):
    with Path(path).open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def inventory(path):
    """Read package facts, preserving source part names and presentation order."""
    with ZipFile(path) as z:
        names = set(z.namelist())

        def relationships(part):
            rp = posixpath.join(posixpath.dirname(part), '_rels', posixpath.basename(part)+'.rels')
            if rp not in names:
                return {}
            result = {}
            for node in ET.fromstring(z.read(rp)):
                external = node.get('TargetMode') == 'External'
                target = node.get('Target', '')
                resolved = target if external else posixpath.normpath(
                    posixpath.join(posixpath.dirname(part), unquote(target))).lstrip('/')
                result[node.get('Id')] = {'type': node.get('Type', '').rsplit('/', 1)[-1],
                    'target': resolved, 'external': external,
                    'exists': None if external else resolved in names}
            return result

        presentation = ET.fromstring(z.read('ppt/presentation.xml'))
        size = presentation.find('p:sldSz', NS)
        rels = relationships('ppt/presentation.xml')
        slides = [rels[n.get('{'+NS['r']+'}id')]['target']
                  for n in presentation.findall('p:sldIdLst/p:sldId', NS)]
        parts = {}
        for name in sorted(names):
            if not re.fullmatch(r'ppt/(slides/slide|slideLayouts/slideLayout|slideMasters/slideMaster)\d+\.xml', name):
                continue
            root = ET.fromstring(z.read(name))
            shapes = Counter(n.tag.rsplit('}', 1)[-1] for tree in root.findall('.//p:spTree', NS)
                             for n in tree if n.tag.rsplit('}', 1)[-1] not in ('nvGrpSpPr', 'grpSpPr'))
            parts[name] = {'relationships': relationships(name), 'shapeTypes': dict(shapes),
                'shapeIds': [n.get('id') for n in root.findall('.//p:cNvPr', NS)],
                'fonts': sorted({n.get('typeface') for n in root.iter() if n.get('typeface')}),
                'features': {key: len(root.findall(query, NS)) for key, query in {
                    'graphicFrame': './/p:graphicFrame', 'customGeometry': './/a:custGeom',
                    'groups': './/p:grpSp', 'verticalText': './/a:bodyPr[@vert]',
                    'rotations': './/a:xfrm[@rot]', 'alternateContent': './/{http://schemas.openxmlformats.org/markup-compatibility/2006}AlternateContent'
                }.items()}}
        used = {r['target'] for s in slides for r in parts[s]['relationships'].values()
                if r['type'] == 'slideLayout' and not r['external']}
        layouts = [n for n in parts if n.startswith('ppt/slideLayouts/')]
        return {'sha256': sha256(path), 'sizeEMU': {k: int(size.get(k)) for k in ('cx', 'cy')},
                'slides': slides, 'layouts': layouts, 'unusedLayouts': sorted(set(layouts)-used),
                'parts': parts, 'media': [{'source': n, 'sha256': hashlib.sha256(z.read(n)).hexdigest()}
                    for n in sorted(names) if n.startswith('ppt/media/') and not n.endswith('/')]}


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        self.urls.extend(v for k, v in attrs if k in ('src', 'href') and v)


def static_links(output):
    missing, external, checked = [], [], 0
    for path in sorted(output.rglob('*')):
        if path.suffix not in ('.html', '.css'):
            continue
        content = path.read_text()
        if path.suffix == '.html':
            parser = Links()
            parser.feed(content)
            urls = parser.urls
        else:
            urls = re.findall(r'url\(\s*[\'"]?([^\s\)\'"]+)', content)
        for value in urls:
            u = urlsplit(value)
            if u.scheme in ('data', 'mailto', 'tel') or (not u.path and not u.netloc):
                continue
            entry = {'source': str(path.relative_to(output)), 'url': value}
            if u.scheme or u.netloc:
                external.append(entry)
                continue
            checked += 1
            target = (path.parent / unquote(u.path)).resolve()
            if u.path.startswith('/') or not target.is_relative_to(output) or not target.is_file():
                missing.append(entry)
    return {'status': 'fail' if missing or external else 'pass', 'checked': checked,
            'missingOrNonPortable': missing, 'external': external,
            'scope': 'HTML src/href and CSS url(); dynamic JS and srcset need browser/manual review'}


def audit_static(pptx, output):
    facts = inventory(pptx)
    original = output / 'reference/original.pptx'
    actual = sha256(original) if original.is_file() else None
    result = {'input': facts, 'gates': {
        'sourceIntegrity': {'status': 'pass' if actual == facts['sha256'] else 'fail',
                            'expected': facts['sha256'], 'actual': actual},
        'staticLinks': static_links(output)}}
    structure = output / 'reference/structure.json'
    if not structure.is_file():
        result['gates']['coverage'] = {'status': 'unknown', 'reason': 'Observed structure.json contract absent'}
        return result
    data = json.loads(structure.read_text())
    defs = {key: data.get(key, []) for key in ('slides', 'layouts')}
    pages_missing = [f'{key}/{d["id"]}.html' for key, values in defs.items() for d in values
                     if not (output / key / (d['id']+'.html')).is_file()]
    bad_sources = []
    represented = set()
    for values in defs.values():
        for d in values:
            for item in d.get('items', []):
                source = item.get('source', '')
                if source.startswith('ppt/'):
                    represented.add(source)
                    part = facts['parts'].get(source)
                    if not part or (item.get('id') and item['id'] not in part['shapeIds']):
                        bad_sources.append({'template': d['id'], 'source': source, 'id': item.get('id')})
    unrepresented = sorted((set(facts['slides']) | set(facts['layouts'])) - represented)
    counts = {key: {'input': len(facts[key]), 'output': len(defs[key])} for key in defs}
    wrong_counts = any(v['input'] != v['output'] for v in counts.values())
    size = data.get('size', [])
    emu = facts['sizeEMU']
    ratio_matches = (isinstance(size, list) and len(size) == 2
                     and all(isinstance(n, (float, int)) and n > 0 for n in size)
                     and abs(size[0] / size[1] - emu['cx'] / emu['cy']) < 1e-6)
    result['gates']['coverage'] = {'status': 'fail' if pages_missing or bad_sources or wrong_counts or not ratio_matches else 'pass',
        'counts': counts, 'missingPages': pages_missing, 'badSourceIds': bad_sources,
        'canvasAspectRatioMatchesInput': ratio_matches,
        'partsWithoutSourceItems': unrepresented,
        'scope': 'Page counts, file existence, declared source IDs; does not prove all shapes were rendered'}
    result['manualReview'] = ['Visual fidelity and minimum text size after replacement',
        'Missing/inherited shapes, unused layouts, master decoration, font substitution',
        'Full-page raster substitution and asset generation provenance',
        'Unsupported features and arbitrary long-content behavior']
    return result


def audit_browser(output, report_dir):
    from playwright.sync_api import sync_playwright

    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    data = json.loads((output / 'reference/structure.json').read_text())
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(output)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    checks, errors = [], []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
            version = browser.version
            page = browser.new_page(viewport={'width': 1280, 'height': 720})
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('response', lambda r: errors.append(f'{r.status} {r.url}') if r.status >= 400 else None)
            page.on('requestfailed', lambda r: errors.append(f'{r.failure} {r.url}'))
            page.set_default_timeout(10000)
            for kind in ('slides', 'layouts'):
                for d in data[kind]:
                    name = d['id']
                    try:
                        page.goto(f'http://127.0.0.1:{server.server_port}/{kind}/{name}.html')
                        page.evaluate('document.fonts.ready')
                        page.wait_for_function('Array.from(document.images).every(i=>i.complete)')
                        broken = page.evaluate('Array.from(document.images).filter(i=>!i.naturalWidth).map(i=>i.src)')
                        assert not broken, f'broken images: {broken}'
                        assert page.locator('.slide').count() == 1, 'Expected one native slide'
                        actual = page.locator('.slide').evaluate('(e)=>[e.offsetWidth,e.offsetHeight]')
                        assert actual == data['size'], f'canvas {actual} != {data["size"]}'
                        page.locator('.slide').screenshot(path=str(report_dir / (name+'.png')))
                        # Exact observed API. Exercise text and DOM slots without changing source files.
                        slots = [x['slot'] for x in d['items'] if x.get('slot') and x['kind'] in ('text', 'region')]
                        outcome = page.evaluate('''({id,slots})=>{
                          const host=document.createElement('div');host.style.width='1280px';document.body.append(host);
                          const instance=PPTTemplate.render(host,id);const failures=[];
                          for(const key of slots){
                            instance.update(key,'<b>可替换文字</b>');
                            if(instance.slots[key].textContent!=='<b>可替换文字</b>' || instance.slots[key].querySelector('b')) failures.push(key);
                          }
                          if(slots.length){const n=document.createElement('button');n.textContent='互动';let hit=false;n.onclick=()=>hit=true;
                            instance.update(slots[0],n);n.click();if(!hit || !host.contains(n))failures.push('DOM');}
                          instance.destroy();if(host.children.length)failures.push('destroy');host.remove();return failures;
                        }''', {'id': name, 'slots': slots})
                        assert not outcome, f'slot roundtrip: {outcome}'
                        checks.append({'page': name, 'status': 'pass', 'textSlotsChecked': len(slots)})
                    except Exception as e:
                        checks.append({'page': name, 'status': 'fail', 'error': str(e)})
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
    return {'status': 'fail' if errors or any(c['status'] == 'fail' for c in checks) else 'pass',
            'chromium': version, 'checks': checks, 'errors': errors,
            'scope': 'Observed PPTTemplate adapter; screenshots and native text/DOM slots. No visual score threshold.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pptx', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--report-dir', type=Path, required=True)
    parser.add_argument('--browser', action='store_true')
    args = parser.parse_args()
    pptx, output, reports = args.pptx.resolve(), args.output.resolve(), args.report_dir.resolve()
    if reports.is_relative_to(output) or reports == pptx or pptx.is_relative_to(reports):
        parser.error('Reports must be separate from source PPTX and deliverable')
    reports.mkdir(parents=True, exist_ok=False)
    result = audit_static(pptx, output)
    result['gates']['browser'] = {'status': 'unknown', 'reason': '--browser not requested'}
    if args.browser:
        try:
            result['gates']['browser'] = audit_browser(output, reports)
        except Exception as e:
            result['gates']['browser'] = {'status': 'fail', 'error': str(e)}
    result['status'] = 'fail' if any(g['status'] == 'fail' for g in result['gates'].values()) else 'needs_manual_review'
    (reports / 'audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'status': result['status'], 'gates': {k: v['status'] for k, v in result['gates'].items()},
                      'report': str(reports / 'audit.json')}, ensure_ascii=False))
    return 1 if result['status'] == 'fail' else 0


if __name__ == '__main__':
    raise SystemExit(main())
