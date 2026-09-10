const {chromium}=require('/tmp/notale-playwright/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'review/music-sample-pair');
(async()=>{
const browser=await chromium.launch({args:['--no-sandbox']});const results=[];
try{
for(const [width,height] of [[1600,900],[900,900],[390,844]]){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:41991/review/music-sample-pair/');await page.waitForFunction(()=>window.samplePair?.state.ready);
 await page.evaluate(()=>document.fonts.ready);
 const initial=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,images:[...document.images].map(i=>i.complete&&i.naturalWidth>0),durations:samplePair.waves.map(w=>w.getDuration()),decoded:samplePair.waves.map(w=>w.getDecodedData().length),paused:samplePair.player.paused}));
 assert(!initial.overflow);assert(initial.images.every(Boolean));assert(initial.paused);assert(Math.abs(initial.durations[0]-7)<.1);assert(Math.abs(initial.durations[1]-8.5)<.1);assert(initial.decoded.every(n=>n>10000));
 await page.screenshot({path:path.join(dir,`shots/${width}x${height}-initial.png`),fullPage:true});
 await page.click('#sequence');await page.waitForFunction(()=>samplePair.player.currentTime>.3&&!samplePair.player.paused);await page.click('#pause');
 const frozen=await page.evaluate(()=>samplePair.player.currentTime);await page.waitForTimeout(300);assert(Math.abs((await page.evaluate(()=>samplePair.player.currentTime))-frozen)<.04);
 await page.locator('#seek').fill('5');assert(Math.abs((await page.evaluate(()=>samplePair.player.currentTime))-5)<.05);
 await page.click('#pause');await page.waitForFunction(()=>samplePair.state.active===1&&!samplePair.player.paused,{},{timeout:6000});
 await page.waitForFunction(()=>samplePair.player.currentTime>.2);await page.click('#pause');
 await page.screenshot({path:path.join(dir,`shots/${width}x${height}-b.png`),fullPage:true});
 await page.locator('#seek').fill('8.2');await page.click('#pause');await page.waitForFunction(()=>samplePair.player.ended&&!samplePair.state.sequence);
 await page.click('[data-play="0"]');await page.waitForFunction(()=>!samplePair.player.paused&&samplePair.state.active===0);
 await page.click('[data-play="1"]');await page.waitForFunction(()=>!samplePair.player.paused&&samplePair.state.active===1);
 const onePlayer=await page.evaluate(()=>samplePair.waves.every(w=>!w.isPlaying())&&!samplePair.player.paused);assert(onePlayer);
 await page.click('#reset');assert(await page.evaluate(()=>samplePair.state.active===0&&samplePair.player.paused&&samplePair.player.currentTime===0));
 await page.locator('#wave-1').click({position:{x:100,y:14}});assert(await page.evaluate(()=>samplePair.state.active===1&&samplePair.player.paused&&samplePair.player.currentTime>0));
 await page.locator('#seek').focus();const before=await page.locator('#seek').inputValue();await page.keyboard.press('ArrowRight');assert(Number(await page.locator('#seek').inputValue())>Number(before));
 assert.deepStrictEqual(errors,[]);results.push({width,height,...initial,pauseSeekSwitchEndResetKeyboard:true,oneAudiblePlayer:onePlayer,errors});await page.close();
}
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'assets.json')));for(const asset of manifest.assets){const bytes=fs.readFileSync(path.join(dir,asset.path));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),asset.sha256);if(!asset.source.startsWith('http'))assert(bytes.equals(fs.readFileSync(path.join(root,'sources/sample-trees',asset.source))));}
fs.writeFileSync(path.join(root,'evidence/music-pair-candidate-checks.json'),JSON.stringify({passed:true,results,originalAssetHashes:true},null,2)+'\n');console.log(JSON.stringify(results));
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
