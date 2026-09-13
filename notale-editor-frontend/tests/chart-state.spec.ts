import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {newChart} from '@notale/editor/browser';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('chart title saves and invalid data survives reopening before correction',async({page})=>{
 const id=randomUUID(),model=newChart('bar'),column=model.columns.find(c=>c.type==='number')!.id;
 expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'图表草稿',width:1600,height:900,slides:[{id:'first',name:'图表',sourcePath:'first.html',nativeCharts:{chart:{adapter:'echarts',option:{},authoring:model}},html:'<html><body><main data-notale-id="stage" style="width:1600px;height:900px"><div data-notale-id="chart" style="width:900px;height:500px"></div></main></body></html>'}]}})).ok()).toBe(true);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot()?.document.slides.length===1);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());await page.evaluate(()=>(window as any).NotaleWorkbench.select('chart'));
 const panel=page.locator('#echarts-inspector');await expect(panel).toBeVisible();await panel.getByLabel('标题',{exact:true}).fill('已保存图表');await panel.getByLabel('标题',{exact:true}).blur();
 await expect.poll(()=>page.evaluate(()=>(window as any).NotaleWorkbench.getSnapshot().document.slides[0].nativeCharts.chart.authoring.appearance.title)).toBe('已保存图表');
 await panel.getByRole('button',{name:'编辑数据',exact:true}).click();const grid=page.locator('revo-grid');await expect(grid).toBeVisible();
 const edit=async(value:string|number)=>grid.evaluate((element,{column,value})=>{const grid=element as any;grid.source=grid.source.map((row:any,index:number)=>index?row:{...row,[column]:value});grid.dispatchEvent(new CustomEvent('afteredit'));},{column,value});
 await edit('非法数字');await expect(page.locator('.chart-data-status')).toContainText('需要数字');await page.locator('.chart-data-close').click();await panel.getByRole('button',{name:'编辑数据',exact:true}).click();expect(await grid.evaluate((element,column)=>(element as any).source[0][column],column)).toBe('非法数字');
 await edit(122);await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());
 await page.evaluate(()=>(window as any).NotaleWorkbench.commands([{type:'element.lock',slideId:'first',target:'chart',locked:true}]));
 // A grid editor can finish after the object becomes locked; emulate its late event.
 await edit(777);await expect(page.locator('.chart-data-status')).toContainText('草稿已保留');
 await page.evaluate(()=>(window as any).NotaleWorkbench.commands([{type:'element.lock',slideId:'first',target:'chart',locked:false}]));
 await page.locator('.chart-data-close').click();await panel.getByRole('button',{name:'编辑数据',exact:true}).click();
 expect(await grid.evaluate((element,column)=>(element as any).source[0][column],column)).toBe(777);
 await edit(123);await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());await expect.poll(async()=>{const head=await page.request.get('/api/documents/'+id).then(r=>r.json());return head.document.slides[0].nativeCharts.chart.authoring.rows[0].values[column];}).toBe(123);
 const beforePaste=await page.request.get('/api/documents/'+id).then(r=>r.json());
 const authoring=beforePaste.document.slides[0].nativeCharts.chart.authoring;
 const values=authoring.columns.map((column:any)=>column.type==='number'?'10':'Pasted category');values.push('invalid');
 const paste=(parsed:string[][])=>grid.evaluate((element,parsed)=>{
   element.dispatchEvent(new CustomEvent('beforecellfocusinit',{detail:{rowIndex:0,colIndex:0}}));
   element.dispatchEvent(new CustomEvent('beforepasteapply',{cancelable:true,detail:{parsed}}));
 },parsed);
 await paste([values]);await expect(page.locator('.chart-data-status')).toContainText('需要数字');
 await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());
 const rejected=await page.request.get('/api/documents/'+id).then(r=>r.json());
 expect(typeof rejected.version).toBe('number');expect(rejected.version).toBe(beforePaste.version);
 expect(rejected.document.slides[0].nativeCharts.chart.authoring).toEqual(authoring);
 values[values.length-1]='456';await paste([values]);await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());
 const accepted=await page.request.get('/api/documents/'+id).then(r=>r.json());
 expect(accepted.version).toBe(beforePaste.version+1);
 const next=accepted.document.slides[0].nativeCharts.chart.authoring;
 expect(next.columns.length).toBe(authoring.columns.length+1);expect(next.rows[0].values[next.columns.at(-1).id]).toBe(456);

});
