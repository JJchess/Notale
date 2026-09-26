import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('React project import/export and PDF preparation use the saved document',async({page,context})=>{
 const id=randomUUID();expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'Transfer sample',width:1600,height:900,slides:[{id:'first',name:'Sample',sourcePath:'first.html',html:'<html><body><p data-notale-id="text">Original</p><button data-notale-id="counter" onclick="this.textContent=Number(this.textContent)+1">0</button></body></html>'}]}})).ok()).toBe(true);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot());await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());await page.evaluate(async()=>{await(window as any).NotaleWorkbench.commands([{type:'element.patch',slideId:'first',target:'text',patch:{text:'Saved for export'}}]);});
 await page.locator('#toggle-notes').click();await page.locator('#notes').fill('Unsaved notes included in export');
 await page.locator('[data-header-menu="export"] > summary').click();const downloading=page.waitForEvent('download');await page.locator('#export').click();const download=await downloading,bytes=await readFile((await download.path())!);
 const files=unzipSync(bytes),html=strFromU8(files['first.html']);expect(html).toContain('data-notale-runtime');expect(html).not.toMatch(/<script[^>]*src=[^>]*__notale_runtime__/);
 const offline=await page.context().browser()!.newContext();
 try{await offline.route('**/*',route=>{const file=files[decodeURIComponent(new URL(route.request().url()).pathname.slice(1))];return file?route.fulfill({status:200,contentType:'text/html',body:Buffer.from(file)}):route.abort();});const standalone=await offline.newPage();await standalone.goto('http://export.test/index.html');const counter=standalone.frameLocator('iframe').locator('[data-notale-id="counter"]');await counter.click();await expect(counter).toHaveText('1');await expect(standalone.frameLocator('iframe').locator('[data-notale-id="text"]')).toHaveText('Saved for export');}finally{await offline.close();}

 await page.locator('#import').setInputFiles({name:'sample.zip',mimeType:'application/zip',buffer:bytes});await expect.poll(()=>page.evaluate(()=>(window as any).NotaleWorkbench.getSnapshot().document.id)).not.toBe(id);await expect(page.locator('#import')).toBeEnabled();await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());await expect(page.frameLocator('#canvas').locator('[data-notale-id="text"]')).toHaveText('Saved for export');expect(await page.evaluate(()=>(window as any).NotaleWorkbench.getSnapshot().document.slides[0].notes)).toBe('Unsaved notes included in export');
 await context.addInitScript(()=>{window.print=()=>{(window as any).__printed=true;};});await page.locator('[data-header-menu="export"] > summary').click();const popupEvent=page.waitForEvent('popup');await page.locator('#export-pdf').click();const popup=await popupEvent;await expect(popup.frameLocator('iframe').locator('[data-notale-id="text"]')).toHaveText('Saved for export');await popup.waitForFunction(()=>(window as any).__printed===true);await popup.close();
});

test('React PPTX input imports text and media through the transfer service',async({page})=>{
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR42mNk+M+AFzCOKhhVMPwUAADAcwGm4G3CQgAAAABJRU5ErkJggg==', 'base64');
  const { zipSync, strToU8 } = await import('fflate');
  const slide = `<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>
   <p:sp><p:nvSpPr><p:cNvPr id="2" name="标题"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="952500" y="476250"/><a:ext cx="7620000" cy="1143000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="zh-CN" sz="4400" b="1"/><a:t>导入的标题</a:t></a:r></a:p><a:p><a:r><a:rPr lang="zh-CN" sz="2000"/><a:t>第二行</a:t></a:r></a:p></p:txBody></p:sp>
   <p:pic><p:nvPicPr><p:cNvPr id="3" name="图片"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId1"/></p:blipFill><p:spPr><a:xfrm><a:off x="1905000" y="2857500"/><a:ext cx="2857500" cy="1905000"/></a:xfrm></p:spPr></p:pic>
  </p:spTree></p:cSld></p:sld>`;
  const zip = zipSync({
    'ppt/presentation.xml': strToU8('<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldSz cx="9144000" cy="6858000"/></p:presentation>'),
    'ppt/slides/slide1.xml': strToU8(slide),
    'ppt/slides/_rels/slide1.xml.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>'),
    'ppt/media/image1.png': new Uint8Array(png),
  });

 const id=randomUUID();expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'PPTX origin',width:1600,height:900,slides:[{id:'first',name:'Sample',sourcePath:'first.html',html:'<html><body><p data-notale-id="text">Original</p></body></html>'}]}})).ok()).toBe(true);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot());await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await page.locator('#import-pptx').setInputFiles({name:'sample.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer:Buffer.from(zip)});await expect.poll(()=>page.evaluate(()=>(window as any).NotaleWorkbench.getSnapshot().document.id)).not.toBe(id);await expect(page.locator('#import-pptx')).toBeEnabled();await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());await expect(page.frameLocator('#canvas').getByText('导入的标题',{exact:true})).toBeVisible();const doc=await page.evaluate(()=>(window as any).NotaleWorkbench.getSnapshot().document);expect(Object.keys(doc.assets)).toEqual(['media/pptx/image1.png']);expect(doc.width).toBe(960);
});
