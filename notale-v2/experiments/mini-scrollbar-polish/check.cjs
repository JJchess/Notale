const {chromium}=require('/tmp/notale-playwright/node_modules/playwright');
const fs=require('fs'),assert=require('assert');
(async()=>{
 const b=await chromium.launch({args:['--no-sandbox'],ignoreDefaultArgs:['--hide-scrollbars']}); const results=[];
 try {for(const row of JSON.parse(fs.readFileSync('experiments/mini-scrollbar-polish/changed.json'))){
  const page=await b.newPage({viewport:{width:1600,height:900},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
  await page.goto(`http://localhost:41991/formal/${row.workflow}/${row.root}/`);await page.waitForTimeout(1000);
  if(row.id==='population-clock'){
   await page.locator('#time').fill('01:00');await page.locator('#time').dispatchEvent('change');await page.locator('#details').click();
  }
  const inspect=()=>{
   const d=document.documentElement;
   window.scrollTo(1600,1800);const doc={width:d.scrollWidth,height:d.scrollHeight,x:scrollX,y:scrollY}; window.scrollTo(0,0);
   const scrolls=[...document.querySelectorAll('*')].filter(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return r.width&&r.height&&((/auto|scroll/.test(s.overflowY)&&e.scrollHeight>e.clientHeight)||(/auto|scroll/.test(s.overflowX)&&e.scrollWidth>e.clientWidth))}).map(e=>{
    const s=getComputedStyle(e,'::-webkit-scrollbar-thumb'),track=getComputedStyle(e,'::-webkit-scrollbar-track'),bar=getComputedStyle(e,'::-webkit-scrollbar');const prev=[e.scrollLeft,e.scrollTop];e.scrollLeft=100;e.scrollTop=100;const moved=e.scrollLeft>0||e.scrollTop>0;e.scrollLeft=prev[0];e.scrollTop=prev[1];return{element:e.id||e.className,thumb:s.backgroundColor,track:track.backgroundColor,width:bar.width,height:bar.height,moved};
   });return{doc,scrolls,linked:!!document.querySelector('link[href="mini-scrollbars.css"]')};
  };
  const layout=await page.evaluate(inspect);assert(layout.linked,row.id+' linked');assert.deepStrictEqual(layout.doc,{width:1600,height:900,x:0,y:0},row.id+' document');assert.equal(errors.length,0,errors.join('\n'));
  for(const s of layout.scrolls){assert(s.moved,row.id+' scroll '+s.element);assert.equal(s.width,'8px',row.id+' width');assert.equal(s.track,'rgba(0, 0, 0, 0)',row.id+' transparent track');}
  if(['walk-photo-journal','masked-wrestler-index','illustrated-cover-shelves','population-clock','coin-flip-wealth'].includes(row.id))await page.screenshot({path:`experiments/mini-scrollbar-polish/${row.id}.png`});
  if(row.id==='population-clock'){
   await page.locator('.close').click();await page.locator('#theme').click();await page.locator('#details').click();const light=await page.evaluate(inspect);assert.notEqual(light.scrolls[0]?.thumb,layout.scrolls[0]?.thumb,'theme changes thumb');layout.light=light;await page.screenshot({path:'experiments/mini-scrollbar-polish/population-clock-light.png'});
  }
  results.push({...row,...layout,errors});console.log(row.id,layout.scrolls.length,'scroll areas PASS');await page.close();
 }}finally{await b.close();fs.writeFileSync('experiments/mini-scrollbar-polish/checks.json',JSON.stringify(results,null,2)+'\n')}
})().catch(e=>{console.error(e);process.exit(1)});
