import type {Snapshot} from '@notale/editor/browser';
type AuditWindow=Window & {NotaleWorkbench:{whenReady:()=>Promise<unknown>;showSlide:(id:string)=>Promise<unknown>}};
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.EDITOR_PREVIEW_URL ?? 'http://localhost:4312';
const documentId = process.env.EDITOR_AUDIT_DOCUMENT;
if (!documentId) throw Error('Set EDITOR_AUDIT_DOCUMENT to the document to inspect');
const baseline:Snapshot = await (await fetch(`${origin}/api/documents/${documentId}`)).json();
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
await mkdir('.local/lecture-preview-audit', {recursive: true});
const page = await browser.newPage({viewport: {width:1600,height:1000}});
const errors:{page:string;message:string}[] = [], requests:{page:string;path:string;error?:string;status?:number}[] = [], slides = [];
let current = 'startup';
const safePath = (value:string) => {const url = new URL(value);return url.pathname.replace(/\/content\/[^/]+\//, '/content/[signed]/');};
page.on('pageerror', error => errors.push({page:current,message:error.message}));
page.on('requestfailed', request => requests.push({page:current,path:safePath(request.url()),error:request.failure()?.errorText}));
page.on('response', response => {if(response.status()>=400)requests.push({page:current,path:safePath(response.url()),status:response.status()});});
await page.route('**/*', route => ['4310','4311'].includes(new URL(route.request().url()).port) ? route.abort() : route.continue());
try {
  await page.goto(`${origin}/?document=${documentId}`);
  await page.waitForFunction(()=>!!(window as unknown as AuditWindow).NotaleWorkbench);
  await page.evaluate(()=>(window as unknown as AuditWindow).NotaleWorkbench.whenReady());
  for (const [index,slide] of baseline.document.slides.entries()) {
    current = slide.sourcePath;
    await page.evaluate(id=>(window as unknown as AuditWindow).NotaleWorkbench.showSlide(id),slide.id);
    await page.evaluate(()=>(window as unknown as AuditWindow).NotaleWorkbench.whenReady());
    const frame = page.frames().find(frame=>frame!==page.mainFrame())!;
    await frame.evaluate(()=>document.fonts.ready);
    const report = await frame.evaluate(()=>({
      nestedWorkbenches:[] as {editorVisible:boolean;sourceCharacters:number}[],
      heading:document.querySelector('h1,h2')?.textContent?.trim(),
      canvases:[...document.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height})),
      brokenImages:[...document.images].filter(img=>img.complete&&img.naturalWidth===0).map(img=>img.getAttribute('src')),
      controls:document.querySelectorAll('input,select,button').length,
      bodySize:[document.body.scrollWidth,document.body.scrollHeight],
      headingStyle:(()=>{const el=document.querySelector('h1,h2');if(!el)return null;const s=getComputedStyle(el);return {font:s.fontFamily,size:s.fontSize};})(),
    }));
    report.nestedWorkbenches = [];
    for (const child of frame.childFrames().filter(child=>new URL(child.url()).pathname.includes('/lessons/'))) {
      await child.locator('.monaco-editor').waitFor({timeout:15000});
      report.nestedWorkbenches.push({editorVisible:await child.locator('.monaco-editor').isVisible(),sourceCharacters:(await child.locator('.view-lines').innerText()).length});
    }
    await page.locator('#interact').click();
    const stepControl = page.locator('#step');
    const maximum = Number(await stepControl.getAttribute('max'));
    if (maximum > 0) {
      await stepControl.fill(String(maximum));
      await page.waitForFunction(max=>document.getElementById('step-label')!.textContent!.trim()===`${max} / ${max}`,maximum);
      await stepControl.fill('0');
      await page.waitForFunction(max=>document.getElementById('step-label')!.textContent!.trim()===`0 / ${max}`,maximum);
    }
    const range = frame.locator('input[type="range"]').first();
    let slider;
    if (await range.count() && await range.isVisible() && await range.isEnabled()) {
      const before = await range.inputValue(), min = Number(await range.getAttribute('min') ?? 0), max = Number(await range.getAttribute('max') ?? 100);
      const next = Number(before) === max ? min : max;
      const canvasesBefore = await frame.locator('canvas').evaluateAll(nodes=>nodes.map(node=>{try{return (node as HTMLCanvasElement).toDataURL();}catch{return null;}}));
      await range.fill(String(next));
      await frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const canvasesAfter = await frame.locator('canvas').evaluateAll(nodes=>nodes.map(node=>{try{return (node as HTMLCanvasElement).toDataURL();}catch{return null;}}));
      slider = {before,after:await range.inputValue(),canvasChanged:JSON.stringify(canvasesBefore)!==JSON.stringify(canvasesAfter)};
      await range.fill(before);
    }
    await page.locator('#interact').click();
    slides.push({id:slide.id,path:slide.sourcePath,...report,maximumStep:maximum,slider});
    if ([0,6,13,20,31].includes(index)) await page.screenshot({path:`.local/lecture-preview-audit/page-${index+1}.png`});
    if((index+1)%8===0)console.log(`Loaded ${index+1}/${baseline.document.slides.length}`);
  }
  const after = await (await fetch(`${origin}/api/documents/${documentId}`)).json();
  const result = {documentId,pages:slides.length,version:baseline.version,unchanged:JSON.stringify(after)===JSON.stringify(baseline),errors,requests,slides};
  await writeFile('.local/lecture-preview-audit/report.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({pages:slides.length,unchanged:result.unchanged,errors,requests,brokenImages:slides.filter(s=>s.brokenImages.length)}));
  if(!result.unchanged||errors.length||requests.length||slides.some(s=>s.brokenImages.length))process.exitCode=1;
} finally {await browser.close();}
