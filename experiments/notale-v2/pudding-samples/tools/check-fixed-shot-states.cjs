// Regression for the two repaired catalog recipes, not a production gate.
const { chromium } = require('/tmp/notale-playwright/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const origin = process.env.SAMPLE_ORIGIN || 'http://localhost:41992';
const recipes = JSON.parse(fs.readFileSync(path.join(__dirname, 'promoted-shot-states.json')));

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    for (const width of [1600, 1280, 390]) {
      for (const [workflow, id] of [
        ['build-interaction', 'photo-history-quiz'],
        ['build-page', 'masked-wrestler-index'],
      ]) {
        const catalog = JSON.parse(fs.readFileSync(path.join(root, 'workflows', workflow, 'samples/catalog.json')));
        const row = catalog.samples.find(s => s.id === id);
        assert.equal(row.shots[1].after, recipes[id][1]);
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(`${origin}/${workflow}/${row.full.root}/index.html`);
        await page.waitForFunction(id => id === 'photo-history-quiz' ? window.photoQuiz : window.wrestling, id);
        await page.evaluate(row.shots[1].after);
        await page.waitForTimeout(row.shots[1].wait);
        if (id === 'photo-history-quiz') {
          assert.deepEqual(await page.evaluate(() => ({
            index: photoQuiz.index, answers: photoQuiz.answers.length,
            resultsHidden: document.querySelector('#results').hidden,
          })), { index: 5, answers: 5, resultsHidden: false });
          assert(await page.locator('#results').isVisible());
          assert.equal(await page.locator('.pair-row').count(), 2);
        } else {
          assert(await page.locator('#info').isVisible());
          assert.equal(await page.locator('#more').getAttribute('aria-expanded'), 'true');
          assert.equal(await page.locator('#description').isVisible(), false);
          assert(await page.locator('#info').evaluate(el => {
            const rect = el.getBoundingClientRect();
            return rect.top >= 0 && rect.bottom <= innerHeight;
          }), 'identity evidence must be inside the screenshot, not below the fold');
        }
        assert.deepEqual(errors, []);
        console.log(`${id} ${width}: intended second state reached`);
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
