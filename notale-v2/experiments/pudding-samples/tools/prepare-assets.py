"""Copy original assets unchanged; emit small, traceable data subsets."""
import csv, hashlib, json, shutil, subprocess, os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / 'sources'
def copy(source, target, manifest):
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    manifest.append({'file': str(target.relative_to(target.parents[1])), 'source': os.path.relpath(source, ROOT), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'bytes': target.stat().st_size})

for name, repo in [('wine-bottle-choice','wine-animals'),('waistline-cohorts','womens-sizing'),('brand-size-atlas','womens-sizing')]:
    dest = ROOT/'review'/name
    src = SOURCES/repo
    manifest=[]
    if name == 'wine-bottle-choice':
        for animal in ['lion','bird','pig','frog']:
            copy(src/f'static/assets/images/spins/{animal}spin.webp',dest/f'assets/{animal}spin.webp',manifest)
    if name == 'waistline-cohorts':
        for prefix in ['junior','2','12','24']:
            for layer in ['base','hair','bottom','top']:
                for v in range(1,5):
                    p=f'{prefix}-{layer}-{v}.png'
                    copy(src/'static/assets/avatars'/p,dest/'assets'/p,manifest)
        for p in ['tween-avatar-bg.png','teen-avatar-bg.png']:
            copy(src/'static/assets/avatars'/p,dest/'assets'/p,manifest)
        copy(ROOT.parents[1]/'vendor/chassis/lib/d3.min.js',dest/'assets/d3.min.js',manifest)
        points=list(csv.DictReader((src/'src/data/pointsData_JD.csv').open()))
        astm=json.loads((src/'src/data/ASTMsizes.json').read_text())
        (dest/'data.json').write_text(json.dumps({'points':points,'astm':astm},separators=(',',':')))
    if name == 'brand-size-atlas':
        rows=json.loads((src/'src/data/sizeCharts.json').read_text())
        rows=[d for d in rows if d['brand'] not in ['Banana Republic','Polo Ralph Lauren'] and d['sizeRange'].lower()=='regular' and d['waistMin'] is not None]
        astm=list(csv.DictReader((src/'src/data/ASTMsizes.csv').open()))
        for d in astm:
            if d['year']=='2021' and d['sizeRange']=='straight':
                rows.append({'brand':'ASTM','alphaSize':d['alphaSize'],'numericSizeMin':d['size'],'numericSizeMax':d['size'],'waistMin':float(d['waist']),'waistMax':float(d['waist']),'sizeRange':'Regular'})
        (dest/'data.json').write_text(json.dumps(rows,separators=(',',':')))
        if (ROOT/'review/waistline-cohorts/assets/Atlas-Regular.woff2').exists():
            shutil.copyfile(ROOT/'review/waistline-cohorts/assets/Atlas-Regular.woff2',dest/'assets/Atlas-Regular.woff2')
    shutil.copyfile(src/'LICENSE',dest/'LICENSE.source')
    fonts={'National-Regular.woff2':'national/National2Web-Regular.woff2','Tiempos-Regular.woff2':'tiempos/TiemposTextWeb-Regular.woff2','Atlas-Regular.woff2':'atlas/AtlasGrotesk-Regular-Web.woff2'}
    for local,remote in fonts.items():
        font=dest/'assets'/local
        if font.exists(): manifest.append({'file':f'assets/{local}','source':f'https://pudding.cool/assets/fonts/{remote}','sha256':hashlib.sha256(font.read_bytes()).hexdigest(),'bytes':font.stat().st_size})
    inputs={'wine-bottle-choice':['src/components/Intro.Bottles.svelte','src/components/SpinningBottle.svelte','src/data/wineData_median.csv'],'waistline-cohorts':['src/data/pointsData_JD.csv','src/data/ASTMsizes.json','src/components/womens_sizes/IntroJD.svelte','src/components/utils/avatar-generator.js'],'brand-size-atlas':['src/data/sizeCharts.json','src/data/ASTMsizes.csv','src/components/womens_sizes/SizeChartJD.svelte']}[name]
    input_hashes=[{'path':f,'sha256':hashlib.sha256((src/f).read_bytes()).hexdigest()} for f in inputs]
    (dest/'assets.json').write_text(json.dumps({'repo':f'https://github.com/the-pudding/{repo}','commit':subprocess.check_output(['git','-C',str(src),'rev-parse','HEAD'],text=True).strip(),'sourceInputs':input_hashes,'assets':manifest},indent=2))
    print(name,len(manifest),'original files')
