"""Install self-contained, palette-aware scrollbar styles in minis with local scrolling."""
from pathlib import Path
import json, shutil

TARGETS = set('pocket-fit-desk state-maze-stories crossword-representation waveform-air-lab coin-flip-wealth grandmas-kimchi-kitchen walk-photo-journal illustrated-cover-shelves jersey-edition-board iconography-lens dog-flow-atlas pantheon-index population-clock banknote-firsts foundation-shade-desk masked-wrestler-index artist-repetition-lab yearbook-hair-timeline dress-code-clothing'.split())
CSS = '''/* Local scrollbars inherit the surrounding ink, including light/dark themes. */
@supports selector(::-webkit-scrollbar) {
  * { scrollbar-width: auto !important; scrollbar-color: auto !important; }
  *::-webkit-scrollbar { width: 8px !important; height: 8px !important; }
  *::-webkit-scrollbar-track, *::-webkit-scrollbar-corner { background: transparent !important; }
  *::-webkit-scrollbar-thumb {
    background: #8888 !important;
    background: color-mix(in srgb, currentColor 28%, transparent) !important;
    border: 2px solid transparent !important;
    border-radius: 999px !important;
    background-clip: padding-box !important;
    min-height: 28px !important;
    min-width: 28px !important;
  }
  *::-webkit-scrollbar-thumb:hover {
    background-color: color-mix(in srgb, currentColor 46%, transparent) !important;
  }
  *::-webkit-scrollbar-thumb:active {
    background-color: color-mix(in srgb, currentColor 62%, transparent) !important;
  }
}
@supports not selector(::-webkit-scrollbar) {
  * { scrollbar-width: thin !important; scrollbar-color: #8888 transparent !important; }
  @supports (color: color-mix(in srgb, black, transparent)) {
    * { scrollbar-color: color-mix(in srgb, currentColor 28%, transparent) transparent !important; }
    *:hover, *:focus-visible { scrollbar-color: color-mix(in srgb, currentColor 46%, transparent) transparent !important; }
  }
}
@media (forced-colors: active) {
  * { scrollbar-width: auto !important; scrollbar-color: auto !important; }
  *::-webkit-scrollbar-thumb { background: ButtonText !important; }
}
'''
changed=[]
for catalog in Path('workflows').glob('*/samples/catalog.json'):
    data=json.loads(catalog.read_text())
    dirty=False
    for row in data['samples']:
        if row['id'] not in TARGETS: continue
        spec=row['mini']
        if spec['root']==row['full']['root']:
            old=catalog.parent.parent/spec['root']
            new=old.parent/'mini/pages'
            shutil.copytree(old,new,dirs_exist_ok=True)
            note=new/'SAMPLE.md'
            if note.exists(): note.write_text(note.read_text().replace('(../provenance/', '(../../provenance/'))
            spec['root']=str(new.relative_to(catalog.parent.parent))
            html=(new/'index.html').read_text().replace('../../../../../index.html','../../../../../../index.html')
            (new/'index.html').write_text(html)
            spec['omitted']={k.replace('../../../../../index.html','../../../../../../index.html'):v for k,v in spec.get('omitted',{}).items()}
        root=catalog.parent.parent/spec['root']
        html=(root/'index.html').read_text()
        if 'href="mini-scrollbars.css"' not in html:
            link='<link rel="stylesheet" href="mini-scrollbars.css">'
            if '</head>' in html: html=html.replace('</head>',link+'</head>',1)
            elif '<body' in html: html=html.replace('<body',link+'<body',1)
            else: html=html.replace('</html>',link+'</html>',1)
            assert link in html
            (root/'index.html').write_text(html)
        (root/'mini-scrollbars.css').write_text(CSS)
        if 'mini-scrollbars.css' not in spec['files']: spec['files'].append('mini-scrollbars.css')
        spec['chars']=sum(len((root/f).read_text()) for f in spec['files'])
        changed.append({'id':row['id'],'workflow':catalog.parent.parent.name,'root':spec['root']})
        dirty=True
    if dirty: catalog.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
Path('experiments/mini-scrollbar-polish/changed.json').write_text(json.dumps(changed,indent=2)+'\n')
print(f'Styled {len(changed)} minis')
