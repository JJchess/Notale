const {chromium}=require('/tmp/notale-playwright/node_modules/playwright');
const assert=require('assert'),fs=require('fs');
(async()=>{const b=await chromium.launch({args:['--no-sandbox']}),results=[];
try{for(const reducedMotion of ['no-preference','reduce'])for(const id of ['magnetic-field','mycelium-growth','tactile-grid']){
const p=await b.newPage({viewport:{width:1600,height:900},reducedMotion}),errors=[];
p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url())});
await p.goto('http://localhost:41991/formal/build-cover/samples/generative/'+id+'/mini/pages/');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(900);
async function layout(){const data=await p.evaluate(()=>{scrollTo(9999,9999);return {w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight,x:scrollX,y:scrollY,bad:[...document.querySelectorAll('canvas,h1,.subtitle,.dipole,.tags,.count,.statement,footer')].filter(e=>{const r=e.getBoundingClientRect();return r.left<-.5||r.top<-.5||r.right>1600.5||r.bottom>900.5}).map(e=>e.className)}});assert.deepEqual(data,{w:1600,h:900,x:0,y:0,bad:[]},id)}
await layout();assert.equal(await p.evaluate(()=>document.querySelector('.field-fallback,.context-fallback,.webgl-fallback')!==null),false);
const snapshot=async()=>id==='tactile-grid'?await p.locator('canvas').screenshot():Buffer.from(await p.locator('canvas').evaluate(c=>c.toDataURL()));
if(id!=='tactile-grid')assert(await p.locator('canvas').evaluate(c=>{const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return new Set(a).size>16}));
let first=await snapshot(),changed=false;
for(let i=0;i<(id==='magnetic-field'&&reducedMotion==='no-preference'?4:2);i++){await p.waitForTimeout(id==='magnetic-field'&&reducedMotion==='no-preference'?3000:500);await layout();if(!first.equals(await snapshot()))changed=true}
assert.equal(changed,id!=='mycelium-growth'&&reducedMotion==='no-preference',id+' time response');
let clicks=0;
if(id==='tactile-grid'){
for(const[x,y]of[[800,450],[100,100],[1500,800],[1300,200]]){const before=await snapshot();await p.mouse.click(x,y);await p.waitForTimeout(300);assert(!before.equals(await snapshot()),'click produces wave');await layout();clicks++}
await p.locator('#stage').focus();await p.keyboard.press('Enter');await p.waitForTimeout(300);await layout();
}
await p.keyboard.press('r');await p.waitForTimeout(400);await layout();
if(id==='mycelium-growth'||reducedMotion==='reduce')assert(first.equals(await snapshot()),id+' deterministic reset');
await p.screenshot({path:'experiments/mini-1600-audit/cover-'+id+'-'+reducedMotion+'.png'});
assert.deepEqual(errors,[]);results.push({id,reducedMotion,document:'1600x900; scroll 0',coreBounds:true,fallback:false,temporalChange:changed,reset:true,clicks,keyboardWave:id==='tactile-grid'});await p.close();
}fs.writeFileSync('experiments/mini-1600-audit/cover-generative-checks.json',JSON.stringify(results,null,2)+'\n');console.log('PASS generative covers normal/reduced, paint/motion/reset, tactile clicks and Enter, bounds')}
finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
