const {chromium}=require('/tmp/notale-playwright/node_modules/playwright'),fs=require('fs'),assert=require('assert');
(async()=>{const b=await chromium.launch({args:['--no-sandbox'],ignoreDefaultArgs:['--hide-scrollbars']}),out=[];try{
 for(const [workflow,id,setup] of [
 ['build-interaction','state-maze-stories',async p=>{await p.locator('select').first().selectOption('alpha')}],
 ['build-page','artist-repetition-lab',async p=>{await p.locator('summary').click()}],
 ['build-page','illustrated-cover-shelves',async p=>{await p.waitForFunction(()=>{const e=document.querySelector('#viewport');return e&&e.scrollWidth>e.clientWidth})}]]){
 if(process.argv[2]&&id!==process.argv[2])continue;
 const catalog=JSON.parse(fs.readFileSync(`workflows/${workflow}/samples/catalog.json`));const row=catalog.samples.find(r=>r.id===id);const p=await b.newPage({viewport:{width:1600,height:900},reducedMotion:'reduce'});await p.goto(`http://localhost:41991/formal/${workflow}/${row.mini.root}/`);await setup(p);
 const result=await p.evaluate(()=>{const e=[...document.querySelectorAll('*')].find(e=>{const s=getComputedStyle(e);return ((s.overflowY==='auto'&&e.scrollHeight>e.clientHeight)||(s.overflowX==='auto'&&e.scrollWidth>e.clientWidth))&&e.clientHeight>30});if(!e)return null;e.setAttribute('data-scroll-test','');const horizontal=e.scrollWidth>e.clientWidth;return{horizontal,width:getComputedStyle(e,'::-webkit-scrollbar').width,rect:e.getBoundingClientRect().toJSON(),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,height:document.documentElement.scrollHeight}});
 assert(result,id+' expanded scroll');assert.equal(result.width,'8px');assert.equal(result.height,900);
 if(result.horizontal){const r=result.rect;await p.mouse.move(r.x+20,r.bottom-4);await p.mouse.down();await p.mouse.move(r.x+250,r.bottom-4,{steps:12});await p.mouse.up();assert(await p.locator('[data-scroll-test]').evaluate(e=>e.scrollLeft>0),'native thumb drag');result.drag=true;}
 else{await p.locator('[data-scroll-test]').hover();await p.mouse.wheel(0,450);await p.waitForFunction(()=>document.querySelector('[data-scroll-test]').scrollTop>0);result.wheel=true;}
 assert.equal(await p.evaluate(()=>scrollY),0);out.push({id,...result});await p.close();
 }
 fs.writeFileSync('experiments/mini-scrollbar-polish/expanded-checks.json',JSON.stringify(out,null,2));console.log('PASS',out.map(r=>r.id).join(', '));
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
