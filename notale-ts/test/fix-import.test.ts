import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importProblems } from '../src/fix/istar.js';

test('the fix agent is told when a page points at a file the lecture does not have', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'notale-fix-'));
  try {
    await mkdir(join(dir, 'assets/img'), { recursive: true });
    await writeFile(join(dir, 'assets/base.css'), 'body{background:url(img/bg.png)}');
    await writeFile(join(dir, 'assets/img/bg.png'), 'png');
    await writeFile(join(dir, 'page-01.html'), '<link rel="stylesheet" href="assets/base.css"><main id="stage"><h1>标题</h1><img src="assets/img/gone.png"></main>');
    await writeFile(join(dir, '.scratch.html'), '<img src="nowhere.png">');
    assert.deepEqual(await importProblems(dir), ['page-01.html 引用的 assets/img/gone.png 不存在']);
    await writeFile(join(dir, 'assets/img/gone.png'), 'png');
    assert.deepEqual(await importProblems(dir), []);
    // A code workbench whose lesson marker is gone is refused, as the editor refuses it.
    await writeFile(join(dir, 'page-02.html'), '<main id="stage"><iframe class="code-workbench-frame" src="assets/lessons/page-02/index.html"></iframe></main>');
    await mkdir(join(dir, 'assets/lessons/page-02'), { recursive: true });
    await writeFile(join(dir, 'assets/lessons/page-02/index.html'), '<p>host</p>');
    assert.deepEqual(await importProblems(dir), ['page-02.html 的代码工作台指向的课程 assets/lessons/page-02/index.html 不存在']);
    await rm(join(dir, 'page-02.html'));
    await rm(join(dir, 'page-01.html'));
    assert.deepEqual(await importProblems(dir), ['讲义里没有页面（page-NN.html）']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
