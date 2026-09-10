import assert from "node:assert/strict";
import { chromium } from "/tmp/notale-playwright/node_modules/playwright/index.mjs";

const URL = "http://127.0.0.1:41031/sample-workbench/mini/page-general/rain-paths/candidate/pages/";
const SHOTS = "experiments/workflow-skills-next/sample-workbench/mini/page-general/rain-paths/shots";
const browser = await chromium.launch({ headless:true });
const results = [];

const probe = `window.__rainProbe={texture:0,material:0,geometry:0,renderer:0,context:0,loads:[]};
for(const [key,prototype] of [["texture",THREE.Texture.prototype],["material",THREE.Material.prototype],["geometry",THREE.BufferGeometry.prototype]]){
  const dispose=prototype.dispose;
  prototype.dispose=function(...args){__rainProbe[key]++;return dispose.apply(this,args)};
}
const originalLoad=THREE.TextureLoader.prototype.load;
THREE.TextureLoader.prototype.load=function(url,...args){__rainProbe.loads.push(url);return originalLoad.call(this,url,...args)};
const OriginalRenderer=THREE.WebGLRenderer;
THREE.WebGLRenderer=function(...args){
  const renderer=new OriginalRenderer(...args);
  const render=renderer.render;
  renderer.render=function(scene,camera){
    const mesh=scene.children[0];
    __rainProbe.scene={
      meshes:scene.children.length,
      scale:mesh.scale.toArray(),
      position:mesh.position.toArray(),
      progress:mesh.material.uniforms.progress.value,
      time:mesh.material.uniforms.time.value,
      surface:mesh.material.uniforms.surfaceTexture.value.image?.src || "",
      path:mesh.material.uniforms.pathTexture.value.image?.src || ""
    };
    return render.apply(this,arguments);
  };
  const dispose=renderer.dispose;
  renderer.dispose=function(...args){__rainProbe.renderer++;return dispose.apply(this,args)};
  const lose=renderer.forceContextLoss;
  renderer.forceContextLoss=function(...args){__rainProbe.context++;return lose.apply(this,args)};
  return renderer;
};
THREE.WebGLRenderer.prototype=OriginalRenderer.prototype;
`;

async function open(options = {}) {
  const context = await browser.newContext({
    viewport:options.viewport || { width:1600, height:900 },
    reducedMotion:options.reduced ? "reduce" : "no-preference"
  });
  const hook = options.hook || probe;
  await context.route("**/rain-paths.js", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body:hook + await response.text() });
  });
  const page = await context.newPage();
  const errors = [], failed = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => message.type() === "error" && errors.push(message.text()));
  page.on("requestfailed", request => failed.push(request.url()));
  await page.goto(URL, { waitUntil:"networkidle" });
  await page.waitForSelector(options.fallback ? "#stage.fallback" : "#stage.ok");
  return { context, page, errors, failed };
}

const selected = page => page.locator('.surface[aria-current]');
const normal = await open();
assert.equal(await normal.page.locator(".surface").count(), 3);
assert.equal(await selected(normal.page).innerText().then(text => text.includes("沥青路面")), true);
assert.deepEqual(await normal.page.evaluate(() => __rainProbe.loads.map(url => url.split("/").at(-1))), [
  "01-asphalt.svg", "01-asphalt-path.svg", "03-garden.svg",
  "03-garden-path.svg", "05-wetland.svg", "05-wetland-path.svg"
]);
assert.equal(await normal.page.evaluate(() => __rainProbe.scene.meshes), 1);

await normal.page.locator(".surface").nth(1).hover();
await normal.page.waitForFunction(() => __rainProbe.scene.progress > .98);
assert.match(await selected(normal.page).innerText(), /雨水花园/);
assert.match(await normal.page.evaluate(() => __rainProbe.scene.surface), /03-garden\.svg/);
assert.match(await normal.page.evaluate(() => __rainProbe.scene.path), /03-garden-path\.svg/);
await normal.page.screenshot({ path:`${SHOTS}/1600-garden-hover.png` });

await normal.page.locator(".surface").nth(1).click();
await normal.page.waitForFunction(() => __rainProbe.scene.scale[0] > 519);
assert.equal(await normal.page.locator("#stage").getAttribute("class").then(value => value.includes("on")), true);
assert.equal(await normal.page.locator(".detail h2").innerText(), "雨水花园");
assert.match(await normal.page.locator(".detail p").innerText(), /根系孔隙/);
await normal.page.screenshot({ path:`${SHOTS}/1600-garden-detail.png` });
await normal.page.locator(".close").click();
await normal.page.waitForFunction(() => !document.querySelector("#stage").classList.contains("on"));

await normal.page.locator(".reset").click();
for (const key of ["ArrowRight", "ArrowRight", "ArrowLeft"]) await normal.page.keyboard.press(key);
assert.match(await selected(normal.page).innerText(), /雨水花园/);
await normal.page.keyboard.press("Enter");
assert.equal(await normal.page.locator(".detail h2").innerText(), "雨水花园");
await normal.page.keyboard.press("Escape");

async function resetState(page) {
	await page.locator(".reset").click();
	await page.waitForTimeout(700);
  return page.evaluate(() => ({
    current:document.querySelector("[aria-current]").textContent.trim(),
    track:getComputedStyle(document.querySelector(".track")).transform,
    background:getComputedStyle(document.querySelector("#stage")).backgroundColor,
    position:__rainProbe.scene.position,
    scale:__rainProbe.scene.scale,
    progress:__rainProbe.scene.progress
  }));
}
assert.deepEqual(await resetState(normal.page), await resetState(normal.page));
assert.deepEqual(normal.errors, []);
assert.deepEqual(normal.failed, []);
results.push("three surfaces browse by pointer/rapid keys; garden hover shader, detail, keyboard and double Reset pass");
await normal.context.close();

for (const [width, height] of [[1600, 900], [1280, 720]]) {
	const run = await open({ viewport:{ width, height } });
	await run.page.waitForTimeout(700);
	const stage = await run.page.locator("#stage").boundingBox();
  assert.ok(Math.abs(stage.width - width) < .01 && Math.abs(stage.height - height) < .01);
  assert.equal(await run.page.evaluate(() => getComputedStyle(document.body).overflow), "hidden");
  await run.page.locator(".surface").nth(2).hover();
  await run.page.waitForFunction(() => __rainProbe.scene.progress > .98);
  await run.page.screenshot({ path:`${SHOTS}/${width}-wetland.png` });
  assert.deepEqual(run.errors, []);
  assert.deepEqual(run.failed, []);
  await run.context.close();
}
results.push("1600x900 and 1280x720 preserve the wetland shader state and contain the stage");

const reduced = await open({ reduced:true });
assert.equal(await reduced.page.evaluate(() => __rainProbe.scene.progress), 1);
await reduced.page.locator(".surface").nth(1).focus();
assert.match(await reduced.page.evaluate(() => __rainProbe.scene.surface), /03-garden\.svg/);
assert.equal(await reduced.page.evaluate(() => __rainProbe.scene.progress), 1);
await reduced.page.locator(".surface").nth(1).click();
assert.deepEqual(await reduced.page.evaluate(() => __rainProbe.scene.scale), [520, 720, 1]);
await reduced.page.screenshot({ path:`${SHOTS}/1600-reduced-detail.png` });
assert.deepEqual(reduced.errors, []);
await reduced.context.close();
results.push("reduced motion renders a decisive path and all garden detail geometry without interpolation");

const fallbackHook = `${probe}\nTHREE.WebGLRenderer=function(){throw Error("forced renderer failure")};`;
const fallback = await open({ hook:fallbackHook, fallback:true });
assert.equal(await fallback.page.locator(".surface img:visible").count(), 3);
assert.equal(await fallback.page.locator(".route").count(), 3);
assert.deepEqual(fallback.errors, []);
await fallback.page.screenshot({ path:`${SHOTS}/fallback-webgl.png` });
await fallback.context.close();
results.push("forced WebGL failure retains three ordered SVG surfaces and their route labels");

const partialHook = `${probe}\nlet forcedLoad=0;const realLoad=THREE.TextureLoader.prototype.load;
THREE.TextureLoader.prototype.load=function(url,onLoad,onProgress,onError){
  forcedLoad++;if(forcedLoad===3){const texture=new THREE.Texture();setTimeout(()=>onError(Error("forced texture failure")),0);return texture}
  return realLoad.call(this,url,onLoad,onProgress,onError)
};`;
const partial = await open({ hook:partialHook, fallback:true });
await partial.page.waitForFunction(() => __rainProbe.texture === 6);
assert.equal(await partial.page.locator(".surface img:visible").count(), 3);
assert.equal(await partial.page.evaluate(() => __rainProbe.texture), 6);
assert.equal(await partial.page.evaluate(() => __rainProbe.material), 0);
assert.deepEqual(partial.errors, []);
await partial.context.close();
results.push("third-texture failure releases all six allocated textures and retains the SVG relation");

const lifecycle = await open();
const before = await selected(lifecycle.page).innerText();
await lifecycle.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
assert.deepEqual(await lifecycle.page.evaluate(() => ({
  texture:__rainProbe.texture, material:__rainProbe.material, geometry:__rainProbe.geometry,
  renderer:__rainProbe.renderer, context:__rainProbe.context
})), { texture:6, material:1, geometry:1, renderer:1, context:1 });
await lifecycle.page.locator(".surface").nth(2).click();
assert.equal(await selected(lifecycle.page).innerText(), before);
await lifecycle.page.reload({ waitUntil:"networkidle" });
await lifecycle.page.waitForSelector("#stage.ok");
assert.equal(await lifecycle.page.locator("#gl").count(), 1);
assert.equal(await lifecycle.page.locator(".surface").count(), 3);
assert.deepEqual(lifecycle.errors, []);
assert.deepEqual(lifecycle.failed, []);
await lifecycle.context.close();
results.push("pagehide releases six textures/material/geometry/renderer/context; reload restores one clean scene");

console.log(JSON.stringify({ passed:true, results }, null, 2));
await browser.close();
