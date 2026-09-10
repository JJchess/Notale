from pathlib import Path
import re,json
base=Path('experiments/mini-size-budget')
def edit(id,f,fn):
 p=base/'author'/id/f;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(fn((base/'before'/id/f).read_text()))
def pocket(s):
 s=re.sub(r"\s*let tooltip = brands.append\('div.tooltip'\)",'',s)
 s=re.sub(r"\s*let toolText = tooltip.append.*?const \$g =",'\n const $g =',s,flags=re.S)
 s=s.replace("'.display, .tooltip'","'.display'").replace('.tk-atlas','')
 return s
edit('pocket-fit-desk','fit-template.js',pocket)
# Classes rendered by neither the mini markup nor the chart/controller.
def foundation(s):
 s=re.sub(r'[^{}]*(?:\.scroll-text|\.mobile-text|\.graphic-legend|\.bin-vsGroup)[^{}]*\{[^{}]*\}','',s)
 return s.replace('.comp-brawl_graphic .chart .brawl ','.brawl ')
for f in ['style.css','original-brawl.css']:edit('foundation-shade-desk',f,foundation)
id='future-climate-analogy'
css=(base/'before'/id/'assets/app.css').read_text();types=re.findall(r'\.type-([^ ]+) \{ --chip:',css)
js=(base/'before'/id/'assets/app.js').read_text()
# Preserve taxonomy order and exact chip colors; compact only the CSS class encoding.
js=re.sub(r'function typeSlug\(type\) \{.*?\n  \}', 'const climateTypes = Object.entries(subtypesByZone).flatMap(([zone, types]) => types.map(type => `${zone}, ${type}`));\n  function typeSlug(type) { return climateTypes.indexOf(type); }',js,flags=re.S)
for i,t in enumerate(types):css=css.replace('.type-'+t+' ','.type-'+str(i)+' ')
for i,name in enumerate(['cold','cold-line','cold-bg','temperate','temperate-line','temperate-bg','tropical','tropical-line','tropical-bg','arid','arid-line','arid-bg','zone','zone-line','zone-bg']):
 css=re.sub(r'--'+name+r'(?![\w-])','--v'+str(i),css)
for f,s in [('assets/app.css',css),('assets/app.js',js)]:
 p=base/'author'/id/f;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s)
# The desktop override already fixes this font to 58 px. Express that before
# minification because clean-css drops a font shorthand whose size uses clamp().
edit('walk-photo-journal','style.css',lambda s:s.replace('font:clamp(44px,5.2vw,80px)/1.05 Georgia,serif','font:58px/1.05 Georgia,serif'))
