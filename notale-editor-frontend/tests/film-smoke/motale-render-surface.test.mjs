import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from '../../../notale-editor-frontend/node_modules/typescript/lib/typescript.js';
import {chromium} from '@playwright/test';

test('Motale surfaces swap complete canvases, keep clips isolated and discard cancelled or failed frames',async()=>{
  const source=await readFile(new URL('../../../notale-editor-frontend/src/film/motale-render-surface.ts',import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  const browser=await chromium.launch({executablePath:process.env.MOTALE_CHROMIUM??chromium.executablePath(),headless:true,args:['--no-sandbox']});
  try{
    const page=await browser.newPage();
    await page.setContent('<div id="a" style="position:relative;width:320px;height:240px"><iframe></iframe></div><div id="b" style="position:relative;width:320px;height:180px"><iframe></iframe></div>');
    await page.addScriptTag({type:'module',content:code+'\nwindow.MotaleRenderSurface=MotaleRenderSurface;'});
    const actual=await page.evaluate(async()=>{
      const requests=[],errors=[],drain=()=>new Promise(resolve=>setTimeout(resolve,0));
      const bridge={author:{get:()=>({schema:'motale-author/0',film:'fixed',acts:{a:{revision:'r1',objects:{title:{x:10}}}}})},state:()=>({authorRevision:1}),
        renderAct:(act,time,options)=>new Promise((resolve,reject)=>requests.push({act,time,options,resolve,reject}))};
      const context=time=>({bridge,instance:bridge,hello:{film:'fixed'},act:{id:'a',revision:'r1',state:'ok',renderAct:true},time});
      const make=id=>{const parent=document.getElementById(id);return new window.MotaleRenderSurface(parent,parent.querySelector('iframe'),error=>errors.push(error));};
      const a=make('a'),b=make('b'),viewport={width:320,height:240};
      const finish=(index,color,caption='')=>{const request=requests[index],canvas=document.createElement('canvas');canvas.width=32;canvas.height=18;const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,32,18);request.resolve({canvas,actId:request.act,t:request.time,width:32,height:18,caption,authorRevision:1});};
      const pixel=id=>{const canvas=document.querySelector(`#${id} .film-motale-frame:not([hidden])`);return [...canvas.getContext('2d').getImageData(0,0,1,1).data];};
      const initial=a.prepare(context(0),32,viewport);a.prepare(context(1),32,viewport);
      const aborted=requests[0].options.signal.aborted;
      finish(1,'#00ff00','<b>caption & text</b>');await drain();
      const ready=a.ready,green=pixel('a'),caption=document.querySelector('#a .film-motale-caption').textContent;
      const literal=!document.querySelector('#a .film-motale-caption b');
      finish(0,'#ff0000','late');await drain();const late=pixel('a');
      b.prepare({...context(1),instance:{}},32,{width:320,height:180});finish(2,'#ff0000');await drain();
      const isolated=[pixel('a'),pixel('b')];
      a.prepare(context(2),32,viewport);requests[3].reject(Error('E_RENDER: intentional draw failure'));await drain();
      const failed=!a.ready&&a.error==='E_RENDER: intentional draw failure';
      a.prepare(context(3),32,viewport);finish(4,'#0000ff');await drain();const recovered=a.ready&&a.error===undefined,blue=pixel('a');
      a.prepare(context(4),32,viewport);a.deactivate();finish(5,'#ff0000');await drain();
      const disposed=!document.querySelector('#a .film-motale-render')&&!a.ready&&document.querySelector('#a iframe').style.visibility==='';
      const requestOptions=requests.every(({options})=>options.parameters==='film'&&options.playback==='playing'&&options.author.acts.a.objects.title.x===10&&!options.canvas);
      b.dispose();a.dispose();
      return{initial,aborted,ready,green,caption,literal,late,isolated,failed,recovered,blue,disposed,requestOptions,errors};
    });
    assert.equal(actual.initial,false);assert.equal(actual.aborted,true);assert.equal(actual.ready,true);
    assert.deepEqual(actual.green,[0,255,0,255]);assert.deepEqual(actual.late,actual.green);
    assert.equal(actual.caption,'<b>caption & text</b>');assert.equal(actual.literal,true);
    assert.deepEqual(actual.isolated,[[0,255,0,255],[255,0,0,255]]);
    assert.equal(actual.failed,true);assert.equal(actual.recovered,true);assert.deepEqual(actual.blue,[0,0,255,255]);
    assert.equal(actual.disposed,true);assert.equal(actual.requestOptions,true);
    assert.deepEqual(actual.errors,['E_RENDER: intentional draw failure']);
  }finally{await browser.close();}
});
