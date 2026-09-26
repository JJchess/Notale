import {test,expect,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {createServer,type Server,type ServerResponse} from 'node:http';
/** The AI panel end to end against a scripted model, the way Codex's app-server tests run against a
 * mock Responses server. This file starts a fake Gemini streaming endpoint on AI_MOCK_PORT (4499);
 * the backend behind the tested frontend must be started with
 * `EDITOR_AI_BASE_URL=http://127.0.0.1:4499/v1beta GEMINI_API_KEY=test` (and its own
 * EDITOR_AI_SESSION_DIR). The fake reads each request the way the model would: the instruction and
 * the page html from the opening <context>, and how many model turns already followed it.
 *   标题变红 / 标题变蓝 / fine: edit the title colour, then say so.
 *   慢: edit the font size, then never answer (until the connection goes). */
test.use({baseURL:process.env.INTERACTIVE_TEST_URL??'http://127.0.0.1:4312'});
test.describe.configure({mode:'serial'});
const mockPort=Number(process.env.AI_MOCK_PORT??4499);
let mock:Server;const hanging:ServerResponse[]=[];let calls=0;const sawImage:boolean[]=[];
type Part={text?:string;functionCall?:unknown;functionResponse?:unknown;inlineData?:unknown};
function answer(res:ServerResponse,parts:unknown[]){
 res.writeHead(200,{'content-type':'text/event-stream'});
 res.end('data: '+JSON.stringify({candidates:[{content:{role:'model',parts},finishReason:'STOP'}],usageMetadata:{promptTokenCount:1000,candidatesTokenCount:10,totalTokenCount:1010}})+'\n\n');
}
test.beforeAll(async()=>{
 mock=createServer((req,res)=>{
  // The picker asks which models the key can use.
  if(req.method==='GET'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({models:[{name:'models/gemini-3.8-flash',displayName:'Gemini 3.8 Flash',inputTokenLimit:1048576,supportedGenerationMethods:['generateContent']}]}));return;}
  let body='';req.on('data',chunk=>body+=chunk);
  req.on('end',()=>{
   calls++;
   const contents:{role:string;parts:Part[]}[]=JSON.parse(body).contents;
   const opening=contents.map((c,i)=>[c,i] as const).filter(([c])=>c.role==='user'&&c.parts.some(p=>p.text?.includes('<context>'))).at(-1)!;
   const text=opening[0].parts.map(p=>p.text??'').join('');
   const instruction=text.slice(text.lastIndexOf('</context>')+10).trim();
   const path=/文件 (\S+)。/.exec(text)![1]!;
   const step=contents.slice(opening[1]+1).filter(c=>c.role==='model').length;
   const page=/```html\n([\s\S]*?)\n```/.exec(text)![1]!;
   sawImage.push(opening[0].parts.some(p=>p.inlineData));
   // A reply in two pieces, a beat apart, so the panel can be seen streaming it.
   if(instruction==='讲讲'){res.writeHead(200,{'content-type':'text/event-stream'});
    const chunk=(words:string,done:boolean)=>'data: '+JSON.stringify({candidates:[{content:{role:'model',parts:[{text:words}]},...(done?{finishReason:'STOP'}:{})}]})+'\n\n';
    res.write(chunk('这一页讲的是',false));setTimeout(()=>res.end(chunk('集成学习。',true)),700);return;}
   if(step>0){if(instruction==='慢'){hanging.push(res);return;}answer(res,[{text:instruction==='fine'?'Done.':'改好了。'}]);return;}
   const [oldText,newText]=instruction==='慢'?[/font-size:\s*44px/.exec(page)![0],'font-size:60px']
    :[/color:\s*#[0-9a-f]{6}/i.exec(page)![0],instruction==='标题变蓝'?'color:#264685':'color:#c0392b'];
   answer(res,[{functionCall:{name:'edit',args:{path,edits:[{oldText,newText}]}}}]);
  });
 });
 await new Promise<void>(done=>mock.listen(mockPort,'127.0.0.1',done));
});
test.afterAll(async()=>{for(const res of hanging)res.destroy();await new Promise(done=>mock.close(done));});

const html='<html><body style="margin:0"><main id="stage" data-notale-id="stage" style="position:absolute;width:1600px;height:900px">'
 +'<h1 data-notale-id="title" style="position:absolute;left:120px;top:90px;width:700px;margin:0;font-size:44px;color:#111111">标题文字</h1>'
 +'</main></body></html>';
async function open(page:Page){
 const id=randomUUID();
 expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'AI 互动',width:1600,height:900,slides:[{id:'first',name:'首页',sourcePath:'first.html',html}]}})).ok()).toBe(true);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot()?.document.slides.length===1);
 await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await page.locator('[data-tool="interactive"]').click();
 return id;
}
const version=async(page:Page,id:string)=>(await (await page.request.get('/api/documents/'+id)).json()).version as number;
async function send(page:Page,words:string){
 await page.locator('#ai-instruction').fill(words);
 await page.locator('#ai-submit').click();
}
const title=(page:Page)=>page.frameLocator('#canvas').locator('[data-notale-id="title"]');

test('a turn is written into the deck and reviewed against the baseline: accept moves it, discard returns to it',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const id=await open(page);
 await send(page,'标题变红');
 await expect(page.locator('#ai-candidate')).toBeVisible();
 await expect(page.locator('#ai-candidate .ai-change')).toHaveCount(1);
 await expect(page.locator('#ai-candidate .ai-change-label')).toHaveText('标题文字');
 await expect(title(page)).toHaveCSS('color','rgb(192, 57, 43)');
 await expect(page.locator('.ai-turn-outcome').last()).toContainText('已写进讲义');
 await page.locator('#ai-apply').click();
 await expect(page.locator('#ai-candidate')).toBeHidden();
 const accepted=await version(page,id);
 await send(page,'标题变蓝');
 await expect(page.locator('#ai-candidate')).toBeVisible();
 await expect(title(page)).toHaveCSS('color','rgb(38, 70, 133)');
 await page.locator('#ai-discard').click();
 await expect(page.locator('#ai-candidate')).toBeHidden();
 await expect(title(page)).toHaveCSS('color','rgb(192, 57, 43)');
 expect(await version(page,id)).toBe(accepted+2);
 expect(errors).toEqual([]);
});

test('stop is its own request: what was written stays, lands in the deck and in the review',async({page})=>{
 const id=await open(page);
 const before=await version(page,id),seen=calls;
 await send(page,'慢');
 await expect.poll(()=>calls-seen).toBe(2); // the edit went through; the model is now "thinking"
 await page.locator('#ai-stop').click();
 await expect(page.locator('#ai-submit')).toBeVisible();
 await expect(page.locator('.ai-turn-outcome').last()).toContainText('已停止');
 await expect(page.locator('#ai-instruction')).toHaveValue('慢');
 await expect(page.locator('#ai-candidate .ai-change')).toHaveCount(1);
 await expect(title(page)).toHaveCSS('font-size','60px');
 expect(await version(page,id)).toBe(before+1);
});

test.describe('in English',()=>{
 test.use({locale:'en-US'});
 test('the panel\'s own words are English; only the author\'s and the model\'s text is left as written',async({page})=>{
  await page.addInitScript(()=>{try{localStorage.setItem('notale-locale','en-US');}catch{}});
  await open(page);
  await send(page,'fine');
  await expect(page.locator('#ai-candidate')).toBeVisible();
  const leftover=await page.evaluate(()=>{
   const panel=document.querySelector('.interactive-panel')!.cloneNode(true) as HTMLElement;
   // Authored or model text, and the object's own name, are not the UI's to translate.
   panel.querySelectorAll('.ai-bubble-copy,.ai-reply-text,.ai-change-label,.ai-turn-target,.ai-reference,textarea').forEach(node=>node.remove());
   return (panel.textContent??'').match(/[一-鿿][^a-zA-Z]*/g)??[];
  });
  expect(leftover).toEqual([]);
 });
});

test('the reply streams in piece by piece, then the turn offers copy and retry',async({page})=>{
 await open(page);
 await send(page,'讲讲');
 await expect(page.locator('.ai-reply-text.is-streaming')).toContainText('这一页讲的是');
 await expect(page.locator('.ai-caret')).toBeVisible();
 await expect(page.locator('.ai-turn .ai-reply-text').last()).toHaveText('这一页讲的是集成学习。');
 await expect(page.locator('.ai-caret')).toHaveCount(0);
 await expect(page.locator('.ai-turn-actions').last().locator('button')).toHaveCount(2);
});
test('the picker groups models by service; one without a key is greyed out and cannot be picked',async({page})=>{
 await open(page);
 await expect(page.locator('#ai-model .ai-model-name')).toHaveText('Gemini 3.8 Flash');
 await page.locator('#ai-model').click();
 await expect(page.locator('#ai-model-menu .ai-picker-group').first()).toContainText('Google');
 await expect(page.locator('#ai-model-menu .ai-picker-group.is-off').first()).toContainText('未配置密钥');
 await expect(page.locator('#ai-model-menu .ai-picker-group.is-off .ai-picker-row')).toHaveCount(0);
 await page.keyboard.press('Escape');
 await expect(page.locator('#ai-model-menu')).toHaveCount(0);
});
test('an attached picture reaches the model; @ inserts a page by its file',async({page})=>{
 await open(page);
 await page.locator('.ai-composer input[type=file]').setInputFiles({name:'ref.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4a50000000049454e44ae426082','hex')});
 await expect(page.locator('.ai-attachment')).toHaveCount(1);
 await page.locator('#ai-instruction').fill('');
 await page.locator('#ai-instruction').pressSequentially('照图改 @');
 await expect(page.locator('#ai-mention-menu')).toBeVisible();
 await page.keyboard.press('Enter');
 await expect(page.locator('#ai-instruction')).toHaveValue('照图改 @first.html ');
 const seen=sawImage.length;
 await page.keyboard.press('Enter');
 await expect.poll(()=>sawImage.length).toBeGreaterThan(seen);
 expect(sawImage[seen]).toBe(true);
 await expect(page.locator('.ai-attachment')).toHaveCount(0);
});
