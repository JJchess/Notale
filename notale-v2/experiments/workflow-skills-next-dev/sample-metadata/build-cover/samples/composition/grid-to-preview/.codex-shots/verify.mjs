import { chromium } from '/tmp/grid-playwright/node_modules/playwright/index.mjs'
import { mkdir, writeFile } from 'node:fs/promises'

const root = new URL('./', import.meta.url)
const final = new URL('./final/', root)
await mkdir(final, { recursive:true })
const browser = await chromium.launch({ headless:true })
const failures = []
const runtime = { console:[], failed:[], http:[], external:[] }
const ok = (value, message) => { if (!value) failures.push(message) }
const track = page => {
  page.on('console', message => { if (message.type() === 'error') runtime.console.push(message.text()) })
  page.on('requestfailed', request => runtime.failed.push({ url:request.url(), error:request.failure()?.errorText }))
  page.on('response', response => { if (response.status() >= 400) runtime.http.push({ url:response.url(), status:response.status() }) })
  page.on('request', request => {
    const url = new URL(request.url())
    if (!['127.0.0.1','localhost'].includes(url.hostname)) runtime.external.push(request.url())
  })
}
const ready = async page => {
  await page.goto('http://127.0.0.1:4312/', { waitUntil:'networkidle' })
  await page.waitForSelector('body:not(.loading)')
}
const shot = (page, name) => page.screenshot({ path:new URL(name, final).pathname })
const hover = (page, index) => page.locator('.object').nth(index).hover({ position:{ x:20,y:20 } })
const leave = async (page, wait=650) => { await page.mouse.move(800,20); await page.waitForTimeout(wait) }
const state = page => page.evaluate(() => ({
  active:window.__cover?.active,
  body:[document.documentElement.scrollWidth,document.documentElement.scrollHeight,document.body.scrollWidth,document.body.scrollHeight],
  stage:document.querySelector('.stage').getBoundingClientRect().toJSON(),
  objects:[...document.querySelectorAll('.object')].map(node => {
    const css=getComputedStyle(node), rect=node.getBoundingClientRect()
    return { rect:rect.toJSON(), opacity:css.opacity, transform:css.transform, pressed:node.getAttribute('aria-pressed') }
  }),
  previews:[...document.querySelectorAll('.preview')].map(node => {
    const css=getComputedStyle(node), rect=node.getBoundingClientRect()
    return { className:node.className, rect:rect.toJSON(), opacity:css.opacity, transform:css.transform, name:node.querySelector('.preview-name').textContent, clip:getComputedStyle(node.querySelector('.masked-preview')).clipPath, visible:[...node.querySelectorAll('.preview-image')].filter(image => +getComputedStyle(image).opacity>.5).map(image => image.src.split('/').pop()) }
  }),
  broken:[...document.images].filter(image => !image.complete || !image.naturalWidth).map(image => image.src)
}))
const identity = value => value === 'none' || value === 'matrix(1, 0, 0, 1, 0, 0)'

const desktop = await browser.newPage({ viewport:{ width:1600,height:900 } })
track(desktop)
await ready(desktop)
let s = await state(desktop)
ok(s.body.every((value,i) => value === (i%2 ? 900 : 1600)), '1600 initial overflow')
ok(s.stage.x === 0 && s.stage.y === 0 && s.stage.width === 1600 && s.stage.height === 900, '1600 fixed canvas geometry')
ok(s.objects.length === 8 && !s.broken.length, 'eight loaded grid objects')
ok(s.objects.every(({rect},i) => Math.round(rect.width)===307 && Math.round(rect.height)===344 && Math.round(rect.x)===[66,453,840,1227][i%4] && Math.round(rect.y)===(i<4?100:524)), 'grid rhythm geometry')
await shot(desktop,'01-grid-1600x900.png')

await hover(desktop,0); await desktop.waitForTimeout(800)
s = await state(desktop)
ok(s.active===0 && +s.previews[1].opacity>.99 && +s.previews[0].opacity<.01, 'left card opens right preview')
ok(s.previews[1].name==='Candle holder' && s.objects.filter((_,i)=>[2,3,6,7].includes(i)).every(item=>+item.opacity<.01), 'right preview content and coordinated displacement')
await shot(desktop,'02-left-card-preview.png')
await leave(desktop)
s=await state(desktop)
ok(s.active===null && s.objects.every(item=>+item.opacity===1 && identity(item.transform)) && s.previews.every(item=>+item.opacity===0 && identity(item.transform)), 'hover exit exact reset')

await hover(desktop,3); await desktop.waitForTimeout(800)
s=await state(desktop)
ok(s.active===3 && +s.previews[0].opacity>.99 && +s.previews[1].opacity<.01, 'right card opens left preview')
ok(s.previews[0].name==='Wooden sidetable with smoke glass detail' && s.objects.filter((_,i)=>[0,1,4,5].includes(i)).every(item=>+item.opacity<.01), 'left preview content and coordinated displacement')
await shot(desktop,'03-right-card-preview.png')
await leave(desktop)

await hover(desktop,0); await desktop.waitForTimeout(350)
s=await state(desktop)
ok(+s.previews[1].opacity>.25 && +s.previews[1].opacity<.9 && s.previews[1].clip.startsWith('polygon('), 'preview intermediate frame')
await shot(desktop,'04-preview-midframe.png')
await leave(desktop)

await hover(desktop,0); await desktop.waitForTimeout(165); await leave(desktop,55); await hover(desktop,3); await desktop.waitForTimeout(165)
await shot(desktop,'05a-rapid-switch-crossing.png')
await desktop.waitForTimeout(500)
s=await state(desktop)
ok(s.active===3 && s.previews[0].name.includes('sidetable'), 'cross-side rapid switch target integrity')
await shot(desktop,'05b-rapid-switch-settled.png')
await leave(desktop)
s=await state(desktop)
ok(s.objects.every(item=>+item.opacity===1 && identity(item.transform)) && s.previews.every(item=>+item.opacity===0 && identity(item.transform)), 'cross-side rapid switch reset')
await shot(desktop,'05c-rapid-switch-restored.png')

await hover(desktop,0); await desktop.waitForTimeout(180); await hover(desktop,1); await desktop.waitForTimeout(700)
s=await state(desktop)
ok(s.active===1 && s.previews[1].name==='Cow vase' && s.previews[1].visible.every(name=>name.startsWith('product-2')), 'same-side rapid switch has correct image')
await leave(desktop)

await hover(desktop,0); await desktop.waitForTimeout(350); await leave(desktop,90); await hover(desktop,0); await desktop.waitForTimeout(700)
s=await state(desktop)
ok(s.active===0 && +s.previews[1].opacity>.99, 'mid-flight reverse is reversible')
await leave(desktop)

await desktop.locator('.object').nth(0).focus(); await desktop.waitForTimeout(600)
s=await state(desktop)
ok(s.active===0 && +s.previews[1].opacity>.99, 'keyboard focus preview')
await shot(desktop,'06-keyboard-focus.png')
await desktop.keyboard.press('Tab'); await desktop.waitForTimeout(600)
s=await state(desktop)
ok(s.active===1 && s.previews[1].name==='Cow vase', 'keyboard focus target switch')
await desktop.keyboard.press('Escape'); await desktop.waitForTimeout(650)
s=await state(desktop)
ok(s.active===null && s.objects.every(item=>+item.opacity===1 && identity(item.transform)), 'Escape reset')

await desktop.evaluate(() => window.__cover.open(4)); await desktop.waitForTimeout(650); await desktop.evaluate(() => window.__cover.close()); await desktop.waitForTimeout(650)
s=await state(desktop)
ok(s.active===null && s.objects.every(item=>+item.opacity===1 && identity(item.transform)), 'programmatic reset')

await desktop.evaluate(() => window.__cover.open(0)); await desktop.waitForTimeout(260)
await desktop.setViewportSize({ width:1280,height:720 }); await desktop.waitForTimeout(500)
s=await state(desktop)
ok(s.active===0 && s.stage.width===1280 && s.stage.height===720 && s.stage.x===0 && s.stage.y===0, 'resize while open preserves state and fit')
await desktop.setViewportSize({ width:1600,height:900 }); await desktop.evaluate(() => window.__cover.close()); await desktop.waitForTimeout(650)
s=await state(desktop)
ok(s.objects.every(item=>+item.opacity===1 && identity(item.transform)), 'resize return reset')

const compact = await browser.newPage({ viewport:{ width:1280,height:720 } })
track(compact); await ready(compact)
s=await state(compact)
ok(s.stage.width===1280 && s.stage.height===720 && s.body.every((value,i)=>value===(i%2?720:1280)), '1280 fixed canvas and no overflow')
await shot(compact,'07-grid-1280x720.png')
await hover(compact,0); await compact.waitForTimeout(800)
s=await state(compact)
ok(s.active===0 && +s.previews[1].opacity>.99, '1280 hover preview')
await shot(compact,'08-preview-1280x720.png')
await compact.close()

const touchContext = await browser.newContext({ viewport:{ width:1600,height:900 }, hasTouch:true })
const touch = await touchContext.newPage(); track(touch); await ready(touch)
let rect=await touch.locator('.object').nth(0).boundingBox(); await touch.touchscreen.tap(rect.x+20,rect.y+20); await touch.waitForTimeout(650)
s=await state(touch); ok(s.active===0 && +s.previews[1].opacity>.99, 'touch tap opens')
await shot(touch,'09-touch-open.png')
rect=await touch.locator('.object').nth(3).boundingBox(); await touch.touchscreen.tap(rect.x+20,rect.y+20); await touch.waitForTimeout(650)
s=await state(touch); ok(s.active===3 && +s.previews[0].opacity>.99, 'touch tap switches')
await shot(touch,'10-touch-switch.png')
rect=await touch.locator('.object').nth(3).boundingBox()
await touch.touchscreen.tap(rect.x+20,rect.y+20); await touch.waitForTimeout(800)
s=await state(touch); ok(s.active===null && s.objects.every(item=>+item.opacity===1 && identity(item.transform)), 'touch second tap resets')
await touchContext.close()

const reducedContext = await browser.newContext({ viewport:{ width:1600,height:900 }, reducedMotion:'reduce' })
const reduced = await reducedContext.newPage(); track(reduced); await ready(reduced)
await hover(reduced,0); await reduced.waitForTimeout(130)
s=await state(reduced)
ok(s.active===0 && +s.previews[1].opacity===1 && s.objects.filter((_,i)=>[2,3,6,7].includes(i)).every(item=>+item.opacity===0), 'reduced motion complete terminal preview')
ok(s.previews[1].visible.length===1 && s.previews[1].visible[0]==='product-1.webp', 'reduced motion stable first image')
await shot(reduced,'11-reduced-motion-terminal.png')
await leave(reduced,20)
s=await state(reduced); ok(s.active===null && s.objects.every(item=>+item.opacity===1 && identity(item.transform)), 'reduced motion instant reset')
await reducedContext.close()

await desktop.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide',{ persisted:false })))
await desktop.waitForTimeout(50)
s=await desktop.evaluate(() => ({ api:window.__cover, previews:[...document.querySelectorAll('.preview')].map(node=>getComputedStyle(node).opacity) }))
ok(s.api===undefined && s.previews.every(value=>+value===0), 'pagehide teardown')
await desktop.locator('.object').nth(0).hover(); await desktop.waitForTimeout(180)
s=await desktop.evaluate(() => [...document.querySelectorAll('.preview')].map(node=>getComputedStyle(node).opacity))
ok(s.every(value=>+value===0), 'pagehide removed interaction listeners')
await desktop.close()

ok(!runtime.console.length, 'zero console errors')
ok(!runtime.failed.length, 'zero failed requests')
ok(!runtime.http.length, 'zero HTTP errors')
ok(!runtime.external.length, 'zero external requests')
const result = { passed:failures.length===0, failures, runtime, testedAt:new Date().toISOString() }
await writeFile(new URL('verification.json', final), JSON.stringify(result,null,2))
await browser.close()
if (failures.length) { console.error(failures.join('\n')); process.exitCode=1 }
else console.log('PASS')
