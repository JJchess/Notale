"""Fetch the reviewed, version-pinned font assets. No system installation or subsetting.

Run explicitly during library maintenance; never from a model generation request.
The generated manifest is an asset inventory, not a theme format.
"""
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen
from zipfile import ZipFile

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent
LOCK = json.loads((ROOT / 'manifest.json').read_text()) if (ROOT / 'manifest.json').exists() else {}
GOOGLE_REV = 'baa2e5561af8a4873b058859dcfe158bdd033942'
GOOGLE = f'https://raw.githubusercontent.com/google/fonts/{GOOGLE_REV}/ofl'
GOOGLE_FILES = {
    'noto-sans-sc': ('notosanssc', ['NotoSansSC[wght].ttf']),
    'noto-serif-sc': ('notoserifsc', ['NotoSerifSC[wght].ttf']),
    'zcool-kuaile': ('zcoolkuaile', ['ZCOOLKuaiLe-Regular.ttf']),
    'zcool-qingke': ('zcoolqingkehuangyou', ['ZCOOLQingKeHuangYou-Regular.ttf']),
    'zcool-xiaowei': ('zcoolxiaowei', ['ZCOOLXiaoWei-Regular.ttf']),
    'inter': ('inter', ['Inter[opsz,wght].ttf', 'Inter-Italic[opsz,wght].ttf']),
    'barlow-condensed': ('barlowcondensed', ['BarlowCondensed-Regular.ttf', 'BarlowCondensed-Bold.ttf', 'BarlowCondensed-ExtraBold.ttf']),
    'space-grotesk': ('spacegrotesk', ['SpaceGrotesk[wght].ttf']),
    'source-serif-4': ('sourceserif4', ['SourceSerif4[opsz,wght].ttf', 'SourceSerif4-Italic[opsz,wght].ttf']),
    'bodoni-moda': ('bodonimoda', ['BodoniModa[opsz,wght].ttf', 'BodoniModa-Italic[opsz,wght].ttf']),
    'fraunces': ('fraunces', ['Fraunces[SOFT,WONK,opsz,wght].ttf']),
    'jetbrains-mono': ('jetbrainsmono', ['JetBrainsMono[wght].ttf']),
    'caveat': ('caveat', ['Caveat[wght].ttf']),
    'press-start-2p': ('pressstart2p', ['PressStart2P-Regular.ttf']),
    'orbitron': ('orbitron', ['Orbitron[wght].ttf']),
    'nunito-sans': ('nunitosans', ['NunitoSans[YTLC,opsz,wdth,wght].ttf']),
}


def fetch(url):
    with urlopen(quote(url, safe=':/%'), timeout=120) as r:
        return r.read()


def put(folder, name, data):
    path = folder / name
    expected = next((f['sha256'] for f in LOCK.get(folder.name, {}).get('files', []) if f['file'] == name), None)
    if expected and sha256(data).hexdigest() != expected:
        raise ValueError(f'Pinned asset hash differs; review source before updating: {path}')
    if path.exists() and path.read_bytes() != data:
        raise ValueError(f'Existing asset differs; review before replacing: {path}')
    if not path.exists():
        path.write_bytes(data)
    return path


def metadata(path, url):
    with TTFont(path) as font:
        family = font['name'].getDebugName(16) or font['name'].getDebugName(1)
        axes = {a.axisTag: [a.minValue, a.maxValue] for a in font['fvar'].axes} if 'fvar' in font else {}
        weight = ' '.join(str(int(v)) for v in axes['wght']) if 'wght' in axes else str(font['OS/2'].usWeightClass)
        italic = bool(font['OS/2'].fsSelection & 1)
        return {'file': path.name, 'family': family, 'weight': weight,
                'style': 'italic' if italic else 'normal', 'axes': axes,
                'sha256': sha256(path.read_bytes()).hexdigest(), 'bytes': path.stat().st_size,
                'source': url}


def google_font(item):
    key, (upstream, filenames) = item
    folder = ROOT / key
    folder.mkdir(parents=True, exist_ok=True)
    license_url = f'{GOOGLE}/{upstream}/OFL.txt'
    put(folder, 'OFL.txt', fetch(license_url))
    files = []
    for i, filename in enumerate(filenames):
        url = f'{GOOGLE}/{upstream}/{filename}'
        path = put(folder, f'face-{i}.ttf', fetch(url))
        files.append(metadata(path, url))
    print(key, sum(f['bytes'] for f in files), flush=True)
    return key, {'files': files, 'license': 'OFL.txt', 'license_source': license_url,
                 'source': f'https://github.com/google/fonts/tree/{GOOGLE_REV}/ofl/{upstream}', 'version': GOOGLE_REV}


def special_font(key, version, base, license_url, files=None, archive=None, member_suffix=None):
    folder = ROOT / key
    folder.mkdir(parents=True, exist_ok=True)
    put(folder, 'OFL.txt', fetch(license_url))
    records = []
    notices = []
    if archive:
        url = base + archive
        with ZipFile(BytesIO(fetch(url))) as z:
            for name in z.namelist():
                if name.startswith('LICENSES/') and name.endswith('.txt'):
                    relative = Path(name)
                    if '..' in relative.parts:
                        raise ValueError('Unsafe archive notice path')
                    (folder / relative.parent).mkdir(parents=True, exist_ok=True)
                    put(folder, name, z.read(name))
                    notices.append(name)
            candidates = [n for n in z.namelist() if n.lower().endswith(member_suffix)]
            # Smiley provides both OTF and TTF WOFF2; prefer its OTF WOFF2.
            if len(candidates) > 1:
                candidates = [n for n in candidates if n.lower().endswith('.otf.woff2')]
            if len(candidates) != 1:
                raise ValueError(f'Ambiguous font member: {key} {candidates}')
            path = put(folder, 'face-0.woff2', z.read(candidates[0]))
            records.append(metadata(path, url + '#' + candidates[0]))
    else:
        for i, filename in enumerate(files):
            url = base + filename
            path = put(folder, f'face-{i}.ttf', fetch(url))
            records.append(metadata(path, url))
    print(key, sum(f['bytes'] for f in records), flush=True)
    return key, {'files': records, 'license': 'OFL.txt', 'notices': notices, 'license_source': license_url,
                 'source': base, 'version': version}


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=5) as pool:
        entries = dict(pool.map(google_font, GOOGLE_FILES.items()))
    for key, value in [
        special_font('lxgw-wenkai', 'v1.522', 'https://github.com/lxgw/LxgwWenKai/releases/download/v1.522/',
                     'https://raw.githubusercontent.com/lxgw/LxgwWenKai/v1.522/OFL.txt',
                     files=['LXGWWenKai-Regular.ttf', 'LXGWWenKai-Medium.ttf']),
        special_font('smiley-sans', 'v2.0.1', 'https://github.com/atelier-anchor/smiley-sans/releases/download/v2.0.1/',
                     'https://raw.githubusercontent.com/atelier-anchor/smiley-sans/v2.0.1/LICENSE',
                     archive='smiley-sans-v2.0.1.zip', member_suffix='.woff2'),
        special_font('fusion-pixel', '2026.09.01', 'https://github.com/TakWolf/fusion-pixel-font/releases/download/2026.09.01/',
                     'https://raw.githubusercontent.com/TakWolf/fusion-pixel-font/2026.09.01/LICENSE-OFL',
                     archive='fusion-pixel-font-12px-proportional-otf.woff2-v2026.09.01.zip', member_suffix='zh_hans.otf.woff2'),
    ]:
        entries[key] = value
    # Reproducible generated inventory: original bytes, real font metadata, pinned URLs.
    (ROOT / 'manifest.json').write_text(json.dumps(entries, ensure_ascii=False, indent=2) + '\n')
    print('FONT LIBRARY', len(entries), 'families', sum(f['bytes'] for r in entries.values() for f in r['files']), 'bytes')


if __name__ == '__main__':
    main()
