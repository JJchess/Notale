import {writeDiagramPayload} from './diagram-payload.js';
import {diagramTheme} from '../../src/diagram-theme.js';
import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,dirname,extname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {refineDOM} from './refine-dom.js';
import {extractDiagram} from './extract-diagram.js';
const frontend=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..');
const source=resolve(frontend,'../refs/template/organized'),out=resolve(frontend,'templates/refined');
const selected=['P004','E3-02','P002','P007','P015','P016','E1-02','E4-05'];
const titles:Record<string,string>={'P004':'金字塔 · 分层思考','E3-02':'三图 · 卡片排版','P002':'5W1H · 六维分析','P007':'黄金圈 · 由内而外','P015':'PREP · 表达步骤','P016':'ABC · 事件与信念','E1-02':'单图 · 工作回顾','E4-05':'四图 · 胶片排版'};
const fonts:[string,string,number][]=[['Notale CJK','NotaleCJK-Regular',400],['Notale CJK','NotaleCJK-Bold',700],['Notale CJK','NotaleCJK-Bold',800],['Notale Zen Hei','NotaleZenHei',400],['Notale Droid','NotaleDroid',400]];
const manifest=JSON.parse(await readFile(resolve(source,'native-template-manifest.json'),'utf8'));
await mkdir(resolve(out,'assets'),{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
const results=[];
try {
 for(const code of selected){
  const spec=manifest.pages.find((p:{code:string;width:number;height:number;html:string})=>p.code===code),original=resolve(source,spec.html);
  const page=await browser.newPage({viewport:{width:spec.width,height:spec.height},deviceScaleFactor:1,javaScriptEnabled:false});
  // Strip source runtime before navigation. Styles and original image assets remain available via file URLs.
  let input=await readFile(original,'utf8');
  input=input.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<svg class="fidelity-vector-layer"[\s\S]*?<\/svg>/g,'');
  input=input.replace('<head>',`<head><base href="${pathToFileURL(original).href}">`);
  await page.goto(pathToFileURL(original).href,{waitUntil:'load'});
  await page.setContent(input,{waitUntil:'load'});
  await page.evaluate(()=>document.fonts.ready);
  let html=await page.evaluate(refineDOM,spec);
  const assets:{path:string;mime:string;hash?:string}[]=[];
  for(const match of [...html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)]) {
   const value=match[1];if(!value||value.startsWith('data:'))continue;
   const path=fileURLToPath(new URL(value,pathToFileURL(original)));
   const bytes=await readFile(path),hash=createHash('sha256').update(bytes).digest('hex').slice(0,16);
   const name=hash+extname(path).toLowerCase();await copyFile(path,resolve(out,'assets',name));
   html=html.split(value).join(`assets/${name}`);
   if(!assets.some(a=>a.path===`assets/${name}`))assets.push({path:`assets/${name}`,mime:extname(name)==='.png'?'image/png':'image/jpeg'});
  }
  const used=fonts.filter(([family])=>html.includes(family));
  const fontCss=used.map(([family,file,weight])=>`@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;src:url("assets/${file}.woff2") format("woff2");font-display:block}`).join('\n');
  for(const [,file]of used)if(!assets.some(a=>a.path===`assets/${file}.woff2`))assets.push({path:`assets/${file}.woff2`,mime:'font/woff2'});
  const documentHtml=(body:string)=>`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}*{box-sizing:border-box}${fontCss}</style></head><body>${body}</body></html>`;
  await writeFile(resolve(out,code+'.html'),documentHtml(html));
  // Assign stable source IDs for grouping and clipboard remapping, including SVG definitions.
  await page.goto(pathToFileURL(resolve(out,code+'.html')).href,{waitUntil:'load'});
  await page.evaluate(()=>document.fonts.ready);
  const variants:{page:string;diagram?:Awaited<ReturnType<typeof extractDiagram>>}=await page.evaluate(({code})=>{
    const root=document.querySelector('[data-template]')!;let seq=0;
    for(const n of [root,...root.querySelectorAll('*')])n.setAttribute('data-notale-id',`${code.toLowerCase()}-${++seq}`);
    const result={page:root.outerHTML};
    return result;
  },{code});
  if(code.startsWith('P'))variants.diagram=await page.evaluate(extractDiagram,{code,theme:diagramTheme});
  html=variants.page; await writeFile(resolve(out,code+'.html'),documentHtml(html));
  await page.locator('[data-template]').screenshot({path:resolve(out,code+'.png')});
  if(variants.diagram){
    await writeFile(resolve(out,code+'-diagram.html'),documentHtml(variants.diagram.html));
    await page.setViewportSize({width:Math.ceil(variants.diagram.width),height:Math.ceil(variants.diagram.height)});
    await page.goto(pathToFileURL(resolve(out,code+'-diagram.html')).href,{waitUntil:'load'});
    await page.evaluate(()=>document.fonts.ready);
    await page.locator('[data-template]').screenshot({path:resolve(out,code+'-diagram.png')});
  }
  for(const asset of assets)asset.hash=createHash('sha256').update(await readFile(resolve(out,asset.path))).digest('hex');
  const payload={id:code,name:titles[code],width:spec.width,height:spec.height,html,fontCss,assets,diagram:variants.diagram};
  await writeFile(resolve(out,code+'.json'),JSON.stringify(payload));
  await writeDiagramPayload(out,payload);
  results.push({id:code,name:titles[code],category:spec.category,width:spec.width,height:spec.height,diagram:!!variants.diagram,thumbnail:code+'.png',source:spec.source,watermarkMasks:spec.watermarkMasks});
  console.log(code,Buffer.byteLength(html),'bytes',assets.length,'assets');await page.close();
 }
 await writeFile(resolve(out,'manifest.json'),JSON.stringify({version:1,templates:results},null,2));
} finally {await browser.close();}
