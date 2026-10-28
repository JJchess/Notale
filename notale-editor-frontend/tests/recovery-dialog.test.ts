import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium, expect, type Browser, type Page } from '@playwright/test';
import type { KeyboardRecovery } from '../src/state/keyboard-queue';
import type { RecoveryRow } from '../src/state/recovery';

const root = path.resolve(import.meta.dirname, '..');
const requireHere = createRequire(path.join(root, 'package.json'));
const esbuild = requireHere('esbuild');
let browser: Browser;
let script: string;
let styles: string;

const record = (id: string, phase: KeyboardRecovery['phase'] = 'queued'): KeyboardRecovery => ({
  id, createdAt: 1, phase, ...(phase === 'executing' ? { error: 'HTTP_502' } : {}),
  intent: { action: { type: 'undo' }, documentId: `document-${id}`, slideId: 'page', ids: ['object'], focusCanvas: false },
});
const ordinary: RecoveryRow = { id: 'saved:one', label: '已保留草稿 · HTTP_502', action: '打开恢复副本', download: '导出完整草稿' };
interface Fixture {
  records?: KeyboardRecovery[];
  legacy?: RecoveryRow[];
  holdRefresh?: boolean;
  holdReads?: boolean;
  holdMarks?: boolean;
  holdOrdinary?: boolean;
  holdInspect?: boolean;
  legacyError?: string;
  english?: boolean;
}

// Bundle the production component in memory. Only the locale and backend-facing
// adapters are controlled; React, dialog behavior, stores, and CSS stay real.
before(async () => {
  const result = await esbuild.build({
    stdin: { resolveDir: root, loader: 'tsx', contents: `
      import React,{useSyncExternalStore} from 'react';
      import {createRoot} from 'react-dom/client';
      import {RecoveryDialog} from './src/components/recovery-dialog';
      import {editorSession,editorActions} from './src/state/editor-session';
      import {recoveryState,recoveryActions} from './src/state/recovery';
      const config=window.fixture, h=window.harness={...config, records:config.records??[], legacy:config.legacy??[], reads:[], marks:[], actions:[], downloads:[], readCount:0};
      h.open=()=>editorSession.update({documentDialog:'recovery'});
      h.publish=()=>recoveryState.publish([...h.legacy],h.legacyError??'');
      h.resolveRead=(index,rows)=>h.reads[index].resolve(rows);
      h.rejectRead=(index,error)=>h.reads[index].reject(Error(error));
      h.resolveMark=()=>h.marks.shift()();
      h.importRecord=row=>{h.records.push(row);h.publish();};
      recoveryActions.refresh=async()=>{if(h.holdRefresh)await new Promise(resolve=>h.resolveRefresh=resolve);h.publish();};
      editorActions.keyboardRecoveries=async()=>{h.readCount++;if(h.holdReads)return new Promise((resolve,reject)=>h.reads.push({resolve,reject}));return structuredClone(h.records);};
      editorActions.dismissKeyboardRecovery=async id=>{h.actions.push('mark:'+id);if(h.holdMarks)await new Promise(resolve=>h.marks.push(resolve));h.records=h.records.filter(row=>row.id!==id);};
      editorActions.inspectKeyboardRecovery=async row=>{h.actions.push('inspect:'+row.id);if(h.holdInspect)await new Promise(()=>{});else editorSession.update({documentDialog:undefined});};
      recoveryActions.run=async id=>{h.actions.push('recover:'+id);if(h.holdOrdinary)await new Promise(resolve=>h.resolveOrdinary=resolve);};
      recoveryActions.download=id=>{h.actions.push('export:'+id);return JSON.stringify({id});};
      const blobs=new Map();let blobId=0;
      URL.createObjectURL=blob=>{const url='blob:https://test.invalid/'+(++blobId);blobs.set(url,blob);return url;};
      URL.revokeObjectURL=url=>blobs.delete(url);
      HTMLAnchorElement.prototype.click=function(){const name=this.download;void blobs.get(this.href).text().then(raw=>h.downloads.push({name,raw}));};
      function App(){const state=useSyncExternalStore(editorSession.subscribe,editorSession.getSnapshot);return <div className="notale-editor-root" style={{position:'fixed',inset:0}}><button id="outside" onClick={h.open}>Open</button>{state.documentDialog==='recovery'&&<RecoveryDialog/>}</div>;}
      createRoot(document.getElementById('root')).render(<App/>);
      h.open();
    ` },
    bundle: true, write: false, outdir: '/tmp/notale-recovery-memory-only', format: 'iife', platform: 'browser', jsx: 'automatic',
    plugins: [{ name: 'locale', setup(build: { onResolve: (options: object, handler: () => object) => void; onLoad: (options: object, handler: () => object) => void }) {
      build.onResolve({ filter: /i18n\/react$/ }, () => ({ path: 'locale', namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'import {translator} from "./src/i18n/store";const locale=()=>window.fixture.english?"en-US":"zh-CN";export const useI18n=()=>translator(locale());export const useLocale=locale;', loader: 'js', resolveDir: root }));
    } }],
    logLevel: 'silent',
  });
  script = result.outputFiles.find((file: { path: string }) => file.path.endsWith('.js')).text;
  // A CSS reset clears native dialog centering; the dialog's own styles must restore it.
  styles = '*,::before,::after{box-sizing:border-box;margin:0;padding:0}\n' + await readFile(path.join(root, 'src/editor.css'), 'utf8') + '\n' + result.outputFiles.find((file: { path: string }) => file.path.endsWith('.css')).text;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
});
after(async () => { await browser?.close(); });

async function fixture(options: Fixture = {}, viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport });
  await page.route('**/*', route => route.abort());
  await page.setContent('<div id="root"></div>');
  await page.addStyleTag({ content: styles });
  await page.evaluate(value => { (window as unknown as { fixture: Fixture }).fixture = value; }, options);
  await page.addScriptTag({ content: script });
  await page.locator('#recovery-dialog').waitFor();
  return page;
}
const evaluate = <T>(page: Page, expression: string): Promise<T> => page.evaluate(expression);
const count = (page: Page, value: number) => expect(page.locator('.recovery-count')).toHaveText(`${value} 条待检查记录`);

test('compact keyboard recovery closes through its real hit target, Escape and Later without deleting records', async () => {
  const page = await fixture({ records: [record('one', 'executing'), record('two')] });
  try {
    await count(page, 2);
    await expect(page.getByRole('heading', { name: '待检查的修改' })).toBeVisible();
    await expect(page.getByRole('button', { name: '查看详情' })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByText('HTTP_502', { exact: true })).toBeHidden();
    const bounds = (await page.locator('dialog').boundingBox())!;
    assert.equal(bounds.width, 400);
    assert.ok(bounds.height < 280);
    assert.equal(bounds.x, (1440 - bounds.width) / 2);
    assert.equal(bounds.y, (900 - bounds.height) / 2);
    assert.equal(await evaluate(page, 'harness.readCount'), 1);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(page.locator('dialog')).toHaveCount(0);
    assert.deepEqual(await evaluate(page, 'harness.actions'), []);
    assert.equal(await evaluate(page, 'harness.records.length'), 2);
    await evaluate(page, 'harness.open()');
    await count(page, 2);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog')).toHaveCount(0);
    await evaluate(page, 'harness.open()');
    await count(page, 2);
    await page.getByRole('button', { name: '稍后处理' }).click();
    await expect(page.locator('dialog')).toHaveCount(0);
    assert.deepEqual(await evaluate(page, 'harness.actions'), []);
  } finally { await page.close(); }
});

test('loading and read errors never claim an empty or complete recovery count', async () => {
  const page = await fixture({ holdRefresh: true, holdReads: true });
  try {
    await expect(page.locator('.recovery-count')).toHaveText('正在读取记录…');
    assert.equal(await evaluate(page, 'harness.readCount'), 0);
    await evaluate(page, 'harness.resolveRefresh()');
    await expect.poll(() => evaluate(page, 'harness.reads.length')).toBe(1);
    await expect(page.locator('.recovery-count')).toHaveText('正在读取记录…');
    await evaluate(page, 'harness.rejectRead(0,"KEYBOARD_READ_FAILED")');
    await expect(page.locator('.recovery-count')).toHaveText('部分记录暂时无法读取');
    await expect(page.getByText('暂无待处理记录')).toHaveCount(0);
    await expect(page.getByRole('alert')).toBeHidden();
    await page.getByRole('button', { name: '查看详情' }).click();
    await expect(page.getByRole('alert')).toContainText('KEYBOARD_READ_FAILED');
    await evaluate(page, 'harness.legacyError="INDEXEDDB_READ_FAILED";harness.publish()');
    await expect(page.getByRole('alert')).toContainText('INDEXEDDB_READ_FAILED');
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(page.locator('dialog')).toHaveCount(0);
  } finally { await page.close(); }
});

test('closing during a read leaves records intact and a late response cannot update a reopened dialog', async () => {
  const page = await fixture({ records: [record('current')], holdReads: true });
  try {
    await expect.poll(() => evaluate(page, 'harness.reads.length')).toBe(1);
    await page.getByRole('button', { name: '稍后处理' }).click();
    await expect(page.locator('dialog')).toHaveCount(0);
    await evaluate(page, 'harness.open()');
    await expect.poll(() => evaluate(page, 'harness.reads.length')).toBe(2);
    await evaluate(page, `harness.resolveRead(0,${JSON.stringify([record('stale'), record('old')])})`);
    await expect(page.locator('.recovery-count')).toHaveText('正在读取记录…');
    await evaluate(page, `harness.resolveRead(1,${JSON.stringify([record('current')])})`);
    await count(page, 1);
    await page.getByRole('button', { name: '查看详情' }).click();
    await expect(page.locator('[data-keyboard-recovery="current"]')).toBeVisible();
    await expect(page.locator('[data-keyboard-recovery="stale"]')).toHaveCount(0);
    assert.deepEqual(await evaluate(page, 'harness.actions'), []);
    assert.equal(await evaluate(page, 'harness.records.length'), 1);
  } finally { await page.close(); }
});

test('successful marking rejects stale reads, updates the shared count and allows explicit reimport', async () => {
  const one = record('one'), two = record('two');
  const page = await fixture({ records: [one, two], holdMarks: true });
  try {
    await count(page, 2);
    await page.getByRole('button', { name: '查看详情' }).click();
    await evaluate(page, 'harness.holdReads=true;harness.publish()');
    await expect.poll(() => evaluate(page, 'harness.reads.length')).toBe(1);
    await page.locator('[data-keyboard-recovery="one"]').getByRole('button', { name: '标记已处理' }).click();
    await count(page, 2);
    await evaluate(page, 'harness.resolveMark()');
    await expect.poll(() => evaluate(page, 'harness.reads.length')).toBe(2);
    await count(page, 1);
    await evaluate(page, `harness.resolveRead(1,${JSON.stringify([two])});harness.resolveRead(0,${JSON.stringify([one, two])})`);
    await count(page, 1);
    await expect(page.locator('[data-keyboard-recovery="one"]')).toHaveCount(0);
    await evaluate(page, `harness.holdReads=false;harness.importRecord(${JSON.stringify(one)})`);
    await count(page, 2);
    await expect(page.locator('[data-keyboard-recovery="one"]')).toBeVisible();
    await evaluate(page, 'harness.holdMarks=false');
    await page.locator('[data-keyboard-recovery="one"]').getByRole('button', { name: '标记已处理' }).click();
    await page.locator('[data-keyboard-recovery="two"]').getByRole('button', { name: '标记已处理' }).click();
    await expect(page.locator('.recovery-count')).toHaveText('暂无待处理记录');
    await expect(page.getByRole('region', { name: '待检查的快捷键操作' })).toHaveCount(0);
    await expect(page.locator('dialog')).toBeVisible();
  } finally { await page.close(); }
});

test('expanded narrow dialog keeps header and footer reachable while only details scroll', async () => {
  const page = await fixture({ legacy: [ordinary], records: Array.from({ length: 20 }, (_, index) => record(String(index), index ? 'queued' : 'executing')) }, { width: 360, height: 640 });
  try {
    await count(page, 21);
    await page.getByRole('button', { name: '查看详情' }).click();
    const details = page.locator('#recovery-dialog-details');
    await expect(details).toBeVisible();
    await expect(page.locator('#recovery-list')).toHaveCSS('position', 'static');
    await expect(details).toHaveCSS('overscroll-behavior', 'none');
    assert.ok(await details.evaluate(element => element.scrollHeight > element.clientHeight));
    const close = page.getByRole('button', { name: '关闭', exact: true });
    const headerBefore = await close.boundingBox();
    const footerBefore = await page.getByRole('button', { name: '稍后处理' }).boundingBox();
    await details.evaluate(element => { element.scrollTop = element.scrollHeight; });
    assert.deepEqual(await close.boundingBox(), headerBefore);
    assert.deepEqual(await page.getByRole('button', { name: '稍后处理' }).boundingBox(), footerBefore);
    assert.ok((await page.locator('dialog').boundingBox())!.height <= 448.5);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await close.click();
    await expect(page.locator('dialog')).toHaveCount(0);
    assert.deepEqual(await evaluate(page, 'harness.actions'), []);
  } finally { await page.close(); }
});

test('details preserve individual export, inspect and recovery actions and their busy close policy', async () => {
  const page = await fixture({ legacy: [ordinary], records: [record('one')], holdOrdinary: true });
  try {
    await count(page, 2);
    await page.getByRole('button', { name: '查看详情' }).click();
    await page.getByRole('button', { name: '导出完整草稿' }).click();
    await page.getByRole('button', { name: '导出记录' }).click();
    await expect.poll(() => evaluate(page, 'harness.downloads.length')).toBe(2);
    const downloads = await evaluate<{ name: string; raw: string }[]>(page, 'harness.downloads');
    assert.deepEqual(downloads.map(item => item.name), ['notale-recovery.json', 'notale-keyboard-recovery.json']);
    assert.equal(JSON.parse(downloads[1].raw).keyboard[0].id, 'one');
    await page.getByRole('button', { name: '打开恢复副本' }).click();
    await expect(page.getByRole('button', { name: '稍后处理' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog')).toBeVisible();
    await evaluate(page, 'harness.resolveOrdinary()');
    await expect(page.getByRole('button', { name: '稍后处理' })).toBeEnabled();
    await page.getByRole('button', { name: '查看原页面' }).click();
    await expect(page.locator('dialog')).toHaveCount(0);
    assert.deepEqual(await evaluate(page, 'harness.actions'), ['export:saved:one', 'recover:saved:one', 'inspect:one']);
    await evaluate(page, 'harness.holdInspect=true;harness.open()');
    await count(page, 2);
    await page.getByRole('button', { name: '查看详情' }).click();
    await page.getByRole('button', { name: '查看原页面' }).click();
    await expect(page.getByRole('button', { name: '关闭', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '稍后处理' }).click();
    await expect(page.locator('dialog')).toHaveCount(0);
  } finally { await page.close(); }
});

test('English summary uses the same count and disclosure behavior', async () => {
  const page = await fixture({ records: [record('one')], english: true });
  try {
    await expect(page.getByRole('heading', { name: 'Edits to review' })).toBeVisible();
    await expect(page.locator('.recovery-count')).toHaveText('1 record to review');
    await page.getByRole('button', { name: 'View details' }).click();
    await expect(page.getByRole('button', { name: 'Hide details' })).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('button', { name: 'Later' }).click();
    await expect(page.locator('dialog')).toHaveCount(0);
  } finally { await page.close(); }
});
