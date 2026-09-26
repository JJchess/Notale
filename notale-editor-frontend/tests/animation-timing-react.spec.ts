import {test,expect,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
const ready = (page: Page) => page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
const version = (page: Page) => page.evaluate(() => (window as any).NotaleWorkbench.getSnapshot().version);
async function change(page: Page, action: () => Promise<unknown>) {
  const before = await version(page);
  await action();
  await expect.poll(() => version(page), { timeout: 15000 }).toBeGreaterThan(before);
  await ready(page);
}

test('animation timing bars follow shared playback order through edits and reopen', async ({ page }) => {
  const doc={id:randomUUID(),schemaVersion:1,title:'动画交互验证',width:1600,height:900,slides:[{id:'first',name:'第一页',sourcePath:'first.html',html:'<html><body><h1 data-notale-id="heading">集成学习</h1></body></html>'}]};
  expect((await page.request.post('/api/documents',{data:doc})).status()).toBe(201);
  await page.goto('/?document=' + doc.id);
  await expect(page.locator('#save-status')).toContainText('已保存');
  await ready(page);
  const target = await page.frameLocator('#canvas').locator('h1').first().getAttribute('data-notale-id');
  await page.evaluate(id => (window as any).NotaleWorkbench.select(id), target);
  await page.locator('[data-tool="animation"]').click();
  const animations = () => page.evaluate(() => (window as any).NotaleWorkbench.getSnapshot().document.slides[0].animations);
  // Effects are applied from the sidebar library; duration and delay are edited in seconds on the selected cue.
  const addPulse = async (count: number, trigger: string | undefined, duration: string, delay: string) => {
    if (count > 1) await page.locator('#new-animation').click();
    await page.locator('[data-animation-category="emphasis"]').click();
    await page.locator('[data-animation-effect="pulse"]').click();
    await expect.poll(async () => (await animations()).length).toBe(count); await ready(page);
    if (trigger) { await page.locator('#trigger').selectOption(trigger); await expect.poll(async () => (await animations())[count - 1].trigger).toBe(trigger); }
    await page.locator('#duration').fill(duration); await page.locator('#duration').press('Tab');
    await expect.poll(async () => (await animations())[count - 1].duration).toBe(Math.round(Number(duration) * 1000));
    await page.locator('#delay').fill(delay); await page.locator('#delay').press('Tab');
    await expect.poll(async () => (await animations())[count - 1].delay ?? 0).toBe(Math.round(Number(delay) * 1000));
    await ready(page);
  };
  await addPulse(1, undefined, '0.6', '0.2');
  await addPulse(2, 'after-previous', '0.4', '0.1');
  await addPulse(3, 'with-previous', '0.2', '0');
  const labels = page.locator('.animation-time-label');
  await expect(labels).toHaveText(['步骤开始后 0.2 秒–0.8 秒', '步骤开始后 0.9 秒–1.3 秒', '步骤开始后 0.9 秒–1.1 秒']);
  await expect(page.locator('.animation-row .animation-object').first()).toContainText('集成学习');
  const track = page.locator('.animation-track').first();
  await track.scrollIntoViewIfNeeded();
  let rect = (await track.boundingBox())!;
  const beforeDrag = await version(page);
  await page.mouse.move(rect.x + rect.width * .3, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * .4, rect.y + rect.height / 2, { steps: 4 });
  expect(await version(page)).toBe(beforeDrag);
  await page.keyboard.press('Escape'); await page.mouse.up();
  expect(await version(page)).toBe(beforeDrag);
  await change(page, async () => {
    await page.mouse.move(rect.x + rect.width * .3, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width * .4, rect.y + rect.height / 2, { steps: 4 });
    await page.mouse.up();
  });
  expect(await version(page)).toBe(beforeDrag + 1);
  await expect(labels.first()).toHaveText('步骤开始后 0.35 秒–0.95 秒');
  await expect(track).toBeFocused();
  await change(page, () => page.keyboard.press('Control+z'));
  await expect(labels.first()).toHaveText('步骤开始后 0.2 秒–0.8 秒');
  await track.focus();await change(page,()=>page.keyboard.press('Control+Shift+z'));await expect(labels.first()).toHaveText('步骤开始后 0.35 秒–0.95 秒');
  await change(page,()=>page.keyboard.press('Control+z'));
  const bar = (await track.locator('span').boundingBox())!;
  rect = (await track.boundingBox())!;
  await change(page, async () => {
    await page.mouse.move(bar.x + bar.width - 2, bar.y + bar.height / 2);
    await page.mouse.down();
    await page.mouse.move(bar.x + bar.width - 2 + rect.width * .1, bar.y + bar.height / 2, { steps: 4 });
    await page.mouse.up();
  });
  await expect(labels.first()).toHaveText('步骤开始后 0.2 秒–0.95 秒');
  await change(page, () => page.keyboard.press('Control+z'));
  await track.focus();
  await change(page, () => page.keyboard.press('Shift+ArrowRight'));
  await expect(labels.first()).toHaveText('步骤开始后 0.2 秒–0.85 秒');
  await change(page, () => page.keyboard.press('Control+z'));

  await page.locator('.animation-track').nth(1).click();
  await expect(page.locator('#duration')).toHaveValue('0.4');
  await change(page, async () => { await page.locator('#duration').fill('0.8'); await page.locator('#duration').press('Tab'); });
  await expect(labels.nth(1)).toHaveText('步骤开始后 0.9 秒–1.7 秒');
  await change(page, () => page.locator('[data-up-animation]').nth(1).click());
  await expect(labels).toHaveText(['步骤开始后 0.1 秒–0.9 秒', '步骤开始后 0.2 秒–0.8 秒', '步骤开始后 0.2 秒–0.4 秒']);
  await page.reload(); await ready(page);
  await page.locator('[data-tool="animation"]').click();
  await expect(labels).toHaveText(['步骤开始后 0.1 秒–0.9 秒', '步骤开始后 0.2 秒–0.8 秒', '步骤开始后 0.2 秒–0.4 秒']);
  await page.locator('.animation-track').first().click();
  await page.locator('#trigger').selectOption('object');
  await change(page, () => page.locator('#trigger-target').selectOption(target!));
  await page.locator('.animation-track').nth(1).click();
  await change(page, () => page.locator('#trigger').selectOption('with-previous'));
  await expect(labels).toHaveText(['点击「集成学习」后 0.1 秒–0.9 秒', '点击「集成学习」后 0.3 秒–0.9 秒', '点击「集成学习」后 0.3 秒–0.5 秒']);
  await page.reload(); await ready(page);
  await page.locator('[data-tool="animation"]').click();
  await expect(labels.nth(2)).toHaveText('点击「集成学习」后 0.3 秒–0.5 秒');
  await page.locator('#animations').scrollIntoViewIfNeeded();
  const firstObject=page.locator('.animation-object').first();await firstObject.focus();
  await change(page,()=>page.keyboard.press('Control+d'));await expect(page.locator('.animation-row')).toHaveCount(4);
  await page.locator('.animation-object').nth(1).focus();await change(page,()=>page.keyboard.press('Delete'));await expect(page.locator('.animation-row')).toHaveCount(3);
  const order=(await animations()).map((a:any)=>a.id);await page.locator('.animation-object').nth(1).focus();await change(page,()=>page.keyboard.press('Alt+ArrowUp'));expect((await animations())[0].id).toBe(order[1]);
});
