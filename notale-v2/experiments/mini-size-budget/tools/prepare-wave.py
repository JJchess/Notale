from pathlib import Path
import re
p=Path('experiments/mini-size-budget/wave')
s=(p/'initial.html').read_text()
s=re.sub(r'<style[^>]*>.*?</style>','',s,flags=re.S)
s=re.sub(r'<script[^>]*>.*?</script>','',s,flags=re.S)
s=re.sub(r'<!--.*?-->','',s,flags=re.S)
s=s.replace(' data-ready="true"','')
s=re.sub(r'(<div class="wave-stage">).*?(</div></div></section>)',r'\1<svg style="overflow:visible"><path stroke="#0380f4" stroke-width="5" stroke-linecap="butt" fill="none" style="opacity:1;transition:opacity 500ms"></path></svg><svg class="axis"></svg><svg class="axis"></svg><div class="dot"></div>\2',s,flags=re.S)
s=re.sub(r'(<div class="air-space">).*?</div>',r'\1<canvas></canvas></div>',s,flags=re.S)
(p/'template.html').write_text(s)
# Keep exactly the original mathematical author functions, stripping Flow only at build time.
root=Path('workflows/build-interaction/samples/general/waveform-air-lab/mini/pages')
for name,src in [('math.js','src/helpers/waveform.helpers.js'),('dimensions.js','src/components/AirGrid/AirGrid.helpers.js'),('canvas.js','src/helpers/canvas.helpers.js')]:
 t=(root/src).read_text()
 t=re.sub(r'import type .*?;', '', t, flags=re.S)
 t=t.replace("import { range } from '../utils';",'const range=(a,b,s=1)=>{let r=[];for(;a<=b;a+=s)r.push(a);return r};')
 (p/name).write_text(t)
