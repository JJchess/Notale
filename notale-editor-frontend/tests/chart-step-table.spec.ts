import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {newChart} from '@notale/editor/browser';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('chart step table edits and invalid drafts remain separate from base data',async({page})=>{
 const id=randomUUID(),model=newChart('line'),column=model.columns[1].id,original=model.rows[0].values[column];model.states=[{id:'step',name:'步骤一'}];
 expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'步骤表格验证',width:1600,height:900,slides:[{id:'first',name:'第一页',sourcePath:'first.html',html:'<html><body><div data-notale-id="text">Text</div></body></html>'}]}})).ok()).toBe(true);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot()?.document.slides.length===1);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await page.evaluate(model=>(window as any).NotaleWorkbench.commands([{type:'native-chart.create',slideId:'first',target:'chart',model,x:100,y:100,width:900,height:520}]),model);await page.evaluate(()=>(window as any).NotaleWorkbench.select('chart'));
 const panel=page.locator('#echarts-inspector');await panel.getByRole('button',{name:'编辑数据',exact:true}).click();const grid=page.locator('#chart-data-dock revo-grid');
 await panel.getByText('分步讲授',{exact:true}).click();await panel.getByRole('button',{name:'步骤一',exact:true}).click();
 const edit=async(value:string|number)=>grid.evaluate((element,{column,value})=>{const grid=element as any;grid.source=grid.source.map((row:any,index:number)=>index===0?{...row,[column]:value}:row);grid.dispatchEvent(new CustomEvent('afteredit',{bubbles:true,detail:{}}));},{column,value});
 await edit(123);await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());
 const saved=await page.request.get('/api/documents/'+id).then(r=>r.json());const chart=saved.document.slides[0].nativeCharts.chart.authoring;expect(chart.rows[0].values[column]).toBe(original);expect(chart.states[0].rows[0].values[column]).toBe(123);
 await edit('invalid');await expect(page.locator('.chart-data-status')).toContainText('需要数字');
 await panel.getByRole('button',{name:'返回基础图表',exact:true}).click();expect(await grid.evaluate((element,column)=>(element as any).source[0][column],column)).toBe(original);
 await panel.getByText('分步讲授',{exact:true}).click();await panel.getByRole('button',{name:'步骤一',exact:true}).click();expect(await grid.evaluate((element,column)=>(element as any).source[0][column],column)).toBe('invalid');
 await edit(456);await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());await expect(page.locator('.chart-data-status')).toHaveText('');
});
