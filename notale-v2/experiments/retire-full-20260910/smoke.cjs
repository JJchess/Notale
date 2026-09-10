// One browser, isolated sample contexts; the server exposes workflows only.
const { chromium } = require('/tmp/notale-playwright/node_modules/playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const root = path.resolve('workflows');
const types = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript',
  '.css':'text/css','.json':'application/json','.svg':'image/svg+xml',
  '.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp', '.wasm':'application/wasm',
  '.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg','.mp4':'video/mp4'};
const server = http.createServer((req,res)=>{
  try {
    let file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
    if(file!==root&&!file.startsWith(root+path.sep))return res.writeHead(403).end();
    if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(404).end(); }
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const rows=['build-cover','build-page','build-interaction'].flatMap(wf=>
    JSON.parse(fs.readFileSync(path.join(root,wf,'samples/catalog.json'))).samples
      .map(r=>({...r,wf})));
  const capture=process.argv.includes('--shots'),selected=process.argv.slice(2).filter(x=>x!=='--shots');
  if(selected.length)rows.splice(0,rows.length,...rows.filter(r=>selected.includes(r.id)));
  const results=[],browser=await chromium.launch({args:['--no-sandbox']});
  let next=0;
  async function worker(){
    while(next<rows.length){
      const r=rows[next++],context=await browser.newContext({viewport:{width:1600,height:900}});
      const page=await context.newPage(),errors=[],missing=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('response',p=>{if(p.status()>=400&&!p.url().endsWith('/favicon.ico'))missing.push([p.status(),p.url()]);});
      const item={id:r.id,errors,missing};
      try {
        await page.goto(`${origin}/${r.wf}/${r.mini.root}/index.html`,{waitUntil:'load',timeout:20000});
        await page.waitForTimeout(capture?(r.shots?.[0]?.wait||1200):600);
        item.stage=await page.evaluate(()=>({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight,body:document.body.innerText.length}));
        let shotIndex=0;
        const directory=path.join(root,r.wf,'samples',r.category,r.id,'shots');
        async function screenshot(){if(capture){fs.mkdirSync(directory,{recursive:true});await page.screenshot({path:path.join(directory,String(shotIndex++).padStart(2,'0')+'.png')});}}
        await screenshot();
        if(r.shots?.length>1) {
          for(const shot of (r.shots||[]).slice(1)){
            if(shot.after)await page.evaluate(shot.after);
            await page.waitForTimeout(capture?(shot.wait||1000):250);await screenshot();
          }
          item.authoredStates=true;
        }
      } catch(e){errors.push(e.message);}
      results.push(item);await context.close();
    }
  }
  try{await Promise.all([worker(),worker(),worker()]);}
  finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
  const failed=results.filter(r=>r.errors.length||r.missing.length);
  const report='experiments/retire-full-20260910/browser.json';
  const previous=selected.length&&fs.existsSync(report)?JSON.parse(fs.readFileSync(report)).results:[];
  const merged=[...previous.filter(r=>!results.some(next=>next.id===r.id)),...results];
  fs.writeFileSync(report,JSON.stringify({scope:'Mini initial loads and registered screenshot states; workflows-only HTTP server, no legacy mount',results:merged},null,2)+'\n');
  console.log(JSON.stringify({pages:results.length,failed},null,2));
  if(failed.length)process.exitCode=1;
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
