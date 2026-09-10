from pathlib import Path
import re,json,shutil
b=Path('experiments/mini-size-budget/crokinole');src=Path('workflows/build-interaction/samples/general/crokinole-shot-lab/mini/pages/src')
s=(src/'utils/crokinole.js').read_text()
s=s.replace('import Matter from "matter-js";','const Matter=window.Matter;').replace('import { Howl } from "howler";','const {Howl}=window;').replace('import * as S from "$data/specs.js";','import * as S from "./specs.js";').replace('import { muted } from "$stores/misc.js";','import { muted } from "./mute.js";').replace('import { base } from "$app/paths";','const base=".";')
v=json.loads((src/'data/variables.json').read_text());s=s.replace('import variables from "$data/variables.json";','const variables='+json.dumps({'color':{k:v['color'][k] for k in ['pink-aa','teal-aa','black']}})+';')
def function(name,body):
 global s
 a=s.index('\tfunction '+name+'(');start=s.index('{',a);level=1;i=start+1
 while level:
  if s[i]=='{':level+=1
  if s[i]=='}':level-=1
  i+=1
 s=s[:a]+body+s[i:]
# Preserve Matter body creation order and vertex counts; only deduplicate the factory.
function('createZones','''function createZones(){
const radii=[S.boardR,S.boardR-S.rimW,S.surfaceR,S.twentyR,S.fifteenR,S.tenR,S.fiveR],labels=['surface','surface','surface','20','15','10','5'];
const bodies=radii.map((r,i)=>Matter.Bodies.circle(S.center,S.center,r,{isStatic:true,isSensor:true,render:{visible,fillStyle:'rgba(0,0,0,0)',lineWidth:1},label:labels[i]},64));
Matter.Composite.add(world,[bodies[1],bodies[0],...bodies.slice(2)]);
}''')
function('createTrap20','''function createTrap(n,t,r,label,category){let trap=[];for(let i=0;i<n;i++){let angle=i/n*2*Math.PI;trap.push(Matter.Bodies.rectangle(S.center+Math.cos(angle)*r,S.center+Math.sin(angle)*r,t,2*Math.PI*r/n,{isStatic:true,isSensor:false,angle,render:{visible:false},label,collisionFilter:{category,mask:DISC_CATEGORY}}))}Matter.Composite.add(world,trap)}
function createTrap20(){const t=Math.max(2,S.twentyR);createTrap(16,t,S.twentyR+t/2-1,'trap 20',TRAP_CATEGORY)}''')
function('createTrapRim',"function createTrapRim(){const t=S.twentyR*4;createTrap(32,t,S.baseR-S.rimW+t/2-1,'trap rim',RIM_CATEGORY)}")
function('createTrapSurface',"function createTrapSurface(){const t=S.twentyR;createTrap(32,t,S.surfaceR-t/2+1,'trap surface',SURFACE_CATEGORY)}")
# This mini initializes with tutorial='practice' and only uses manual completion.
a=s.index('\t\t\tif (manual) {');stop=s.index('\n\t\t}\n\t}',a)
s=s[:a]+'''            emitter.emit("shotCompleteManual", { discs, valid });'''+s[stop:]
s=s.replace('let manual;','').replace('manual = !!tutorial;','')
# Every aim in this mini explicitly passes random:false, so bot aim jitter is unreachable.
function('getOscillatingValue','')
s=s.replace('const offset = random ? getOscillatingValue(speed) : 0;','const offset = 0;')
(b/'engine.js').write_text(s);shutil.copyfile(src/'data/specs.js',b/'specs.js');shutil.copyfile(src/'data/scenarios.json',b/'scenarios.json')
(b/'mute.js').write_text('let value=false,callbacks=[];export const muted={subscribe(f){callbacks.push(f);f(value)},update(f){value=f(value);callbacks.forEach(f=>f(value))}};')
h=(b/'initial.html').read_text();h=re.sub(r'<script[^>]*>.*?</script>','',h,flags=re.S);h=re.sub(r'<link[^>]*>','',h);h=re.sub(r'<!--.*?-->','',h,flags=re.S)
h=re.sub(r'(<div class="bg[^>]*>).*?(?=<div class="canvas-host)',r'<div class="bg"></div> ',h,flags=re.S)
h=re.sub(r'<canvas[^>]*>.*?</canvas>','',h,flags=re.S)
h=re.sub(r'\s*svelte-[\w]+','',h);h=re.sub(r'class="\s*"','',h)
(b/'template.html').write_text(h)
css=(b/'runtime.css').read_text();css=re.sub(r'\.svelte-[\w]+','',css);(b/'style.css').write_text(css)
