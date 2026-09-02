import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chromium } from "/tmp/notale-playwright/node_modules/playwright/index.mjs";

const URL = "http://127.0.0.1:41031/sample-workbench/mini/page-3d/population-mountains/candidate/pages/";
const SHOTS = "experiments/workflow-skills-next/sample-workbench/mini/page-3d/population-mountains/shots";
const browser = await chromium.launch({ headless:true });
const results = [];
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const cameraNear = (actual, expected, tolerance = .02) =>
  actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance);

const probe = `<script>
window.__populationProbe={geometryDisposals:0,materialDisposals:0,rendererDisposals:0,contextLosses:0};
for(const [prototype,key] of [[THREE.BufferGeometry.prototype,"geometryDisposals"],[THREE.Material.prototype,"materialDisposals"]]){
  const original=prototype.dispose;
  prototype.dispose=function(...args){__populationProbe[key]++;return original.apply(this,args)};
}
const OriginalRenderer=THREE.WebGLRenderer;
THREE.WebGLRenderer=function(...args){
  const renderer=new OriginalRenderer(...args);
  const render=renderer.render;
  renderer.render=function(scene,camera){
    const mesh=scene.children.find(object=>object.isInstancedMesh);
    __populationProbe.scene={
      children:scene.children.map(object=>object.type),
      camera:{position:camera.position.toArray(),up:camera.up.toArray()},
      instances:mesh?.count,
      matrices:mesh?Array.from(mesh.instanceMatrix.array):[],
      colors:mesh?.instanceColor?Array.from(mesh.instanceColor.array):[],
      geometry:mesh?.geometry?.parameters,
      castShadow:mesh?.castShadow,
      receiveShadow:mesh?.receiveShadow
    };
    return render.apply(this,arguments);
  };
  const dispose=renderer.dispose;
  renderer.dispose=function(...args){__populationProbe.rendererDisposals++;return dispose.apply(this,args)};
  const lose=renderer.forceContextLoss;
  renderer.forceContextLoss=function(...args){__populationProbe.contextLosses++;return lose.apply(this,args)};
  return renderer;
};
THREE.WebGLRenderer.prototype=OriginalRenderer.prototype;
</script>`;

async function open(options = {}) {
  const context = await browser.newContext({
    viewport:options.viewport || { width:1600, height:900 },
    reducedMotion:options.reduced ? "reduce" : "no-preference"
  });
  if (options.abortData) {
    await context.route("**/population-data.js", route => route.abort());
  }
  await context.route(URL, async route => {
    const response = await route.fetch();
    let html = await response.text();
    const injection = options.forceFallback
      ? `<script>THREE.WebGLRenderer=function(){throw Error("forced fallback")}</script>`
      : probe;
    html = html.replace('<script src="assets/page.js"></script>',
      `${injection}<script src="assets/page.js"></script>`);
    await route.fulfill({ response, body:html, contentType:"text/html" });
  });
  const page = await context.newPage();
  const errors = [];
  const failed = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("requestfailed", request => failed.push(request.url()));
  await page.goto(URL, { waitUntil:"networkidle" });
  if (options.forceFallback || options.abortData) {
    await page.waitForSelector("#fallback:not([hidden])");
  } else {
    await page.waitForFunction(() => window.__populationProbe?.scene?.instances === 4732);
  }
  return { context, page, errors, failed };
}

const canonical = await open();
const mesh = await canonical.page.evaluate(() => __populationProbe.scene);
assert.equal(mesh.instances, 4732);
assert.deepEqual(mesh.geometry, { width:.88, height:1, depth:.88,
  widthSegments:1, heightSegments:1, depthSegments:1 });
assert.equal(mesh.castShadow, true);
assert.equal(mesh.receiveShadow, true);
assert.equal(hash(mesh.matrices), "c843a0bde0240309205306b9b57b4416270037d484fe4b7eff51bce766a7e219");
assert.equal(hash(mesh.colors), "42ba884bf57250040630d3d524bb5bac47a9816523409862870e79f60e4fd132");
assert.deepEqual(mesh.camera.position, [0, 160, .01]);
assert.deepEqual(mesh.camera.up, [0, 0, -1]);
assert.deepEqual(canonical.errors, []);
assert.deepEqual(canonical.failed, []);
results.push("4,732 exact InstancedMesh matrices/colors and top camera match the full sample");

await canonical.page.locator('button[data-view="profile"]').click();
await canonical.page.waitForTimeout(675);
const middle = await canonical.page.evaluate(() => __populationProbe.scene.camera.position);
assert.ok(middle[0] > 0 && middle[0] < 105);
assert.ok(middle[1] < 160 && middle[1] > 34);
assert.ok(middle[2] > .01 && middle[2] < 122);
await canonical.page.waitForTimeout(800);
assert.ok(cameraNear(await canonical.page.evaluate(() => __populationProbe.scene.camera.position), [105, 34, 122]));
assert.equal(await canonical.page.locator('button[data-view="profile"]').getAttribute("aria-pressed"), "true");

const top = canonical.page.locator('button[data-view="top"]');
await top.focus();
await canonical.page.keyboard.press("Enter");
await canonical.page.waitForTimeout(1450);
assert.ok(cameraNear(await canonical.page.evaluate(() => __populationProbe.scene.camera.position), [0, 160, .01]));
await canonical.page.locator('button[data-view="profile"]').click();
await canonical.page.waitForTimeout(1450);
await canonical.page.locator('[data-reset]').click();
await canonical.page.waitForTimeout(1450);
assert.ok(cameraNear(await canonical.page.evaluate(() => __populationProbe.scene.camera.position), [0, 160, .01]));
await canonical.page.screenshot({ path:`${SHOTS}/1600-top-reset.png` });
results.push("pointer and keyboard traverse midpoint/endpoints; Reset returns the exact top camera");
await canonical.context.close();

for (const [width, height] of [[1600, 900], [1280, 720]]) {
  const run = await open({ viewport:{ width, height } });
  const stage = await run.page.locator("#stage").boundingBox();
  assert.ok(Math.abs(stage.width - width) < .01);
  assert.ok(Math.abs(stage.height - height) < .01);
	assert.deepEqual(await run.page.evaluate(() => [
		document.documentElement.scrollWidth, document.documentElement.scrollHeight
	]), [width, height]);
	assert.equal(await run.page.evaluate(() => getComputedStyle(document.body).overflow), "hidden");
	await run.page.locator('button[data-view="profile"]').click();
  await run.page.waitForTimeout(1450);
  await run.page.screenshot({ path:`${SHOTS}/${width}-profile.png` });
  assert.deepEqual(run.errors, []);
  assert.deepEqual(run.failed, []);
  await run.context.close();
}
results.push("1600x900 and 1280x720 resize without overflow and retain the profile scene");

const reduced = await open({ reduced:true });
assert.equal(await reduced.page.locator("#scene").getAttribute("data-view"), "profile");
assert.deepEqual(await reduced.page.evaluate(() => __populationProbe.scene.camera.position), [105, 34, 122]);
await reduced.page.locator('button[data-view="top"]').click();
assert.ok(cameraNear(await reduced.page.evaluate(() => __populationProbe.scene.camera.position), [0, 160, .01]));
await reduced.page.screenshot({ path:`${SHOTS}/1600-reduced.png` });
assert.deepEqual(reduced.errors, []);
await reduced.context.close();
results.push("reduced motion opens on decisive profile and changes views without travel");

const fallback = await open({ forceFallback:true });
assert.match(await fallback.page.locator("#fallback").innerText(), /50,299/);
const chartEvidence = await fallback.page.locator("#fallbackChart").evaluate(chart => {
  const pixels = chart.getContext("2d").getImageData(0, 0, chart.width, chart.height).data;
  return pixels.some(value => value !== 0);
});
assert.equal(chartEvidence, true);
assert.match(await fallback.page.locator("#stats").innerText(), /4,732[\s\S]*14,807,951/);
assert.deepEqual(fallback.errors, []);
await fallback.page.screenshot({ path:`${SHOTS}/fallback-renderer.png` });
await fallback.context.close();
results.push("forced renderer failure derives a visible 93-column profile from the same frozen cells");

const noData = await open({ abortData:true });
assert.equal(await noData.page.locator("#stats").innerText(), "本地人口字段无法读取");
assert.equal(noData.failed.length, 1);
assert.deepEqual(noData.errors.filter(message => !message.includes("ERR_FAILED")), []);
await noData.context.close();
results.push("dataset failure produces an explicit readable fallback instead of a blank frame");

const lifecycle = await open();
await lifecycle.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
const disposed = await lifecycle.page.evaluate(() => ({
  probe:__populationProbe,
  handler:document.querySelector("nav").onclick,
  view:document.querySelector("#scene").dataset.view
}));
assert.equal(disposed.handler, null);
assert.ok(disposed.probe.geometryDisposals >= 3);
assert.ok(disposed.probe.materialDisposals >= 3);
assert.equal(disposed.probe.rendererDisposals, 1);
assert.equal(disposed.probe.contextLosses, 1);
await lifecycle.page.locator('button[data-view="profile"]').click();
assert.equal(await lifecycle.page.locator("#scene").getAttribute("data-view"), disposed.view);
await lifecycle.page.reload({ waitUntil:"networkidle" });
await lifecycle.page.waitForFunction(() => window.__populationProbe?.scene?.instances === 4732);
assert.equal(await lifecycle.page.locator("#gl").count(), 1);
assert.equal(await lifecycle.page.evaluate(() => __populationProbe.scene.instances), 4732);
assert.deepEqual(lifecycle.errors, []);
assert.deepEqual(lifecycle.failed, []);
await lifecycle.context.close();
results.push("pagehide disposes Three resources and inputs; reload restores one clean 4,732-cell scene");

console.log(JSON.stringify({ passed:true, results }, null, 2));
await browser.close();
