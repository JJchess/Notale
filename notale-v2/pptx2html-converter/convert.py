#!/usr/bin/env python3
"""Deterministic PPTX → HTML with live SVG text/shapes and local assets."""
import argparse
import base64
from collections import defaultdict
from copy import deepcopy
import hashlib
from html import escape
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import tempfile
import time
import xml.etree.ElementTree as ET
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

SVG = 'http://www.w3.org/2000/svg'
XLINK = 'http://www.w3.org/1999/xlink'
ET.register_namespace('', SVG)
ET.register_namespace('xlink', XLINK)
HERE = Path(__file__).resolve().parent


def digest(data):
    return hashlib.sha256(data).hexdigest()


def source_info(source):
    ns = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main'}
    with ZipFile(source) as package:
        document = ET.fromstring(package.read('ppt/presentation.xml'))
        size = document.find('p:sldSz', ns)
        warnings = []
        for name in package.namelist():
            if re.fullmatch(r'ppt/slides/slide\d+\.xml', name):
                slide = ET.fromstring(package.read(name))
                if slide.find('p:timing', ns) is not None or slide.find('p:transition', ns) is not None:
                    warnings.append(f'{name}: static template only; animations/transitions are not exported')
            if name.startswith(('ppt/charts/', 'ppt/diagrams/', 'ppt/media/')) and name.endswith(('.mp4', '.mp3', '.wav')):
                warnings.append(f'{name}: embedded audio/video is not interactive in this static export')
        return {'width_emu': int(size.get('cx')), 'height_emu': int(size.get('cy')),
                'slide_count': len(document.findall('p:sldIdLst/p:sldId', ns)), 'warnings': warnings}


def gradient_opacities(source):
    """Read opacity from OOXML, bypassing LO's reversed SVG transparency masks."""
    a = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
    candidates = defaultdict(set)
    with ZipFile(source) as package:
        for name in package.namelist():
            if not name.startswith(('ppt/slides/', 'ppt/slideLayouts/', 'ppt/slideMasters/')) or not name.endswith('.xml'):
                continue
            for fill in ET.fromstring(package.read(name)).iter(a+'gradFill'):
                stops = []
                for stop in fill.findall(a+'gsLst/'+a+'gs'):
                    color = stop.find(a+'srgbClr')
                    if color is None or any(child.tag != a+'alpha' for child in color):
                        stops = []
                        break
                    alpha = color.find(a+'alpha')
                    stops.append((round(int(stop.get('pos'))/100000, 6), color.get('val').lower(),
                                  int(alpha.get('val'))/100000 if alpha is not None else 1))
                if stops:
                    stops.sort()
                    candidates[tuple((p, c) for p, c, _ in stops)].add(tuple(o for _, _, o in stops))
    return {key: next(iter(values)) for key, values in candidates.items() if len(values) == 1}


def restore_gradient_opacity(root, opacities):
    parents = {child: parent for parent in root.iter() for child in parent}
    fixed = set()
    for gradient in root.iter(f'{{{SVG}}}linearGradient'):
        stops = list(gradient)
        key = []
        for stop in stops:
            color = stop.get('stop-color', '') or stop.get('style', '')
            rgb = re.search(r'rgb\((\d+),\s*(\d+),\s*(\d+)\)', color)
            if rgb is None:
                break
            key.append((round(float(stop.get('offset')), 6), ''.join(f'{int(v):02x}' for v in rgb.groups())))
        values = opacities.get(tuple(key)) if len(key) == len(stops) else None
        if values is not None:
            for stop, alpha in zip(stops, values):
                stop.set('stop-opacity', str(alpha))
            fixed.add(gradient.get('id'))
    removed_masks = set()
    for node in root.iter():
        refs = re.findall(r'url\(#([^)]*)\)', node.get('fill', '') + node.get('style', ''))
        if not fixed.intersection(refs):
            continue
        ancestor = node
        while ancestor is not root:
            style = ancestor.get('style', '')
            removed_masks.update(re.findall(r'mask:\s*url\(#([^)]*)\)', style))
            if 'mask:' in style:
                ancestor.set('style', re.sub(r'mask:\s*url\(#[^)]*\);?', '', style))
            ancestor = parents[ancestor]
    for mask in list(root.iter(f'{{{SVG}}}mask')):
        if mask.get('id') in removed_masks:
            parents[mask].remove(mask)


def normalize_svg(raw, number, assets, width, height):
    root = ET.fromstring(raw)
    root.set('viewBox', f'0 0 {width:.6f} {height:.6f}')
    root.set('width', '100%')
    root.set('height', '100%')
    root.set('role', 'img')
    root.set('aria-label', f'Slide {number}')
    # LO's internal shape IDs may vary with master allocation between processes.
    # Canonicalize by local traversal order, not by those source IDs.
    ids = {e.get('id'): f's{number}-node-{i}' for i, e in enumerate(e for e in root.iter() if e.get('id'))}
    for parent in root.iter():
        for child in list(parent):
            if child.tag.split('}')[-1] in ('script', 'foreignObject'):
                raise ValueError('Unexpected active content in SVG export')
        for key, value in list(parent.attrib.items()):
            if key.split('}')[-1].lower().startswith('on'):
                del parent.attrib[key]
                continue
            if key == 'id':
                parent.set(key, ids[value])
            else:
                value = re.sub(r'url\(#([^)]*)\)', lambda m: f'url(#{ids.get(m[1], m[1])})', value)
                if key in ('href', f'{{{XLINK}}}href'):
                    if value.startswith('#'):
                        value = '#' + ids.get(value[1:], value[1:])
                    elif value.startswith('data:'):
                        header, encoded = value.split(',', 1)
                        mime = header[5:].split(';')[0]
                        extensions = {'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif'}
                        if mime not in extensions or ';base64' not in header:
                            raise ValueError(f'Unsupported embedded image: {mime}')
                        data = base64.b64decode(encoded)
                        filename = digest(data)[:20] + extensions[mime]
                        (assets/filename).write_bytes(data)
                        value = 'assets/' + filename
                    else:
                        raise ValueError('Non-local image reference in SVG export')
                parent.set(key, value)
    return root


def static_slides(raw):
    """Resolve exported master/slide associations and reachable SVG definitions.

    LibreOffice's slideshow script and unused masters never enter the HTML.
    """
    original = ET.fromstring(raw)
    by_id = {e.get('id'): e for e in original.iter() if e.get('id')}
    ooo = '{http://xml.openoffice.org/svg/export}'
    metadata = by_id.get('ooo:meta_slides')
    if metadata is None:
        raise ValueError('Missing slide/master associations in presentation SVG')
    results = []
    for meta in metadata:
        if not re.fullmatch(r'ooo:meta_slide_\d+', meta.get('id', '')):
            continue
        root = ET.Element(f'{{{SVG}}}svg', original.attrib)
        master = by_id[meta.get(ooo+'master')]
        for group in master:
            setting = 'background-visibility' if group.get('class') == 'Background' else 'master-objects-visibility'
            if meta.get(ooo+setting) != 'hidden':
                root.append(deepcopy(group))
        root.append(deepcopy(by_id[meta.get(ooo+'slide')]))
        for parent in root.iter():
            for child in list(parent):
                if child.get('visibility') == 'hidden':
                    parent.remove(child)
        definitions = ET.Element(f'{{{SVG}}}defs')
        root.insert(0, definitions)
        while True:
            present = {e.get('id') for e in root.iter() if e.get('id')}
            referenced = set()
            for e in root.iter():
                for key, value in e.attrib.items():
                    referenced.update(re.findall(r'url\(#([^)]*)\)', value))
                    if key in ('href', f'{{{XLINK}}}href') and value.startswith('#'):
                        referenced.add(value[1:])
            missing = referenced - present
            if not missing:
                break
            for ident in sorted(missing):
                if ident not in by_id:
                    raise ValueError(f'Missing SVG definition: {ident}')
                definitions.append(deepcopy(by_id[ident]))
        results.append(ET.tostring(root))
    return results


def embed_fonts(roots, assets, warnings):
    """Subset installed fonts so downloaded templates do not depend on host fonts."""
    from fontTools import subset
    from fontTools.ttLib import TTFont
    families = defaultdict(set)
    for root in roots:
        for node in root.iter():
            if node.get('font-family'):
                families[node.get('font-family')].update(''.join(node.itertext()))
    rules, report = [], []
    for index, (family, characters) in enumerate(sorted(families.items())):
        requested = family.split(',')[0].strip(' "\'')
        charset = ' '.join(f'{ord(c):x}' for c in sorted(characters) if not c.isspace())
        match = subprocess.check_output(['fc-match', '-f', '%{file}\n%{family}\n%{index}',
                                         requested + ':charset=' + charset], text=True).splitlines()
        font = TTFont(match[0], fontNumber=int(match[2]), recalcTimestamp=False)
        try:
            if 'OS/2' in font and font['OS/2'].fsType & (0x2 | 0x100 | 0x200):
                warnings.append(f'{requested}: embedding/subsetting restricted; uses local font fallback')
                continue
            actual = match[1]
            if requested not in actual.split(','):
                warnings.append(f'Font substitution: {requested} → {actual}')
            alias = f'PptxFont{index}'
            options = subset.Options()
            options.recalc_timestamp = False
            sub = subset.Subsetter(options=options)
            sub.populate(text=''.join(sorted(characters)))
            sub.subset(font)
            font.flavor = 'woff2'
            filename = f'font-{index}.woff2'
            font.save(assets/filename)
            rules.append(f'@font-face{{font-family:{alias};src:url("assets/{filename}") format("woff2");font-display:block}}')
            for root in roots:
                for node in root.iter():
                    if node.get('font-family') == family:
                        node.set('font-family', alias)
            report.append({'requested': requested, 'resolved': actual, 'asset': filename})
        finally:
            font.close()
    return '\n'.join(rules), report


def html_document(title, sections):
    return ('<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{escape(title)}</title><link rel="stylesheet" href="template.css">'
            '</head><body>' + '\n'.join(sections) + '</body></html>\n')


def write_zip(directory, target):
    # Fixed metadata makes identical outputs produce identical archives.
    with ZipFile(target, 'x', compression=ZIP_DEFLATED) as archive:
        for path in sorted(directory.rglob('*')):
            if path.is_file():
                info = ZipInfo(path.relative_to(directory).as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, path.read_bytes())


def convert(source, output, uno_python='/usr/bin/python3'):
    started = time.monotonic()
    source, output = Path(source).resolve(), Path(output).resolve()
    archive, report_file = output.with_name(output.name + '.zip'), output.with_name(output.name + '.report.json')
    if any(p.exists() for p in (output, archive, report_file)):
        raise FileExistsError('Choose a fresh output path; existing results are never overwritten')
    info = source_info(source)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.pptx-', dir=output.parent) as temporary:
        work = Path(temporary)
        raw, package = work/'raw', work/'package'
        raw.mkdir()
        (package/'assets').mkdir(parents=True)
        worker = subprocess.Popen([uno_python, str(HERE/'office_export.py'), str(source), str(raw)],
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
        try:
            stdout, stderr = worker.communicate(timeout=90)
        except subprocess.TimeoutExpired:
            os.killpg(worker.pid, signal.SIGKILL)
            worker.communicate()
            raise RuntimeError('LibreOffice conversion exceeded 90 seconds')
        if worker.returncode:
            raise RuntimeError('LibreOffice export failed: ' + stderr[-3000:])
        pages = json.loads((raw/'pages.json').read_text())
        if len(pages) != info['slide_count']:
            raise RuntimeError('Page count changed during conversion')
        width, height = info['width_emu']/360, info['height_emu']/360
        slides = static_slides((raw/'presentation.svg').read_bytes())
        if len(slides) != len(pages):
            raise RuntimeError('SVG export page count mismatch')
        roots = [normalize_svg(slide, i+1, package/'assets', width, height)
                 for i, slide in enumerate(slides)]
        opacities = gradient_opacities(source)
        for root in roots:
            restore_gradient_opacity(root, opacities)
        font_css, fonts = embed_fonts(roots, package/'assets', info['warnings'])
        css = (f'{font_css}\n*{{box-sizing:border-box}}html,body{{margin:0;background:white}}'
               f'.slide{{position:relative;width:100%;aspect-ratio:{info["width_emu"]}/{info["height_emu"]};overflow:hidden;break-after:page}}'
               '.slide>svg{display:block;width:100%;height:100%}.placeholder{position:absolute;pointer-events:none}'
               f'@page{{size:{width/100}mm {height/100}mm;margin:0}}\n')
        (package/'template.css').write_text(css)
        sections = []
        for index, (root, page) in enumerate(zip(roots, pages), 1):
            slots = ''.join(f'<div class="placeholder" data-placeholder="{escape(s["name"], quote=True)}" '
                            f'style="left:{s["x"]/width*100:.6f}%;top:{s["y"]/height*100:.6f}%;'
                            f'width:{s["width"]/width*100:.6f}%;height:{s["height"]/height*100:.6f}%"></div>'
                            for s in page['placeholders'])
            section = f'<section class="slide" id="slide-{index:02}" data-slide="{index}">' + ET.tostring(root, encoding='unicode') + slots + '</section>'
            sections.append(section)
            (package/f'slide-{index:02}.html').write_text(html_document(f'Slide {index}', [section]))
        (package/'index.html').write_text(html_document(source.stem, sections))
        # Publish only finished HTML/CSS/assets. Reports and archive are siblings.
        output.mkdir()
        for path in package.iterdir():
            shutil.move(str(path), output/path.name)
        write_zip(output, archive)
        report = {**info, 'source_sha256': digest(source.read_bytes()), 'engine': subprocess.check_output(['libreoffice', '--version'], text=True).strip(),
                  'model_calls': 0, 'seconds': round(time.monotonic()-started, 3), 'fonts': fonts,
                  'pages': pages, 'output': str(output), 'archive': str(archive),
                  'fidelity': 'LibreOffice rendering; not a guarantee of pixel identity with Microsoft PowerPoint'}
        report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
        return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pptx', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--uno-python', default='/usr/bin/python3')
    args = parser.parse_args()
    report = convert(args.pptx, args.output or HERE/'build'/args.pptx.stem, args.uno_python)
    print(json.dumps({k: report[k] for k in ('output', 'archive', 'seconds', 'slide_count', 'model_calls', 'warnings')}, ensure_ascii=False, indent=2))
