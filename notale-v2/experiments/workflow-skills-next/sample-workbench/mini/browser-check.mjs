#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from '/tmp/notale-playwright/node_modules/playwright/index.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(fs.readFileSync(path.join(here,'manifest.json'),'utf8'));
const baseArgument=process.argv.find(argument=>argument.startsWith('--base-url='));
const sampleArgument=process.argv.find(argument=>argument.startsWith('--sample='));
const baseUrl=(baseArgument?.split('=')[1] || 'http://127.0.0.1:41031').replace(/\/$/,'');
const requested=sampleArgument?.slice('--sample='.length);
const required=manifest.samples.filter(sample=>
  sample.decision==='required' &&
  sample.status==='promoted' &&
  (!requested || sample.key===requested) &&
  fs.existsSync(path.resolve(here,sample.mini,'index.html')) &&
  fs.existsSync(path.join(here,sample.key,'report.json'))
);

if(requested && !required.length){
  console.error(`No promoted mini for ${requested}`);
  process.exit(2);
}

const browser=await chromium.launch();
const results=[];

for(const sample of required){
  for(const profile of [
    {name:'1600-normal',viewport:{width:1600,height:900},reducedMotion:'no-preference'},
    {name:'1280-reduced',viewport:{width:1280,height:720},reducedMotion:'reduce'},
    {
      name:'1600-to-1280-resize',
      viewport:{width:1600,height:900},
      resizeTo:{width:1280,height:720},
      reducedMotion:'no-preference'
    }
  ]){
    const context=await browser.newContext({viewport:profile.viewport,reducedMotion:profile.reducedMotion});
    const page=await context.newPage();
    const errors=[];
    const external=[];
    page.on('pageerror',error=>errors.push(`pageerror: ${error.message}`));
    page.on('console',message=>{
      if(message.type()==='error') errors.push(`console: ${message.text()}`);
    });
    page.on('request',request=>{
      const url=request.url();
      if(/^https?:/.test(url) && !url.startsWith(baseUrl)) external.push(url);
    });
    page.on('requestfailed',request=>errors.push(`requestfailed: ${request.url()}`));
    page.on('response',response=>{
      if(response.status()>=400) errors.push(`HTTP ${response.status()}: ${response.url()}`);
    });

    const url=new URL(sample.mini,`${baseUrl}/sample-workbench/mini/`).href;
    let response;
    try{
      response=await page.goto(url,{waitUntil:'networkidle',timeout:15000});
      await page.waitForTimeout(profile.reducedMotion==='reduce'?150:1400);
      if(profile.resizeTo){
        await page.setViewportSize(profile.resizeTo);
        await page.waitForTimeout(180);
      }
    }catch(error){
      errors.push(`navigation: ${error.message}`);
    }
    const geometry=await page.evaluate(()=>{
      const stage=document.querySelector('#stage');
      const rect=stage?.getBoundingClientRect();
      return {
        viewport:[innerWidth,innerHeight],
        document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],
        stage:rect?[Math.round(rect.x),Math.round(rect.y),Math.round(rect.width),Math.round(rect.height)]:null,
        canvases:document.querySelectorAll('canvas').length,
        svgs:document.querySelectorAll('svg').length,
        title:document.title
      };
    }).catch(()=>null);
    if(!response || response.status()!==200) errors.push(`HTTP ${response?.status() ?? 'none'}`);
    const expected=profile.resizeTo || profile.viewport;
    if(geometry?.stage && (
      Math.abs(geometry.stage[0])>1 || Math.abs(geometry.stage[1])>1 ||
      Math.abs(geometry.stage[2]-expected.width)>1 ||
      Math.abs(geometry.stage[3]-expected.height)>1
    )) errors.push(`stage geometry ${geometry.stage.join(',')}`);
    if(geometry && (geometry.document[0]>expected.width+1 || geometry.document[1]>expected.height+1)){
      errors.push(`overflow ${geometry.document.join('x')}`);
    }
    if(external.length) errors.push(`external requests: ${[...new Set(external)].join(', ')}`);

    const shots=path.join(here,sample.key,'shots','smoke');
    fs.mkdirSync(shots,{recursive:true});
    const screenshot=path.join(shots,`${profile.name}.png`);
    if(!errors.some(error=>error.startsWith('navigation'))) await page.screenshot({path:screenshot});
    results.push({sample:sample.key,profile:profile.name,status:errors.length?'fail':'pass',errors,geometry,screenshot});
    await context.close();
  }
}

await browser.close();
const failures=results.filter(result=>result.status==='fail');
for(const result of results){
  console.log(`${result.status.toUpperCase().padEnd(5)} ${result.sample} ${result.profile}`);
  for(const error of result.errors) console.log(`      - ${error}`);
}
console.log(`SUMMARY promoted=${required.length} checks=${results.length} failures=${failures.length}`);
process.exit(failures.length?1:0);
