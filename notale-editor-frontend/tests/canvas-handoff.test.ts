import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium, expect, type Browser, type Page } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const requireHere = createRequire(path.join(root, 'package.json'));
const esbuild = requireHere('esbuild');
let browser: Browser;
let script: string;

before(async () => {
  const result = await esbuild.build({
    stdin: { resolveDir: root, loader: 'js', contents: `
      import {CanvasController} from './src/canvas/controller';
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {createCanvasLoading} from './src/canvas/loading-controller';
      import {canvasLoadingState} from './src/state/canvas-loading';
      import {CanvasLoading} from './src/components/canvas-loading';
      const host=document.getElementById('canvas-host'), controller=new CanvasController(host,8);
      const h=window.harness={controller,frames:[],released:[],received:[]};
      controller.onRelease(frame=>h.released.push(h.frames.indexOf(frame)));
      controller.subscribe(event=>h.received.push(event.data.type));
      h.page=(id='a',version=1,documentId='doc')=>({documentId,version,pageId:id,url:'https://canvas.test/'+documentId+'/'+id+'?v='+version,channel:'secret',runtimeKey:id+':'+version});
      h.activate=(page=h.page(),force=false)=>{const result=controller.activate(page,force);let index=h.frames.indexOf(result.frame);if(index<0){index=h.frames.push(result.frame)-1;result.frame.dataset.testFrame=String(index);}return index;};
      h.preload=page=>{const frame=controller.preload(page);if(frame){const index=h.frames.push(frame)-1;frame.dataset.testFrame=String(index);}return h.frames.indexOf(frame);};
      h.commit=index=>controller.commitDisplay(h.frames[index]);
      h.emit=(index,type,data={})=>window.dispatchEvent(new MessageEvent('message',{source:h.frames[index].contentWindow,origin:'https://canvas.test',data:{source:'notale-slide',channel:'secret',type,data}}));
      h.retryCount=0;h.loadingState=canvasLoadingState;h.loading=createCanvasLoading(async()=>{h.retryCount++;},error=>{throw error;});
      createRoot(document.getElementById('loading-ui')).render(React.createElement(CanvasLoading));
    ` },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    logLevel: 'silent',
  });
  script = result.outputFiles[0].text;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
});
after(async () => { await browser?.close(); });

async function fixture() {
  const page = await browser.newPage();
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: route.request().url().startsWith('https://host.test/')
    ? '<style>.canvas-wrap{position:relative;width:640px;height:360px}#canvas-host{width:100%;height:100%}.canvas-wrap iframe{width:100%;height:100%;border:0;display:block}</style><input id="outside"/><div class="canvas-wrap"><div id="canvas-host"></div></div><div id="loading-ui"></div>'
    : '<html><body style="background:#b9dce8"><button>Canvas</button></body></html>' }));
  await page.goto('https://host.test/handoff');
  await page.addScriptTag({ content: script });
  return page;
}
const evaluate = <T>(page: Page, expression: string): Promise<T> => page.evaluate(expression);

test('a fully committed same-page canvas remains painted until the replacement commits, without admitting old messages', async () => {
  const page = await fixture();
  try {
    assert.equal(await evaluate(page, 'harness.activate()'), 0);
    await evaluate(page, 'harness.commit(0)');
    const old = page.locator('[data-test-frame="0"]');
    const before = await old.boundingBox();
    await old.focus();
    await evaluate(page, 'harness.controller.suspend();harness.activate(harness.page("a",2),true)');
    await expect(old).toHaveAttribute('data-notale-retiring', 'true');
    await expect(old).not.toHaveAttribute('id', 'canvas');
    await expect(old).toHaveJSProperty('inert', true);
    await expect(old).toBeVisible();
    assert.deepEqual(await old.boundingBox(), before);
    await expect(page.locator('#canvas')).toHaveCSS('visibility', 'hidden');
    await expect(page.locator('#canvas')).toHaveCSS('display', 'block');
    assert.ok((await page.locator('#canvas').boundingBox())!.width > 0);
    assert.deepEqual(await evaluate(page, 'harness.released'), []);
    await evaluate(page, 'harness.emit(0,"edit-action",{action:{type:"delete"}});harness.emit(0,"ready",{slideId:"a"})');
    assert.deepEqual(await evaluate(page, 'harness.received'), []);
    assert.equal(await evaluate(page, 'harness.commit(0)'), false);
    assert.equal(await evaluate(page, 'harness.commit(1)'), true);
    await expect(old).toHaveCount(0);
    await expect(page.locator('#canvas')).toBeVisible();
    await expect(page.locator('#canvas')).toHaveJSProperty('inert', false);
    await expect(page.locator('#canvas')).toBeFocused();
    assert.deepEqual(await evaluate(page, 'harness.released'), [0]);
  } finally { await page.close(); }
});

test('replacement loading keeps the existing delay and timeout while initial loading retains its original message', async () => {
  const page = await fixture();
  try {
    const loading=page.locator('#canvas-loading');
    await loading.waitFor({state:'attached'});
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await evaluate(page, 'harness.loading.start("replacement")');
    await expect(loading).toHaveAttribute('data-mode','replacement');
    await page.clock.runFor(399);
    await expect(loading).toBeHidden();
    await page.clock.runFor(1);
    await expect(loading).toBeVisible();
    await expect(page.locator('#canvas-loading-status')).toHaveText('正在更新画布…');
    await expect(page.locator('#retry-canvas')).toBeHidden();
    await page.clock.runFor(7599);
    await expect(page.locator('#retry-canvas')).toBeHidden();
    await page.clock.runFor(1);
    await expect(page.locator('#canvas-loading-status')).toHaveText('画布更新尚未完成，可继续等待或重试。');
    await page.locator('#retry-canvas').click();
    assert.equal(await evaluate(page,'harness.retryCount'),1);
    await evaluate(page,'harness.loading.ready();harness.loading.start()');
    await expect(loading).toBeHidden();
    await page.clock.runFor(400);
    await expect(page.locator('#canvas-loading-status')).toHaveText('正在加载讲义…');
    await evaluate(page,'harness.loading.dispose()');
    await page.clock.runFor(8000);
    await expect(loading).toBeHidden();
    assert.equal(await evaluate(page,'harness.loadingState.getSnapshot().mode'),'initial');
  } finally { await page.close(); }
});

test('multiple forced retries retain one committed frame and release only the discarded attempts', async () => {
  const page = await fixture();
  try {
    await evaluate(page, 'harness.activate();harness.commit(0);harness.activate(harness.page("a",2),true)');
    await evaluate(page, 'harness.activate(harness.page("a",3),true);harness.activate(harness.page("a",4),true)');
    await expect(page.locator('iframe[data-notale-retiring="true"]')).toHaveCount(1);
    await expect(page.locator('#canvas-host iframe')).toHaveCount(2);
    await expect(page.locator('[data-test-frame="0"]')).toBeVisible();
    assert.deepEqual(await evaluate(page, 'harness.released'), [1, 2]);
    assert.equal(await evaluate(page, 'harness.commit(1)||harness.commit(2)'), false);
    await expect(page.locator('[data-test-frame="0"]')).toBeVisible();
    await evaluate(page, 'harness.commit(3)');
    assert.deepEqual(await evaluate(page, 'harness.released'), [1, 2, 0]);
    await evaluate(page, 'harness.controller.dispose();harness.controller.dispose()');
    assert.deepEqual(await evaluate(page, 'harness.released'), [1, 2, 0, 3]);
    await expect(page.locator('#canvas-host iframe')).toHaveCount(0);
  } finally { await page.close(); }
});

test('handshake-only frames are not retained and switching page or document clears a handoff', async () => {
  const page = await fixture();
  try {
    await evaluate(page, 'harness.activate();harness.emit(0,"ready",{slideId:"a"});harness.activate(harness.page("a",2),true)');
    assert.equal(await evaluate(page, 'harness.controller.hasRetainedFrame'), false);
    assert.deepEqual(await evaluate(page, 'harness.released'), [0]);
    await evaluate(page, 'harness.commit(1);harness.activate(harness.page("a",3),true)');
    assert.equal(await evaluate(page, 'harness.controller.hasRetainedFrame'), true);
    await evaluate(page, 'harness.activate(harness.page("b",3))');
    await expect(page.locator('[data-notale-retiring]')).toHaveCount(0);
    assert.equal(await evaluate(page, 'harness.commit(2)'), false);
    assert.deepEqual(await evaluate(page, 'harness.released'), [0, 1]);
    await evaluate(page, 'harness.commit(3);harness.activate(harness.page("b",4),true);harness.activate(harness.page("b",1,"other"),true)');
    assert.equal(await evaluate(page, 'harness.controller.hasRetainedFrame'), false);
    await expect(page.locator('#canvas-host iframe')).toHaveCount(1);
    assert.deepEqual(await evaluate<number[]>(page, 'harness.released').then(values => values.sort()), [0, 1, 2, 3, 4]);
  } finally { await page.close(); }
});

test('the normal eight-frame cache permits just one extra retained display and does not steal input focus', async () => {
  const page = await fixture();
  try {
    await evaluate(page, 'harness.activate();harness.commit(0);for(let index=1;index<8;index++)harness.preload(harness.page("page"+index));harness.activate(harness.page("a",2),true)');
    await expect(page.locator('#canvas-host iframe')).toHaveCount(9);
    await expect(page.locator('[data-notale-retiring]')).toHaveCount(1);
    await page.locator('#outside').focus();
    await evaluate(page, 'harness.commit(8)');
    await expect(page.locator('#outside')).toBeFocused();
    await expect(page.locator('#canvas-host iframe')).toHaveCount(8);
    await page.locator('#canvas').focus();
    await evaluate(page, 'harness.controller.suspend();harness.activate(harness.page("a",3),true)');
    await page.locator('#outside').focus();
    await evaluate(page, 'harness.commit(9)');
    await expect(page.locator('#outside')).toBeFocused();
    assert.deepEqual(await evaluate(page, 'harness.released'), [0, 8]);
  } finally { await page.close(); }
});
