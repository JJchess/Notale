const fs=require('fs'),path=require('path'),assert=require('assert'),{chromium}=require('/tmp/notale-playwright/node_modules/playwright');
const base='experiments/mini-size-budget';
(async()=>{const b=await chromium.launch({args:['--no-sandbox'],ignoreDefaultArgs:['--hide-scrollbars']}),results=[];try{
const plans={
 'artist-repetition-lab':{ready:()=>window.discography?.widget.loadedArtist==='Gwen Stefani',states:[async(p,$)=>{await p.selectOption('#artist','Glee Cast');await p.waitForFunction(()=>discography.widget.loadedArtist==='Glee Cast')},async(p,$)=>{await p.locator('summary').click();await p.locator($('#song-list button')).last().click()}]},
 'future-climate-analogy':{ready:()=>window.__CLIMATE_SAMPLE__?.cityCount===70,states:[async(p,$)=>{await p.locator('[data-city]').first().click();await p.locator('button[data-zone]').first().click();await p.locator('[data-confirm]').click()},async(p,$)=>p.locator('#unit').click()]},
 'pocket-fit-desk':{ready:()=>document.querySelectorAll('.fit-brand').length===80,states:[async(p,$)=>{await p.locator('#objects button').first().click()},async(p,$)=>{await p.locator($('.fit-brand')).first().click()}]},
 'walk-photo-journal':{ready:()=>!!window.walkDebug,states:[async(p,$)=>{await p.locator('.tile').first().click()},async(p,$)=>{await p.locator('#next').click()}]},
 'illustrated-cover-shelves':{ready:()=>!!window.shelfDebug,states:[async(p,$)=>{await p.locator('.cover').first().click()},async(p,$)=>{await p.locator('.detail button').click()}]},
 'foundation-shade-desk':{ready:()=>!!window.foundationDesk,states:[async(p,$)=>{await p.locator('#counts').click();await p.locator('#fenty').check()},async(p,$)=>{await p.locator($('.bin-category')).last().click()}]},
 'masked-wrestler-index':{ready:()=>!!window.wrestling,states:[async(p,$)=>{await p.locator('#language').click();await p.locator('#more').click()},async(p,$)=>{await p.locator('.mask').nth(60).click()}]},
 'yearbook-hair-timeline':{ready:()=>!!window.hairTimeline,states:[async(p,$)=>{await p.locator('#year').fill('1985')}]},
 'dress-code-clothing':{ready:()=>!!window.clothingChart,states:[async(p,$)=>{await p.locator('[data-step="4"]').click()},async(p,$)=>{await p.locator('.clothes__item').first().click();await p.locator('#methods').evaluate(e=>e.open=true)}]}
};
for(const row of JSON.parse(fs.readFileSync(`${base}/plain-refined.json`))){if(process.argv[2]&&!process.argv.slice(2).includes(row.id))continue;const source=JSON.parse(fs.readFileSync(`${base}/baseline.json`)).find(r=>r.id===row.id),url=`http://localhost:41991/formal/${source.root.replace(/^workflows\//,'')}/`,r={id:row.id,chars:row.chars,variants:[]};
for(const variant of ['before','after']){const p=await b.newPage({viewport:{width:1600,height:900},reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('response',e=>{if(e.status()>=400)errors.push(e.status()+' '+e.url())});
 await p.addInitScript(()=>{let seed=23;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296)});
 await p.route(url+'**',async route=>{const rel=decodeURIComponent(new URL(route.request().url()).pathname.slice(new URL(url).pathname.length))||'index.html';const f=path.join(base,variant==='before'?'before':'combined',row.id,rel);if(fs.existsSync(f)&&fs.statSync(f).isFile())await route.fulfill({path:f});else await route.continue()});
 await p.goto(url);const $=s=>variant==='before'?s:Object.entries(row.aliases).reduce((s,[a,b])=>s.split(a).join(b),s);
 const ready=variant==='after'?String(plans[row.id].ready).replaceAll('.fit-brand',$('.fit-brand')):String(plans[row.id].ready);await p.waitForFunction(`(${ready})()`);
 const shots=[];for(let state=0;state<=plans[row.id].states.length;state++){
  if(state)await plans[row.id].states[state-1](p,$);
  await p.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>{let r=i.getBoundingClientRect();return r.width&&r.height&&r.top<900&&r.bottom>0&&r.left<1600&&r.right>0}).map(i=>i.decode().catch(()=>{})))});
  await p.waitForTimeout(700);
  if(row.id==='masked-wrestler-index')await p.waitForFunction(()=>document.querySelector('canvas').dataset.settled===wrestling.selected.id);
  const geometry=await p.evaluate(()=>{scrollTo(9999,9999);return{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,x:scrollX,y:scrollY}});assert.deepStrictEqual(geometry,{width:1600,height:900,x:0,y:0},row.id+' '+variant);
  const f=`${base}/screens/${row.id}-${state}-${variant}.png`;fs.mkdirSync(path.dirname(f),{recursive:true});await p.screenshot({path:f,animations:'disabled'});shots.push({state,file:f,geometry});
 }
 assert.deepStrictEqual(errors,[],row.id+' '+variant);r.variants.push({variant,shots,errors});await p.close();}
results.push(r);fs.writeFileSync(`${base}/comparison-${process.argv[2]||'all'}.json`,JSON.stringify(results,null,2));console.log('captured',row.id);
}
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
