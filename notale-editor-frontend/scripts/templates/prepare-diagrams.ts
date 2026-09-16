import {writeDiagramPayload} from './diagram-payload.js';
import {diagramTheme} from '../../src/diagram-theme.js';
import{chromium}from'@playwright/test';import{readFile,writeFile}from'node:fs/promises';import{resolve}from'node:path';import{pathToFileURL}from'node:url';import{extractDiagram}from'./extract-diagram.js';
const base=resolve('templates/refined');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
try{for(const code of (process.env.DIAGRAM_CODES?.split(',')??['P004','P007','P002','P015','P016'])){
 const data=JSON.parse(await readFile(`${base}/${code}.json`,'utf8'));
 const page=await browser.newPage({viewport:{width:data.width,height:data.height}});await page.goto(pathToFileURL(`${base}/${code}.html`).href);await page.evaluate(()=>document.fonts.ready);
 data.diagram=await page.evaluate(extractDiagram,{code,theme:diagramTheme});
 await writeDiagramPayload(base,data);
 await writeFile(`${base}/${code}.json`,JSON.stringify(data));
 await writeFile(`${base}/${code}-diagram.html`,`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>html,body{margin:0;background:white}*{box-sizing:border-box}${data.fontCss}</style></head><body>${data.diagram.html}</body></html>`);
 await page.setViewportSize({width:Math.ceil(data.diagram.width),height:Math.max(256,Math.ceil(data.diagram.height))});await page.goto(pathToFileURL(`${base}/${code}-diagram.html`).href);await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({timeout:5000,clip:{x:0,y:0,width:Math.ceil(data.diagram.width),height:Math.ceil(data.diagram.height)},path:`${base}/${code}-diagram.png`});await page.close();console.log(code,Math.round(data.diagram.width),Math.round(data.diagram.height));
}}finally{await browser.close();}
